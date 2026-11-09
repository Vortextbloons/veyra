//! On-disk layout of a locked project's vault.
//!
//! ```text
//! <app_data>/project-vaults/<projectId>/
//!   header.json                 KDF parameters + wrapped data key (no plaintext)
//!   records/<kind>/<id>.vrec    one file per encrypted record
//!   records/<kind>/<id>.vrec.bak
//!   attachments/<blobId>.vblob  encrypted imported copies (never linked originals)
//!   commit.log                  last committed generation (opaque)
//! ```
//!
//! Every record write is: encrypt -> write `.tmp` -> fsync -> rotate the
//! previous primary to `.bak` -> rename the temp file into place. A crash at
//! any point leaves either the new record, the previous record, or both valid.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::crypto::{self, KdfParams, KeyWrap, FORMAT, VERSION};

/// Upper bound for a single decrypted record. Keeps a corrupted length header
/// from allocating without limit.
pub const MAX_RECORD_BYTES: usize = 64 * 1024 * 1024;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultHeader {
    pub format: String,
    pub version: u32,
    pub project_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub kdf: KdfParams,
    pub key_wrap: KeyWrap,
}

impl VaultHeader {
    pub fn new(
        project_id: &str,
        created_at: &str,
        kdf: KdfParams,
        key_wrap: KeyWrap,
    ) -> Self {
        Self {
            format: FORMAT.to_string(),
            version: VERSION,
            project_id: project_id.to_string(),
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
            kdf,
            key_wrap,
        }
    }

    pub fn validate(&self, expected_project_id: &str) -> Result<(), String> {
        if self.format != FORMAT {
            return Err("This folder does not contain a Veyra project vault.".into());
        }
        if self.version != VERSION {
            return Err(format!(
                "This project vault uses version {}, which this build cannot read.",
                self.version
            ));
        }
        if self.project_id != expected_project_id {
            return Err("The project vault header belongs to a different project.".into());
        }
        self.kdf.validate()
    }
}

/// A single encrypted record on disk. `revision` is part of the AAD, so the
/// value stored here cannot be altered without failing authentication.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordEnvelope {
    pub format: String,
    pub version: u32,
    pub kind: String,
    pub id: String,
    pub revision: u64,
    pub nonce_b64: String,
    pub data_b64: String,
    pub updated_at: String,
}

pub struct VaultPaths {
    pub root: PathBuf,
}

fn validate_component(value: &str, label: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 200 {
        return Err(format!("{label} is invalid."));
    }
    if trimmed.starts_with('.') {
        return Err(format!("{label} is invalid."));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!("{label} contains unsupported characters."));
    }
    Ok(())
}

pub fn validate_kind(kind: &str) -> Result<(), String> {
    match kind {
        "project" | "conversation" | "memory" | "draft" | "artifact" | "attachment-meta"
        | "settings" | "index" => Ok(()),
        _ => Err(format!("unknown vault record kind: {kind}")),
    }
}

impl VaultPaths {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn header(&self) -> PathBuf {
        self.root.join("header.json")
    }

    pub fn commit_log(&self) -> PathBuf {
        self.root.join("commit.log")
    }

    pub fn record_dir(&self, kind: &str) -> PathBuf {
        self.root.join("records").join(kind)
    }

    pub fn record(&self, kind: &str, id: &str) -> Result<PathBuf, String> {
        validate_kind(kind)?;
        validate_component(id, "record id")?;
        Ok(self.record_dir(kind).join(format!("{id}.vrec")))
    }

    pub fn record_backup(&self, kind: &str, id: &str) -> Result<PathBuf, String> {
        Ok(PathBuf::from(format!(
            "{}.bak",
            self.record(kind, id)?.display()
        )))
    }

    pub fn blob_dir(&self) -> PathBuf {
        self.root.join("attachments")
    }

    pub fn blob(&self, id: &str) -> Result<PathBuf, String> {
        validate_component(id, "blob id")?;
        Ok(self.blob_dir().join(format!("{id}.vblob")))
    }

    pub fn ensure_layout(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|e| format!("Could not create the vault folder: {e}"))?;
        for kind in [
            "project",
            "conversation",
            "memory",
            "draft",
            "artifact",
            "attachment-meta",
            "settings",
            "index",
        ] {
            let dir = self.record_dir(kind);
            fs::create_dir_all(&dir)
                .map_err(|e| format!("Could not create the vault record folder: {e}"))?;
        }
        fs::create_dir_all(self.blob_dir())
            .map_err(|e| format!("Could not create the vault attachment folder: {e}"))?;
        Ok(())
    }
}

