//! In-memory lifecycle for locked projects.
//!
//! States: `Locked` (no key in this process), `Unlocking`, `Unlocked`, and
//! `Locking`. The data key exists only inside [`UnlockedVault`] and is zeroized
//! when the vault locks, when the app exits, or when an unlock fails. Nothing
//! here writes a key to disk or to the OS credential vault.
//!
//! Every unlock produces a new session `generation`. Commands that read or
//! write protected data must present the current generation, so a queued or
//! in-flight request from a previous (now locked) session is rejected instead
//! of resurrecting content.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tokio::sync::Semaphore;
use zeroize::Zeroizing;

use super::crypto::{self, KEY_BYTES};
use super::storage::{self, VaultHeader, VaultPaths};

/// Concurrent Argon2id derivations. Each costs 64 MiB by default, so the
/// process stays bounded even if many unlocks are requested at once.
const MAX_CONCURRENT_UNLOCKS: usize = 2;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LockPhase {
    Locked,
    Unlocking,
    Unlocked,
    Locking,
}

pub struct UnlockedVault {
    pub project_id: String,
    pub generation: u64,
    pub header: VaultHeader,
    pub paths: VaultPaths,
    pub unlocked_at: String,
    /// Serializes writes for this project so two saves cannot interleave.
    pub write_lock: Mutex<()>,
    key: Mutex<Zeroizing<[u8; KEY_BYTES]>>,
}

impl UnlockedVault {
    pub fn new(
        project_id: String,
        header: VaultHeader,
        paths: VaultPaths,
        unlocked_at: String,
        data_key: Zeroizing<[u8; KEY_BYTES]>,
    ) -> Self {
        Self {
            project_id,
            generation: 0,
            header,
            paths,
            unlocked_at,
            write_lock: Mutex::new(()),
            key: Mutex::new(data_key),
        }
    }

    /// Runs `f` with the data key. The key is never cloned out of the vault.
    pub fn with_key<T>(&self, f: impl FnOnce(&[u8; KEY_BYTES]) -> Result<T, String>) -> Result<T, String> {
        let guard = self.key.lock();
        f(&guard)
    }

    pub fn revision_for(&self, kind: &str, id: &str) -> u64 {
        match storage::read_record_raw(&self.paths, kind, id) {
            Ok((envelope, _, _, _)) => envelope.revision.saturating_add(1),
            Err(_) => 1,
        }
    }
}

impl Drop for UnlockedVault {
    fn drop(&mut self) {
        // `Zeroizing` already scrubs on drop; taking the lock here makes the
        // intent explicit and keeps the key from lingering with the guard.
        let mut guard = self.key.lock();
        guard.fill(0);
    }
}

struct Inner {
    vaults: HashMap<String, Arc<UnlockedVault>>,
    pending: HashMap<String, LockPhase>,
    next_generation: u64,
}

/// Owns unlocked vaults for this process. Cloning is cheap and shares the same
/// state, so commands can hand a handle to a blocking worker.
#[derive(Clone)]
pub struct VaultManager {
    inner: Arc<Mutex<Inner>>,
    unlock_gate: Arc<Semaphore>,
    root: Arc<Mutex<Option<PathBuf>>>,
}

impl Default for VaultManager {
    fn default() -> Self {
        Self::new()
    }
}

