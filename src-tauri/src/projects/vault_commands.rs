//! Tauri commands for locked-project vaults.
//!
//! All protected reads and writes go through here, and every one of them is
//! authorised by the in-memory lifecycle: a locked project returns an error
//! rather than data, and a request carrying a stale session generation is
//! rejected. UI state is never the authority.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::vault::crypto::{self, KEY_BYTES};
use crate::vault::state::{
    self, validate_new_password, LockPhase, UnlockedVault, VaultManager,
};
use crate::vault::storage::{self, VaultHeader, VaultPaths, MAX_RECORD_BYTES};
use crate::projects::db::{self as project_db, ProjectDbState};

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn unb64(value: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|_| "Vault payload is not valid base64.".to_string())
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub project_id: String,
    pub phase: LockPhase,
    pub has_vault: bool,
    pub migration_state: Option<String>,
    /// Present only while unlocked. The frontend must include it in every
    /// protected call so a late request from a previous session is rejected.
    pub generation: Option<u64>,
    pub unlocked_at: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnlockResult {
    pub project_id: String,
    pub generation: u64,
    pub unlocked_at: String,
}

// ── Status ───────────────────────────────────────────────────────────────────

pub fn vault_status_inner(
    manager: &VaultManager,
    db_state: &ProjectDbState,
    project_id: &str,
) -> Result<VaultStatus, String> {
    state::validate_project_id(project_id)?;
    let paths = manager.vault_paths(project_id)?;
    let has_vault = paths.header().exists();
    let migration_state = db_state
        .with_connection(|conn| project_db::get_migration_state(conn, project_id))
        .unwrap_or(None);
    let phase = manager.phase(project_id);
    let (generation, unlocked_at) = match manager.phase(project_id) {
        LockPhase::Unlocked => manager
            .with_vault(project_id, None, |vault| Ok((Some(vault.generation), Some(vault.unlocked_at.clone()))))
            .unwrap_or((None, None)),
        _ => (None, None),
    };
    Ok(VaultStatus {
        project_id: project_id.to_string(),
        phase,
        has_vault,
        migration_state,
        generation,
        unlocked_at,
    })
}

#[tauri::command]
pub async fn get_project_vault_status(
    project_id: String,
    manager: State<'_, VaultManager>,
    db_state: State<'_, ProjectDbState>,
) -> Result<VaultStatus, String> {
    let manager = manager.inner().clone();
    let db_state = db_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        vault_status_inner(&manager, &db_state, &project_id)
    })
    .await
    .map_err(|error| format!("vault status task failed: {error}"))?
}

/// Startup call: reports every project that is currently unlocked in this
/// process. After a restart this is empty, which is how "start locked" happens.
#[tauri::command]
pub async fn list_unlocked_project_vaults(
    manager: State<'_, VaultManager>,
) -> Result<Vec<String>, String> {
    Ok(manager.inner().unlocked_ids())
}

// ── Enable lock (create the vault) ────────────────────────────────────────────

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContentPayload {
    pub name: String,
    pub description: String,
    pub kind: String,
    pub color: String,
    pub icon: String,
    pub system_prompt: String,
    pub settings_json: String,
    /// Protected conversations that belong to this project, already serialized.
    pub conversations_json: String,
    /// Project-scoped memory records, already serialized.
    pub memories_json: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnableLockResult {
    pub generation: u64,
    pub unlocked_at: String,
    pub migrated_conversations: usize,
    pub migrated_memories: usize,
}

#[tauri::command]
pub async fn enable_project_lock(
    project_id: String,
    password: String,
    payload: ProjectContentPayload,
    manager: State<'_, VaultManager>,
    db_state: State<'_, ProjectDbState>,
) -> Result<EnableLockResult, String> {
    validate_new_password(&password)?;
    state::validate_project_id(&project_id)?;

    let manager = manager.inner().clone();
    let db_state = db_state.inner().clone();
    let gate = manager.unlock_gate();
    let _permit = gate
        .acquire_owned()
        .await
        .map_err(|_| "Vault work is unavailable.".to_string())?;

    manager.mark_pending(&project_id, LockPhase::Unlocking);

    let task_project_id = project_id.clone();
    let manager_for_task = manager.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        enable_project_lock_inner(&manager_for_task, &db_state, &task_project_id, &password, payload)
    })
    .await
    .map_err(|error| format!("vault migration task failed: {error}"));

    let outcome = match result {
        Ok(inner) => inner,
        Err(error) => Err(error),
    };
    if outcome.is_err() {
        manager.mark_pending(&project_id, LockPhase::Locked);
    }
    outcome
}