fn atomic_write(path: &Path, bytes: &[u8], rotate_backup: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    }
    let temporary = PathBuf::from(format!("{}.tmp", path.display()));
    let backup = PathBuf::from(format!("{}.bak", path.display()));

    {
        let mut file = fs::File::create(&temporary)
            .map_err(|e| format!("Could not write {}: {e}", temporary.display()))?;
        file.write_all(bytes)
            .map_err(|e| format!("Could not write {}: {e}", temporary.display()))?;
        file.sync_all()
            .map_err(|e| format!("Could not flush {}: {e}", temporary.display()))?;
    }

    if rotate_backup && path.exists() {
        // The old primary becomes the recoverable backup. A failure here is
        // fatal for this write: silently deleting the last good copy would be
        // worse than reporting the error.
        if backup.exists() {
            fs::remove_file(&backup)
                .map_err(|e| format!("Could not rotate {}: {e}", backup.display()))?;
        }
        fs::rename(path, &backup)
            .map_err(|e| format!("Could not rotate {}: {e}", path.display()))?;
    }

    if let Err(error) = fs::rename(&temporary, path) {
        if !path.exists() && backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("Could not commit {}: {error}", path.display()));
    }
    Ok(())
}

pub fn write_header(paths: &VaultPaths, header: &VaultHeader) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(header)
        .map_err(|e| format!("Could not serialize the vault header: {e}"))?;
    atomic_write(&paths.header(), &json, true)
}

pub fn read_header(paths: &VaultPaths) -> Result<VaultHeader, String> {
    let raw = fs::read_to_string(paths.header()).map_err(|_| {
        "This project is marked as locked but its vault header is missing. The data cannot be opened."
            .to_string()
    })?;
    parse_header(&raw)
}

/// Reads a header from either the primary or the rotated backup.
pub fn read_header_with_recovery(paths: &VaultPaths) -> Result<(VaultHeader, bool), String> {
    let primary = fs::read_to_string(paths.header());
    if let Ok(raw) = &primary {
        if let Ok(header) = parse_header(raw) {
            return Ok((header, false));
        }
    }
    let backup_path = PathBuf::from(format!("{}.bak", paths.header().display()));
    if let Ok(raw) = fs::read_to_string(backup_path) {
        if let Ok(header) = parse_header(&raw) {
            return Ok((header, true));
        }
    }
    match primary {
        Ok(_) => Err("The project vault header is corrupt and no valid backup was found.".into()),
        Err(_) => Err(
            "This project is marked as locked but its vault header is missing. The data cannot be opened."
                .to_string(),
        ),
    }
}

fn parse_header(raw: &str) -> Result<VaultHeader, String> {
    let header: VaultHeader = serde_json::from_str(raw)
        .map_err(|_| "The project vault header is not valid.".to_string())?;
    header.kdf.validate()?;
    Ok(header)
}

pub fn write_record(
    paths: &VaultPaths,
    kind: &str,
    id: &str,
    revision: u64,
    nonce: &[u8],
    ciphertext: &[u8],
    updated_at: &str,
) -> Result<(), String> {
    let envelope = RecordEnvelope {
        format: FORMAT.to_string(),
        version: VERSION,
        kind: kind.to_string(),
        id: id.to_string(),
        revision,
        nonce_b64: base64_encode(nonce),
        data_b64: base64_encode(ciphertext),
        updated_at: updated_at.to_string(),
    };
    let json = serde_json::to_vec(&envelope)
        .map_err(|e| format!("Could not serialize the vault record: {e}"))?;
    atomic_write(&paths.record(kind, id)?, &json, true)
}

pub fn read_record_raw(
    paths: &VaultPaths,
    kind: &str,
    id: &str,
) -> Result<(RecordEnvelope, Vec<u8>, Vec<u8>, bool), String> {
    let primary = paths.record(kind, id)?;
    let backup = paths.record_backup(kind, id)?;

    let mut last_error = String::new();
    for (path, recovered) in [(&primary, false), (&backup, true)] {
        match fs::read(path) {
            Ok(bytes) => match parse_envelope(&bytes, kind, id) {
                Ok(envelope) => {
                    let nonce = decode(&envelope.nonce_b64)?;
                    let data = decode(&envelope.data_b64)?;
                    if data.len() > MAX_RECORD_BYTES + 64 {
                        last_error = "The vault record is larger than the supported limit.".into();
                        continue;
                    }
                    return Ok((envelope, nonce, data, recovered));
                }
                Err(error) => last_error = error,
            },
            Err(error) => {
                if error.kind() != std::io::ErrorKind::NotFound {
                    last_error = format!("Could not read the vault record: {error}");
                }
            }
        }
    }
    if last_error.is_empty() {
        Err("The vault record is missing.".into())
    } else {
        Err(last_error)
    }
}