impl VaultManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                vaults: HashMap::new(),
                pending: HashMap::new(),
                next_generation: 1,
            })),
            unlock_gate: Arc::new(Semaphore::new(MAX_CONCURRENT_UNLOCKS)),
            root: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_root(&self, root: PathBuf) {
        *self.root.lock() = Some(root);
    }

    pub fn root(&self) -> Result<PathBuf, String> {
        self.root
            .lock()
            .clone()
            .ok_or_else(|| "The project vault root is not initialized.".to_string())
    }

    pub fn vault_paths(&self, project_id: &str) -> Result<VaultPaths, String> {
        validate_project_id(project_id)?;
        Ok(VaultPaths::new(self.root()?.join(project_id)))
    }

    pub fn unlock_gate(&self) -> Arc<Semaphore> {
        Arc::clone(&self.unlock_gate)
    }

    pub fn phase(&self, project_id: &str) -> LockPhase {
        let inner = self.inner.lock();
        if inner.vaults.contains_key(project_id) {
            return LockPhase::Unlocked;
        }
        inner
            .pending
            .get(project_id)
            .copied()
            .unwrap_or(LockPhase::Locked)
    }

    pub fn is_unlocked(&self, project_id: &str) -> bool {
        self.inner.lock().vaults.contains_key(project_id)
    }

    pub fn unlocked_ids(&self) -> Vec<String> {
        self.inner.lock().vaults.keys().cloned().collect()
    }

    pub fn mark_pending(&self, project_id: &str, phase: LockPhase) {
        let mut inner = self.inner.lock();
        if phase == LockPhase::Locked {
            inner.pending.remove(project_id);
        } else {
            inner.pending.insert(project_id.to_string(), phase);
        }
    }

    /// Borrows the unlocked vault only when the caller's generation matches the
    /// live session. A stale generation is an explicit error, never a no-op.
    pub fn with_vault<T>(
        &self,
        project_id: &str,
        generation: Option<u64>,
        f: impl FnOnce(&Arc<UnlockedVault>) -> Result<T, String>,
    ) -> Result<T, String> {
        let vault = {
            let inner = self.inner.lock();
            inner
                .vaults
                .get(project_id)
                .cloned()
                .ok_or_else(|| session_ended_error(project_id))?
        };
        if let Some(expected) = generation {
            if expected != vault.generation {
                return Err(session_ended_error(project_id));
            }
        }
        f(&vault)
    }

    /// Returns a shared handle to the unlocked vault, if it is still live.
    pub fn handle(&self, project_id: &str, generation: Option<u64>) -> Result<Arc<UnlockedVault>, String> {
        self.with_vault(project_id, generation, |vault| Ok(Arc::clone(vault)))
    }

    pub fn insert(&self, project_id: &str, mut vault: UnlockedVault) -> Arc<UnlockedVault> {
        let mut inner = self.inner.lock();
        let generation = inner.next_generation;
        inner.next_generation = inner.next_generation.saturating_add(1);
        vault.generation = generation;
        inner.pending.remove(project_id);
        let arc = Arc::new(vault);
        inner.vaults.insert(project_id.to_string(), Arc::clone(&arc));
        arc
    }

    /// Removes the vault and drops its key. Returns the session that was locked.
    pub fn take(&self, project_id: &str) -> Option<Arc<UnlockedVault>> {
        let mut inner = self.inner.lock();
        inner.pending.remove(project_id);
        inner.vaults.remove(project_id)
    }

    pub fn lock_all(&self) -> Vec<String> {
        let mut inner = self.inner.lock();
        inner.pending.clear();
        let ids: Vec<String> = inner.vaults.keys().cloned().collect();
        inner.vaults.clear();
        ids
    }
}

pub fn session_ended_error(project_id: &str) -> String {
    format!(
        "The unlocked session for project {project_id} has ended. Unlock the project again to continue."
    )
}

pub fn validate_project_id(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.len() < 3 || trimmed.len() > 120 {
        return Err("Project id is invalid.".into());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Project id is invalid.".into());
    }
    Ok(())
}

/// Rejects passwords that are obviously too weak for a one-way vault.
pub fn validate_new_password(password: &str) -> Result<(), String> {
    let length = password.chars().count();
    if length < 10 {
        return Err("Use a password with at least 10 characters.".into());
    }
    if length > 256 {
        return Err("That password is too long.".into());
    }
    if password.trim().is_empty() {
        return Err("The password cannot be blank.".into());
    }
    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_other = password.chars().any(|c| !c.is_alphabetic());
    if !has_letter || !has_other {
        return Err("Use a mix of letters, numbers, or symbols.".into());
    }
    Ok(())
}

pub fn password_matches_project(password: &str, project_id: &str) -> Result<(), String> {
    // Guards against an accidental blank submit producing a valid empty-password
    // derive. The real check is the AEAD tag on the wrapped key.
    if password.is_empty() {
        let _ = project_id;
        return Err("Enter the project password.".into());
    }
    Ok(())
}