fn enable_project_lock_inner(
    manager: &VaultManager,
    db_state: &ProjectDbState,
    project_id: &str,
    password: &str,
    payload: ProjectContentPayload,
) -> Result<EnableLockResult, String> {
    use project_db::{MIGRATION_CLEANUP_PENDING, MIGRATION_DONE, MIGRATION_STAGED};

    // The project must exist and must not already own a vault.
    let row = db_state.with_connection(|conn| project_db::get_project(conn, project_id.to_string()))?;
    if row.is_lock_enabled() {
        return Err("This project is already password-locked.".to_string());
    }
    let paths = manager.vault_paths(project_id)?;
    if paths.header().exists() {
        return Err(
            "A vault already exists for this project. Unlock it instead of enabling a new password."
                .to_string(),
        );
    }

    let conversations: Vec<serde_json::Value> = serde_json::from_str(&payload.conversations_json)
        .map_err(|e| format!("invalid conversation payload: {e}"))?;
    let memories: Vec<serde_json::Value> = serde_json::from_str(&payload.memories_json)
        .map_err(|e| format!("invalid memory payload: {e}"))?;

    // 1. Stage. Write the whole vault into a sibling staging folder so a crash
    //    never leaves a half-written authoritative vault behind.
    let staging_root = manager.root()?.join(format!(".staging-{project_id}"));
    let _ = storage::remove_vault_tree(&staging_root);
    let staging = VaultPaths::new(staging_root.clone());
    staging.ensure_layout()?;

    let kdf = crypto::KdfParams::generate()?;
    let data_key = crypto::generate_data_key()?;
    let key_wrap = crypto::wrap_data_key(project_id, password, &kdf, &data_key)?;
    let created = now_iso();
    let header = VaultHeader::new(project_id, &created, kdf, key_wrap);
    storage::write_header(&staging, &header)?;

    let project_record = serde_json::json!({
        "name": payload.name,
        "description": payload.description,
        "kind": payload.kind,
        "color": payload.color,
        "icon": payload.icon,
        "systemPrompt": payload.system_prompt,
        "settings": serde_json::from_str::<serde_json::Value>(&payload.settings_json)
            .unwrap_or_else(|_| serde_json::json!({})),
    });
    write_staged_record(&staging, project_id, "project", project_id, 1, &data_key, &project_record)?;
    for conversation in &conversations {
        let id = conversation
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "A conversation payload is missing its id.".to_string())?;
        write_staged_record(&staging, project_id, "conversation", id, 1, &data_key, conversation)?;
    }
    for memory in &memories {
        let id = memory
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "A memory payload is missing its id.".to_string())?;
        write_staged_record(&staging, project_id, "memory", id, 1, &data_key, memory)?;
    }

    // 2. Verify every staged record decrypts with the key the password produces.
    let verified_key = crypto::unwrap_data_key(project_id, password, &header.kdf, &header.key_wrap)?;
    for kind in ["project", "conversation", "memory"] {
        for id in storage::list_record_ids(&staging, kind)? {
            storage::verify_record(&header, &staging, &verified_key, kind, &id)?;
        }
    }

    db_state.with_connection(|conn| {
        project_db::set_migration_state(conn, project_id, MIGRATION_STAGED, "", &created)
    })?;

    // 3. Commit ownership: move the verified staging folder into place.
    paths.ensure_layout()?;
    if let Err(error) = storage::remove_vault_tree(&paths.root) {
        log::warn!("could not replace an empty vault folder for {project_id}: {error}");
    }
    std::fs::create_dir_all(paths.root.parent().unwrap_or(&paths.root))
        .map_err(|e| format!("could not create the vault root: {e}"))?;
    std::fs::rename(&staging_root, &paths.root)
        .map_err(|e| format!("could not commit the staged vault: {e}"))?;
    paths.ensure_layout()?;
    storage::write_commit_marker(&paths, project_id, &created)?;

    // 4. Atomically redact the SQLite plaintext and mark the project locked.
    db_state.with_connection(|conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin lock transaction failed: {e}"))?;
        project_db::mark_project_locked(&tx, project_id, &created)?;
        project_db::set_migration_state(&tx, project_id, MIGRATION_CLEANUP_PENDING, "", &created)?;
        tx.commit()
            .map_err(|e| format!("commit lock transaction failed: {e}"))?;
        Ok(())
    })?;

    // 5. Rebuild the SQLite file so the redacted plaintext does not linger in
    //    free pages or the WAL, then finish the migration bookkeeping.
    if let Err(error) = db_state.with_connection(|conn| {
        crate::shared::compaction::compact_database(conn)
    }) {
        // Compaction is hygiene, not correctness. Record that it is pending so
        // the next unlock retries instead of claiming a clean migration.
        log::warn!("database compaction is pending for {project_id}: {error}");
        db_state.with_connection(|conn| {
            project_db::set_migration_state(
                conn,
                project_id,
                MIGRATION_CLEANUP_PENDING,
                &error,
                &now_iso(),
            )
        })?;
        manager.mark_pending(project_id, LockPhase::Locked);
        return Err(format!(
            "The encrypted project vault was created and the project is locked, but cleaning up the old plaintext database pages failed: {error}. \
             Unlock the project again to retry cleanup."
        ));
    }

    db_state.with_connection(|conn| {
        project_db::set_migration_state(conn, project_id, MIGRATION_DONE, "", &now_iso())
    })?;

    // 6. Leave the project unlocked for the session that just created it.
    let vault = UnlockedVault::new(
        project_id.to_string(),
        header,
        paths,
        created.clone(),
        data_key,
    );
    let vault = manager.insert(project_id, vault);

    Ok(EnableLockResult {
        generation: vault.generation,
        unlocked_at: created,
        migrated_conversations: conversations.len(),
        migrated_memories: memories.len(),
    })
}