fn parse_envelope(bytes: &[u8], kind: &str, id: &str) -> Result<RecordEnvelope, String> {
    let envelope: RecordEnvelope = serde_json::from_slice(bytes)
        .map_err(|_| "The vault record is not valid.".to_string())?;
    if envelope.format != FORMAT || envelope.version != VERSION {
        return Err("The vault record uses an unsupported format or version.".into());
    }
    if envelope.kind != kind || envelope.id != id {
        return Err("The vault record does not belong to the requested item.".into());
    }
    Ok(envelope)
}

pub fn record_exists(paths: &VaultPaths, kind: &str, id: &str) -> bool {
    paths
        .record(kind, id)
        .map(|path| path.exists())
        .unwrap_or(false)
        || paths
            .record_backup(kind, id)
            .map(|path| path.exists())
            .unwrap_or(false)
}

pub fn list_record_ids(paths: &VaultPaths, kind: &str) -> Result<Vec<String>, String> {
    let dir = paths.record_dir(kind);
    let mut ids = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(ids),
        Err(error) => return Err(format!("Could not read the vault folder: {error}")),
    };
    for entry in entries {
        let entry = entry.map_err(|e| format!("Could not read the vault folder: {e}"))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Some(stem) = name.strip_suffix(".vrec") else {
            continue;
        };
        if stem.is_empty() || stem.contains('.') {
            continue;
        }
        if validate_component(stem, "record id").is_ok() {
            ids.push(stem.to_string());
        }
    }
    ids.sort();
    Ok(ids)
}

pub fn delete_record(paths: &VaultPaths, kind: &str, id: &str) -> Result<(), String> {
    for path in [paths.record(kind, id)?, paths.record_backup(kind, id)?] {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Could not remove {}: {e}", path.display()))?;
        }
    }
    Ok(())
}

pub fn write_blob(paths: &VaultPaths, id: &str, bytes: &[u8]) -> Result<(), String> {
    atomic_write(&paths.blob(id)?, bytes, true)
}

pub fn read_blob(paths: &VaultPaths, id: &str) -> Result<Vec<u8>, String> {
    let path = paths.blob(id)?;
    fs::read(&path).map_err(|_| "The encrypted attachment is unavailable.".to_string())
}

