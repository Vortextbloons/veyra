use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

use super::pi_runner::pi_agent_dir;

pub(crate) fn resolve_pi_session_file(session_path: &str) -> Result<PathBuf, String> {
    resolve_pi_session_file_in_dir(session_path, &pi_agent_dir()?.join("sessions"))
}

pub(crate) fn resolve_pi_session_file_in_dir(
    session_path: &str,
    sessions_dir: &Path,
) -> Result<PathBuf, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("session file path is invalid".into());
    }

    let sessions_dir = sessions_dir
        .canonicalize()
        .map_err(|_| "session directory does not exist".to_string())?;
    let session_file = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|_| "session file does not exist".to_string())?;

    if !session_file.starts_with(&sessions_dir) {
        return Err("session file is outside the Pi sessions directory".into());
    }

    if !session_file.is_file() {
        return Err("session file does not exist".into());
    }

    if !session_file.extension().is_some_and(|ext| ext == "jsonl") {
        return Err("session file must be a .jsonl file".into());
    }

    Ok(session_file)
}

/// Scan `~/.pi/agent/sessions/` for `.jsonl` session files.
pub(crate) fn list_pi_sessions_sync(project_path: String) -> Result<String, String> {
    let _cwd = resolve_workspace_path(project_path.trim())?;
    let sessions_dir = pi_agent_dir()?.join("sessions");

    if !sessions_dir.is_dir() {
        return Ok("[]".to_string());
    }

    let mut sessions = Vec::new();
    let entries =
        fs::read_dir(&sessions_dir).map_err(|e| format!("failed to read sessions dir: {e}"))?;

    for entry in entries.map_while(Result::ok) {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            let metadata = fs::metadata(&path).ok();
            let file_name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

            sessions.push(json!({
                "id": file_name,
                "path": path.to_string_lossy(),
                "fileName": path.file_name().and_then(|s| s.to_str()).unwrap_or_default(),
                "modified": modified,
                "size": size,
            }));
        }
    }

    sessions.sort_by(|a, b| {
        let a_mod = a.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_mod = b.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        b_mod.cmp(&a_mod)
    });

    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

/// Send a `switch_session` command to a running Pi RPC process.
/// NOTE: This only works if a Pi RPC process is already running for this
/// session. For now, we store stdin handles in the running processes map
/// so we can send commands later.
pub(crate) fn switch_pi_session_sync(session_path: String) -> Result<(), String> {
    // For Pi, switching sessions means the next run should use this session file.
    // Since Pi uses --no-session by default, session switching is handled at
    // the prompt level. We just validate the path exists.
    resolve_pi_session_file(&session_path).map(|_| ())
}

pub(crate) fn resolve_workspace_path(project_path: &str) -> Result<PathBuf, String> {
    if project_path.is_empty() {
        return std::env::current_dir()
            .map_err(|error| format!("failed to resolve default workspace: {error}"));
    }

    if project_path.contains('\0') {
        return Err("workspace path is invalid".into());
    }

    let path = PathBuf::from(project_path);
    let canonical = path
        .canonicalize()
        .map_err(|_| "workspace path must be an existing directory".to_string())?;

    if !canonical.is_dir() {
        return Err("workspace path must be an existing directory".into());
    }

    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::resolve_pi_session_file_in_dir;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("veyra-pi-session-{name}-{nanos}"))
    }

    #[test]
    fn allows_session_file_inside_sessions_dir() {
        let root = unique_test_dir("inside");
        let sessions_dir = root.join("sessions");
        fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        let session_file = sessions_dir.join("session.jsonl");
        fs::write(&session_file, "{}\n").expect("write session file");

        let resolved = resolve_pi_session_file_in_dir(
            session_file.to_str().expect("session path utf-8"),
            &sessions_dir,
        )
        .expect("session file should resolve");

        assert_eq!(
            resolved,
            session_file.canonicalize().expect("canonical file")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_session_file_outside_sessions_dir() {
        let root = unique_test_dir("outside");
        let sessions_dir = root.join("sessions");
        let outside_dir = root.join("outside");
        fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        fs::create_dir_all(&outside_dir).expect("create outside dir");
        let session_file = outside_dir.join("session.jsonl");
        fs::write(&session_file, "{}\n").expect("write outside session file");

        let error = resolve_pi_session_file_in_dir(
            session_file.to_str().expect("session path utf-8"),
            &sessions_dir,
        )
        .unwrap_err();

        assert!(error.contains("outside"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_non_jsonl_session_file() {
        let root = unique_test_dir("extension");
        let sessions_dir = root.join("sessions");
        fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        let session_file = sessions_dir.join("session.txt");
        fs::write(&session_file, "{}\n").expect("write session file");

        let error = resolve_pi_session_file_in_dir(
            session_file.to_str().expect("session path utf-8"),
            &sessions_dir,
        )
        .unwrap_err();

        assert!(error.contains(".jsonl"));
        let _ = fs::remove_dir_all(&root);
    }
}