fn write_staged_record(
    paths: &VaultPaths,
    project_id: &str,
    kind: &str,
    id: &str,
    revision: u64,
    key: &[u8; KEY_BYTES],
    value: &serde_json::Value,
) -> Result<(), String> {
    let plaintext = serde_json::to_vec(value)
        .map_err(|e| format!("could not serialize a vault record: {e}"))?;
    let (nonce, ciphertext) = crypto::encrypt_record(project_id, kind, id, revision, key, &plaintext)?;
    storage::write_record(paths, kind, id, revision, &nonce, &ciphertext, &now_iso())
}

// ── Unlock / lock ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn unlock_project(
    project_id: String,
    password: String,
    manager: State<'_, VaultManager>,
    db_state: State<'_, ProjectDbState>,
) -> Result<UnlockResult, String> {
    state::validate_project_id(&project_id)?;
    let manager = manager.inner().clone();
    let db_state = db_state.inner().clone();
    let gate = manager.unlock_gate();
    let _permit = gate
        .acquire_owned()
        .await
        .map_err(|_| "Vault work is unavailable.".to_string())?;

    manager.mark_pending(&project_id, LockPhase::Unlocking);
    let project_for_task = project_id.clone();
    let manager_for_task = manager.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        state::open_unlocked(&manager_for_task, &project_for_task, &password, &now_iso())
    })
    .await
    .map_err(|error| format!("vault unlock task failed: {error}"));

    let vault = match result {
        Ok(Ok(vault)) => vault,
        Ok(Err(error)) => {
            manager.mark_pending(&project_id, LockPhase::Locked);
            return Err(error);
        }
        Err(error) => {
            manager.mark_pending(&project_id, LockPhase::Locked);
            return Err(error);
        }
    };

    // A vault that is still cleaning up after an interrupted migration must not
    // be treated as fully migrated.
    let migration = db_state
        .with_connection(|conn| project_db::get_migration_state(conn, &project_id))
        .unwrap_or(None);
    if let Some(migration) = migration {
        if migration == project_db::MIGRATION_CLEANUP_PENDING {
            return Ok(UnlockResult {
                project_id,
                generation: vault.generation,
                unlocked_at: vault.unlocked_at.clone(),
            });
        }
    }

    Ok(UnlockResult {
        project_id,
        generation: vault.generation,
        unlocked_at: vault.unlocked_at.clone(),
    })
}

#[tauri::command]
pub async fn lock_project(
    project_id: String,
    manager: State<'_, VaultManager>,
) -> Result<(), String> {
    state::validate_project_id(&project_id)?;
    manager.take(&project_id);
    Ok(())
}

/// Locks every unlocked project. Used on OS lock, suspend, and app quit.
#[tauri::command]
pub async fn lock_all_projects(
    manager: State<'_, VaultManager>,
) -> Result<Vec<String>, String> {
    Ok(manager.lock_all())
}