pub fn delete_blob(paths: &VaultPaths, id: &str) -> Result<(), String> {
    let path = paths.blob(id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Could not remove attachment: {e}"))?;
    }
    let backup = PathBuf::from(format!("{}.bak", path.display()));
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

/// Cheap, durable "this vault now belongs to project X" marker. Written only
/// after the vault's contents have been verified.
pub fn write_commit_marker(paths: &VaultPaths, project_id: &str, at: &str) -> Result<(), String> {
    let payload = serde_json::json!({
        "format": FORMAT,
        "version": VERSION,
        "projectId": project_id,
        "committedAt": at,
    });
    let json = serde_json::to_vec(&payload)
        .map_err(|e| format!("Could not serialize the vault marker: {e}"))?;
    atomic_write(&paths.commit_log(), &json, false)
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn decode(value: &str) -> Result<Vec<u8>, String> {
    bytes_from_base64(value)
}

fn bytes_from_base64(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|_| "The vault record is not valid base64.".to_string())
}

/// Best-effort verification used by migration before ownership is committed.
pub fn verify_record(
    header: &VaultHeader,
    paths: &VaultPaths,
    data_key: &[u8; 32],
    kind: &str,
    id: &str,
) -> Result<(), String> {
    let (envelope, nonce, ciphertext, _) = read_record_raw(paths, kind, id)?;
    crypto::decrypt_record(
        &header.project_id,
        kind,
        id,
        envelope.revision,
        data_key,
        &nonce,
        &ciphertext,
    )?;
    Ok(())
}

pub fn remove_vault_tree(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    // Only ever remove a recognised vault directory.
    let header = root.join("header.json");
    let looks_like_vault = header.exists() || root.join("records").exists();
    if !looks_like_vault {
        return Err("Refusing to remove a folder that is not a Veyra vault.".into());
    }
    std::fs::remove_dir_all(root).map_err(|e| format!("Could not remove the vault folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::{encrypt_record, generate_data_key, KdfParams};

    fn temp_root(tag: &str) -> PathBuf {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("veyra-vault-{tag}-{nanos}"))
    }

    fn fast_params() -> KdfParams {
        use base64::Engine as _;
        KdfParams {
            algorithm: "argon2id".into(),
            m_cost_kib: 32_768,
            t_cost: 1,
            p_cost: 1,
            salt_b64: base64::engine::general_purpose::STANDARD.encode([3_u8; 16]),
        }
    }

    fn seeded_vault(project_id: &str) -> (VaultPaths, [u8; 32]) {
        let root = temp_root(project_id);
        let paths = VaultPaths::new(root);
        paths.ensure_layout().unwrap();
        let key = *generate_data_key().unwrap();
        let kdf = fast_params();
        let wrap = crypto::wrap_data_key(project_id, "pw", &kdf, &key).unwrap();
        let header = VaultHeader::new(project_id, "2026-01-01T00:00:00Z", kdf, wrap);
        write_header(&paths, &header).unwrap();
        (paths, key)
    }

    #[test]
    fn rejects_path_traversal_in_record_ids() {
        let paths = VaultPaths::new(temp_root("paths"));
        assert!(paths.record("conversation", "../escape").is_err());
        assert!(paths.record("conversation", "..").is_err());
        assert!(paths.record("conversation", "a/b").is_err());
        assert!(paths.record("conversation", "").is_err());
        assert!(paths.record("nonsense", "id").is_err());
        assert!(paths.record("conversation", "c-1_ok.ok").is_ok());
    }

    #[test]
    fn record_writes_keep_a_recoverable_backup_and_ignore_temp_files() {
        let (paths, key) = seeded_vault("p1");
        for (revision, message) in [(1_u64, b"first".as_slice()), (2, b"second".as_slice())] {
            let (nonce, ciphertext) =
                encrypt_record("p1", "conversation", "c1", revision, &key, message).unwrap();
            write_record(&paths, "conversation", "c1", revision, &nonce, &ciphertext, "now").unwrap();
        }
        let (envelope, _, _, recovered) = read_record_raw(&paths, "conversation", "c1").unwrap();
        assert_eq!(envelope.revision, 2);
        assert!(!recovered);

        // Corrupt the primary: the backup must still be readable and labelled.
        fs::write(paths.record("conversation", "c1").unwrap(), b"{not-json").unwrap();
        let (envelope, _, _, recovered) = read_record_raw(&paths, "conversation", "c1").unwrap();
        assert_eq!(envelope.revision, 1);
        assert!(recovered);
        assert!(!PathBuf::from(format!("{}.tmp", paths.record("conversation", "c1").unwrap().display())).exists());
    }

    #[test]
    fn missing_records_are_reported_as_missing_not_corrupt() {
        let (paths, _) = seeded_vault("p2");
        let error = read_record_raw(&paths, "conversation", "nope").unwrap_err();
        assert!(error.contains("missing"), "{error}");
        assert!(!record_exists(&paths, "conversation", "nope"));
        assert!(list_record_ids(&paths, "conversation").unwrap().is_empty());
    }

    #[test]
    fn header_recovery_uses_the_backup_when_the_primary_is_corrupt() {
        let (paths, _) = seeded_vault("p3");
        fs::write(paths.header(), b"{oops").unwrap();
        let (header, recovered) = read_header_with_recovery(&paths).unwrap();
        assert_eq!(header.project_id, "p3");
        assert!(recovered);
    }

    #[test]
    fn header_version_and_project_id_mismatches_are_rejected() {
        let (paths, _) = seeded_vault("p4");
        let header = read_header(&paths).unwrap();
        assert!(header.validate("p4").is_ok());
        assert!(header.validate("other").is_err());
        let mut future = header.clone();
        future.version = 99;
        assert!(future.validate("p4").is_err());
    }

    #[test]
    fn record_listing_skips_partial_and_foreign_files() {
        let (paths, key) = seeded_vault("p5");
        let (nonce, ciphertext) = encrypt_record("p5", "memory", "m1", 1, &key, b"x").unwrap();
        write_record(&paths, "memory", "m1", 1, &nonce, &ciphertext, "now").unwrap();
        fs::write(paths.record_dir("memory").join("m2.vrec.tmp"), b"partial").unwrap();
        fs::write(paths.record_dir("memory").join("notes.txt"), b"foreign").unwrap();
        assert_eq!(list_record_ids(&paths, "memory").unwrap(), vec!["m1".to_string()]);
        delete_record(&paths, "memory", "m1").unwrap();
        assert!(list_record_ids(&paths, "memory").unwrap().is_empty());
        assert!(!record_exists(&paths, "memory", "m1"));
    }
}