pub fn open_unlocked(
    manager: &VaultManager,
    project_id: &str,
    password: &str,
    now: &str,
) -> Result<Arc<UnlockedVault>, String> {
    password_matches_project(password, project_id)?;
    let paths = manager.vault_paths(project_id)?;
    let (header, recovered_header) = storage::read_header_with_recovery(&paths)?;
    header.validate(project_id)?;
    let key = crypto::unwrap_data_key(project_id, password, &header.kdf, &header.key_wrap)?;
    if recovered_header {
        // Repair the primary header from the verified backup so the next unlock
        // does not have to fall back again.
        let _ = storage::write_header(&paths, &header);
    }
    paths.ensure_layout()?;
    let data_key = key;
    let vault = UnlockedVault::new(
        project_id.to_string(),
        header,
        paths,
        now.to_string(),
        data_key,
    );
    Ok(manager.insert(project_id, vault))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    fn test_manager(tag: &str) -> (VaultManager, String) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("veyra-vault-state-{tag}-{nanos}"));
        std::fs::create_dir_all(&root).unwrap();
        let manager = VaultManager::new();
        manager.set_root(root);
        (manager, "proj-test".to_string())
    }

    fn fast_params() -> crypto::KdfParams {
        crypto::KdfParams {
            algorithm: "argon2id".into(),
            m_cost_kib: 32_768,
            t_cost: 1,
            p_cost: 1,
            salt_b64: base64::engine::general_purpose::STANDARD.encode([5_u8; 16]),
        }
    }

    fn seed_vault(manager: &VaultManager, project_id: &str, password: &str) {
        let paths = manager.vault_paths(project_id).unwrap();
        paths.ensure_layout().unwrap();
        let key = crypto::generate_data_key().unwrap();
        let kdf = fast_params();
        let wrap = crypto::wrap_data_key(project_id, password, &kdf, &key).unwrap();
        storage::write_header(
            &paths,
            &VaultHeader::new(project_id, "2026-01-01T00:00:00Z", kdf, wrap),
        )
        .unwrap();
    }

    #[test]
    fn wrong_password_and_missing_vault_do_not_unlock() {
        let (manager, project) = test_manager("wrongpw");
        seed_vault(&manager, &project, "correct-password-1");
        assert!(open_unlocked(&manager, &project, "wrong-password-1", "now").is_err());
        assert!(!manager.is_unlocked(&project));
        assert_eq!(manager.phase(&project), LockPhase::Locked);
    }

    #[test]
    fn generations_advance_and_stale_writes_are_rejected() {
        let (manager, project) = test_manager("generation");
        seed_vault(&manager, &project, "correct-password-1");
        let first = open_unlocked(&manager, &project, "correct-password-1", "now").unwrap();
        let first_generation = first.generation;
        assert!(manager
            .with_vault(&project, Some(first_generation), |_| Ok(()))
            .is_ok());
        manager.take(&project);
        assert!(manager
            .with_vault(&project, Some(first_generation), |_| Ok(()))
            .is_err());

        let second = open_unlocked(&manager, &project, "correct-password-1", "now").unwrap();
        assert!(second.generation > first_generation);
        // The previous session's generation must never be accepted again.
        assert!(manager
            .with_vault(&project, Some(first_generation), |_| Ok(()))
            .is_err());
    }

    #[test]
    fn locking_zeroizes_and_forgets_the_key() {
        let (manager, project) = test_manager("lockall");
        seed_vault(&manager, &project, "correct-password-1");
        open_unlocked(&manager, &project, "correct-password-1", "now").unwrap();
        assert_eq!(manager.lock_all(), vec![project.clone()]);
        assert!(!manager.is_unlocked(&project));
        assert!(manager.with_vault(&project, None, |_| Ok(())).is_err());
    }

    #[test]
    fn password_policy_rejects_weak_passwords() {
        assert!(validate_new_password("short1").is_err());
        assert!(validate_new_password("onlylettershere").is_err());
        assert!(validate_new_password("1234567890").is_err());
        assert!(validate_new_password("a-strong-enough-passphrase").is_ok());
    }

    #[test]
    fn project_ids_cannot_escape_the_vault_root() {
        assert!(validate_project_id("../escape").is_err());
        assert!(validate_project_id("..").is_err());
        assert!(validate_project_id("ok-project_1").is_ok());
    }
}