// ── Record I/O ───────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultRecord {
    pub kind: String,
    pub id: String,
    pub revision: u64,
    pub data_json: String,
    pub recovered_from_backup: bool,
}

fn require_unlocked<T>(
    manager: &VaultManager,
    project_id: &str,
    generation: Option<u64>,
    f: impl FnOnce(&Arc<UnlockedVault>) -> Result<T, String>,
) -> Result<T, String> {
    state::validate_project_id(project_id)?;
    manager.with_vault(project_id, generation, f)
}

#[tauri::command]
pub async fn read_vault_record(
    project_id: String,
    generation: Option<u64>,
    kind: String,
    id: String,
    manager: State<'_, VaultManager>,
) -> Result<VaultRecord, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let (envelope, nonce, ciphertext, recovered) =
                storage::read_record_raw(&vault.paths, &kind, &id)?;
            if ciphertext.len() > MAX_RECORD_BYTES {
                return Err("The vault record is larger than the supported limit.".into());
            }
            let plaintext = vault.with_key(|key| {
                crypto::decrypt_record(
                    &vault.project_id,
                    &kind,
                    &id,
                    envelope.revision,
                    key,
                    &nonce,
                    &ciphertext,
                )
            })?;
            let data_json = String::from_utf8(plaintext.to_vec())
                .map_err(|_| "The vault record is not valid UTF-8.".to_string())?;
            Ok(VaultRecord {
                kind,
                id,
                revision: envelope.revision,
                data_json,
                recovered_from_backup: recovered,
            })
        })
    })
    .await
    .map_err(|error| format!("vault read task failed: {error}"))?
}

#[tauri::command]
pub async fn write_vault_record(
    project_id: String,
    generation: Option<u64>,
    kind: String,
    id: String,
    data_json: String,
    manager: State<'_, VaultManager>,
) -> Result<u64, String> {
    if data_json.len() > MAX_RECORD_BYTES {
        return Err("The vault record is larger than the supported limit.".into());
    }
    // Reject non-JSON before touching the disk so a caller bug cannot write an
    // undecryptable-but-well-formed record.
    serde_json::from_str::<serde_json::Value>(&data_json)
        .map_err(|e| format!("vault record payload is not valid JSON: {e}"))?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let _write = vault.write_lock.lock();
            let revision = vault.revision_for(&kind, &id);
            let (nonce, ciphertext) = vault.with_key(|key| {
                crypto::encrypt_record(
                    &vault.project_id,
                    &kind,
                    &id,
                    revision,
                    key,
                    data_json.as_bytes(),
                )
            })?;
            storage::write_record(&vault.paths, &kind, &id, revision, &nonce, &ciphertext, &now_iso())?;
            Ok(revision)
        })
    })
    .await
    .map_err(|error| format!("vault write task failed: {error}"))?
}

#[tauri::command]
pub async fn delete_vault_record(
    project_id: String,
    generation: Option<u64>,
    kind: String,
    id: String,
    manager: State<'_, VaultManager>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let _write = vault.write_lock.lock();
            storage::delete_record(&vault.paths, &kind, &id)
        })
    })
    .await
    .map_err(|error| format!("vault delete task failed: {error}"))?
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultRecordSummary {
    pub id: String,
    pub revision: u64,
}

#[tauri::command]
pub async fn list_vault_records(
    project_id: String,
    generation: Option<u64>,
    kind: String,
    manager: State<'_, VaultManager>,
) -> Result<Vec<VaultRecordSummary>, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let mut out = Vec::new();
            for id in storage::list_record_ids(&vault.paths, &kind)? {
                let revision = match storage::read_record_raw(&vault.paths, &kind, &id) {
                    Ok((envelope, _, _, _)) => envelope.revision,
                    Err(_) => continue,
                };
                out.push(VaultRecordSummary { id, revision });
            }
            Ok(out)
        })
    })
    .await
    .map_err(|error| format!("vault list task failed: {error}"))?
}

// ── Password change ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn change_project_password(
    project_id: String,
    current_password: String,
    new_password: String,
    manager: State<'_, VaultManager>,
) -> Result<u64, String> {
    validate_new_password(&new_password)?;
    state::validate_project_id(&project_id)?;
    let manager = manager.inner().clone();
    let gate = manager.unlock_gate();
    let _permit = gate
        .acquire_owned()
        .await
        .map_err(|_| "Vault work is unavailable.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let vault = manager
            .handle(&project_id, None)
            .map_err(|_| crate::vault::state::session_ended_error(&project_id))?;
        let _write = vault.write_lock.lock();

        // Prove the current password before touching the header.
        let (existing_header, _) = storage::read_header_with_recovery(&vault.paths)?;
        crypto::unwrap_data_key(
            &project_id,
            &current_password,
            &existing_header.kdf,
            &existing_header.key_wrap,
        )?;

        if current_password == new_password {
            return Err("Choose a different password.".to_string());
        }

        let kdf = crypto::KdfParams::generate()?;
        let wrap = vault.with_key(|key| crypto::wrap_data_key(&project_id, &new_password, &kdf, key))?;
        let mut header = existing_header;
        header.kdf = kdf;
        header.key_wrap = wrap;
        header.updated_at = now_iso();
        // Rewriting the header rotates the previous header to `.bak`, which
        // keeps the old password meaningful only for that one stale backup.
        storage::write_header(&vault.paths, &header)?;
        Ok(vault.generation)
    })
    .await
    .map_err(|error| format!("password change task failed: {error}"))?
}

// ── Attachments ──────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultBlobInfo {
    pub id: String,
    pub size: u64,
}

#[tauri::command]
pub async fn write_vault_blob(
    project_id: String,
    generation: Option<u64>,
    blob_id: String,
    data_b64: String,
    manager: State<'_, VaultManager>,
) -> Result<VaultBlobInfo, String> {
    let bytes = unb64(&data_b64)?;
    if bytes.len() > MAX_RECORD_BYTES {
        return Err("The attachment is larger than the supported limit.".into());
    }
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let _write = vault.write_lock.lock();
            let revision = vault.revision_for("blob", &blob_id).max(1);
            let (nonce, ciphertext) = vault.with_key(|key| {
                crypto::encrypt_record(&vault.project_id, "blob", &blob_id, revision, key, &bytes)
            })?;
            let mut payload = Vec::with_capacity(4 + nonce.len() + ciphertext.len());
            payload.extend_from_slice(&revision.to_le_bytes());
            payload.extend_from_slice(&nonce);
            payload.extend_from_slice(&ciphertext);
            storage::write_blob(&vault.paths, &blob_id, &payload)?;
            Ok(VaultBlobInfo {
                id: blob_id,
                size: bytes.len() as u64,
            })
        })
    })
    .await
    .map_err(|error| format!("vault attachment task failed: {error}"))?
}

#[tauri::command]
pub async fn read_vault_blob(
    project_id: String,
    generation: Option<u64>,
    blob_id: String,
    manager: State<'_, VaultManager>,
) -> Result<String, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let payload = storage::read_blob(&vault.paths, &blob_id)?;
            if payload.len() < 4 + crypto::NONCE_BYTES {
                return Err(crypto::authentication_error());
            }
            let mut revision_bytes = [0_u8; 4];
            revision_bytes.copy_from_slice(&payload[..4]);
            let revision = u32::from_le_bytes(revision_bytes) as u64;
            let nonce = &payload[4..4 + crypto::NONCE_BYTES];
            let ciphertext = &payload[4 + crypto::NONCE_BYTES..];
            let plaintext = vault.with_key(|key| {
                crypto::decrypt_record(&vault.project_id, "blob", &blob_id, revision, key, nonce, ciphertext)
            })?;
            Ok(b64(&plaintext))
        })
    })
    .await
    .map_err(|error| format!("vault attachment task failed: {error}"))?
}

#[tauri::command]
pub async fn delete_vault_blob(
    project_id: String,
    generation: Option<u64>,
    blob_id: String,
    manager: State<'_, VaultManager>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let _write = vault.write_lock.lock();
            storage::delete_blob(&vault.paths, &blob_id)
        })
    })
    .await
    .map_err(|error| format!("vault attachment task failed: {error}"))?
}

// ── Deletion ─────────────────────────────────────────────────────────────────

/// Deletes a locked project's vault and its database row. Protected content is
/// destroyed rather than being demoted to ordinary chats.
#[tauri::command]
pub async fn delete_locked_project(
    project_id: String,
    password: String,
    manager: State<'_, VaultManager>,
    db_state: State<'_, ProjectDbState>,
) -> Result<(), String> {
    state::validate_project_id(&project_id)?;
    let manager = manager.inner().clone();
    let db_state = db_state.inner().clone();
    let gate = manager.unlock_gate();
    let _permit = gate
        .acquire_owned()
        .await
        .map_err(|_| "Vault work is unavailable.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let paths = manager.vault_paths(&project_id)?;
        let (header, _) = storage::read_header_with_recovery(&paths)?;
        header.validate(&project_id)?;
        // Require the password: deleting without it would let anyone holding an
        // unlocked app session destroy the vault.
        crypto::unwrap_data_key(&project_id, &password, &header.kdf, &header.key_wrap)?;
        manager.take(&project_id);
        storage::remove_vault_tree(&paths.root)?;
        db_state.with_connection(|conn| {
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin delete transaction failed: {e}"))?;
            project_db::delete_project(&tx, project_id.clone())?;
            let _ = project_db::clear_migration_state(&tx, &project_id);
            tx.commit()
                .map_err(|e| format!("commit delete transaction failed: {e}"))?;
            Ok(())
        })?;
        Ok(())
    })
    .await
    .map_err(|error| format!("project delete task failed: {error}"))?
}

// ── Export ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedExportResult {
    pub path: String,
    pub bytes: u64,
}

/// Default export: a self-contained encrypted archive that still requires the
/// password. Never writes plaintext unless the caller explicitly asks.
#[tauri::command]
pub async fn export_locked_project(
    project_id: String,
    generation: Option<u64>,
    target_path: String,
    plaintext: bool,
    manager: State<'_, VaultManager>,
) -> Result<EncryptedExportResult, String> {
    let manager = manager.inner().clone();
    let allowed: &[&str] = if plaintext { &["json"] } else { &["veyralock"] };
    let export_path = crate::shared::path_utils::validate_export_file_path(&target_path, allowed)?;

    tauri::async_runtime::spawn_blocking(move || {
        require_unlocked(&manager, &project_id, generation, |vault| {
            let (header, _) = storage::read_header_with_recovery(&vault.paths)?;
            let mut records = Vec::new();
            for kind in ["project", "conversation", "memory", "draft", "artifact", "attachment-meta", "settings"] {
                for id in storage::list_record_ids(&vault.paths, kind)? {
                    let Ok((envelope, nonce, ciphertext, _)) =
                        storage::read_record_raw(&vault.paths, kind, &id)
                    else {
                        continue;
                    };
                    if plaintext {
                        let plaintext_bytes = vault.with_key(|key| {
                            crypto::decrypt_record(&vault.project_id, kind, &id, envelope.revision, key, &nonce, &ciphertext)
                        })?;
                        let value: serde_json::Value = serde_json::from_slice(&plaintext_bytes)
                            .map_err(|_| "A vault record could not be decoded for export.".to_string())?;
                        records.push(serde_json::json!({
                            "kind": kind,
                            "id": id,
                            "revision": envelope.revision,
                            "data": value,
                        }));
                    } else {
                        records.push(serde_json::json!({
                            "kind": kind,
                            "id": id,
                            "revision": envelope.revision,
                            "nonce": envelope.nonce_b64,
                            "data": envelope.data_b64,
                            "updatedAt": envelope.updated_at,
                        }));
                    }
                }
            }
            let document = if plaintext {
                serde_json::json!({
                    "schema": "veyra-project-export",
                    "version": 1,
                    "encrypted": false,
                    "warning": "This file is NOT encrypted. It contains plaintext project data.",
                    "exportedAt": now_iso(),
                    "projectId": project_id,
                    "header": header,
                    "records": records,
                })
            } else {
                serde_json::json!({
                    "schema": "veyra-project-locked-export",
                    "version": 1,
                    "encrypted": true,
                    "exportedAt": now_iso(),
                    "projectId": project_id,
                    "header": header,
                    "records": records,
                })
            };
            let json = serde_json::to_vec_pretty(&document)
                .map_err(|e| format!("could not serialize the export: {e}"))?;
            let bytes = json.len() as u64;
            std::fs::write(&export_path, json)
                .map_err(|e| format!("failed to write the export: {e}"))?;
            Ok(EncryptedExportResult {
                path: export_path.to_string_lossy().into_owned(),
                bytes,
            })
        })
    })
    .await
    .map_err(|error| format!("vault export task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_helpers_round_trip() {
        let encoded = b64(b"hello vault");
        assert_eq!(unb64(&encoded).unwrap(), b"hello vault");
        assert!(unb64("not base64 !!").is_err());
    }
}
