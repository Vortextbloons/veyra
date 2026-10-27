use base64::Engine as _;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, RunEvent, WindowEvent};

/// Ensures the main window is only revealed once per process (avoids stealing
/// focus on Vite HMR remounts during `tauri dev`).
static INITIAL_WINDOW_SHOWN: AtomicBool = AtomicBool::new(false);

fn reveal_main_window(app: &tauri::AppHandle, focus: bool) {
    if INITIAL_WINDOW_SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }

    match app.get_webview_window("main") {
        Some(window) => {
            if let Err(error) = window.show() {
                eprintln!("[veyra] failed to show main window: {error}");
            } else if focus && !cfg!(debug_assertions) {
                let _ = window.set_focus();
            }
        }
        None => {
            eprintln!("[veyra] main webview window not found");
            for (label, _) in app.webview_windows() {
                eprintln!("[veyra] available window: {label}");
            }
            INITIAL_WINDOW_SHOWN.store(false, Ordering::SeqCst);
        }
    }
}

mod agents;
mod artifact_preview;
mod app_update;
mod connectivity;
mod document_extraction;
mod extensions;
mod file_extraction;
mod projects;
mod research;
mod shared;
mod web_search;

const CONVERSATIONS_FILE: &str = "conversations.json";
const CONVERSATIONS_BACKUP_FILE: &str = "conversations.json.bak";
const CONVERSATIONS_TEMP_FILE: &str = "conversations.json.tmp";
const CONVERSATION_KEY_FILE: &str = "conversation.key";
const MAX_CONVERSATIONS_JSON_BYTES: usize = 50 * 1024 * 1024;
const MEMORY_FILE: &str = "memory.json";
const MEMORY_BACKUP_FILE: &str = "memory.json.bak";
const MEMORY_TEMP_FILE: &str = "memory.json.tmp";
const MEMORY_BACKUP_TEMP_FILE: &str = "memory.json.bak.tmp";
const MAX_MEMORY_JSON_BYTES: usize = 4 * 1024 * 1024;
const KEYRING_SERVICE: &str = "com.veyra.app";
const KEYRING_USER: &str = "conversation-key";
const PROVIDER_KEYRING_PREFIX: &str = "provider:";

fn provider_keyring_user(provider_id: &str) -> Result<String, String> {
    let trimmed = provider_id.trim();
    if trimmed.is_empty()
        || trimmed.len() > 100
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid provider id".into());
    }
    Ok(format!("{PROVIDER_KEYRING_PREFIX}{trimmed}"))
}

#[tauri::command]
fn save_provider_credential(provider_id: String, api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() || key.len() > 16_384 {
        return Err("invalid API key".into());
    }
    let user = provider_keyring_user(&provider_id)?;
    let entry = keyring::Entry::new(KEYRING_SERVICE, &user).map_err(|error| error.to_string())?;
    entry.set_password(key).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_provider_credential(provider_id: String) -> Result<String, String> {
    let user = provider_keyring_user(&provider_id)?;
    let entry = keyring::Entry::new(KEYRING_SERVICE, &user).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(value),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_provider_credential(provider_id: String) -> Result<(), String> {
    let user = provider_keyring_user(&provider_id)?;
    let entry = keyring::Entry::new(KEYRING_SERVICE, &user).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn app_data_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(file_name))
}

fn validate_conversation_key(key: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(key.trim())
        .map_err(|_| "conversation key is not valid base64".to_string())?;
    if bytes.len() != 32 {
        return Err("conversation key must contain exactly 32 bytes".into());
    }
    Ok(())
}

fn write_conversation_snapshot_files(dir: &std::path::Path, contents: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let primary = dir.join(CONVERSATIONS_FILE);
    let backup = dir.join(CONVERSATIONS_BACKUP_FILE);
    let temporary = dir.join(CONVERSATIONS_TEMP_FILE);

    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);

    if backup.exists() {
        fs::remove_file(&backup).map_err(|error| error.to_string())?;
    }
    if primary.exists() {
        fs::rename(&primary, &backup).map_err(|error| error.to_string())?;
    }

    if let Err(error) = fs::rename(&temporary, &primary) {
        if !primary.exists() && backup.exists() {
            let _ = fs::rename(&backup, &primary);
        }
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }

    Ok(())
}

#[tauri::command]
fn save_conversations(app: tauri::AppHandle, conversations_json: String) -> Result<(), String> {
    if conversations_json.len() > MAX_CONVERSATIONS_JSON_BYTES {
        return Err(format!(
            "conversations payload exceeds {} MB limit",
            MAX_CONVERSATIONS_JSON_BYTES / (1024 * 1024)
        ));
    }
    serde_json::from_str::<serde_json::Value>(&conversations_json)
        .map_err(|error| error.to_string())?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    write_conversation_snapshot_files(&dir, &conversations_json)
}

#[tauri::command]
fn load_or_create_conversation_key(app: tauri::AppHandle) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("OS credential vault is unavailable: {error}"))?;

    // One-time migration from releases that stored the key beside the ciphertext.
    // The legacy file was previously authoritative, so migrate it before
    // consulting an older best-effort vault copy.
    let legacy_path = app_data_file_path(&app, CONVERSATION_KEY_FILE)?;
    if legacy_path.exists() {
        let key = fs::read_to_string(&legacy_path)
            .map_err(|error| format!("Could not read the legacy conversation key: {error}"))?;
        let key = key.trim().to_string();
        validate_conversation_key(&key)?;
        entry.set_password(&key).map_err(|error| {
            format!("Could not migrate the conversation key to the OS credential vault: {error}")
        })?;
        fs::remove_file(&legacy_path).map_err(|error| {
            format!(
                "Conversation key was migrated, but the insecure legacy key file could not be removed: {error}"
            )
        })?;
        return Ok(key);
    }

    match entry.get_password() {
        Ok(key) => {
            validate_conversation_key(&key)?;
            return Ok(key);
        }
        Err(keyring::Error::NoEntry) => {}
        Err(error) => {
            return Err(format!(
                "Could not read the conversation key from the OS credential vault: {error}"
            ));
        }
    }

    let mut key_bytes = [0_u8; 32];
    getrandom::fill(&mut key_bytes)
        .map_err(|error| format!("Could not generate a conversation key: {error}"))?;
    let key = base64::engine::general_purpose::STANDARD.encode(key_bytes);
    entry.set_password(&key).map_err(|error| {
        format!("Could not save the conversation key in the OS credential vault: {error}")
    })?;
    Ok(key)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversationSnapshotCandidates {
    primary: Option<String>,
    backup: Option<String>,
    primary_error: Option<String>,
    backup_error: Option<String>,
}

fn read_optional_file(path: &std::path::Path) -> (Option<String>, Option<String>) {
    if !path.exists() {
        return (None, None);
    }
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.len() > MAX_CONVERSATIONS_JSON_BYTES as u64 {
            return (
                None,
                Some(format!(
                    "{} exceeds the {} MB conversation snapshot limit",
                    path.display(),
                    MAX_CONVERSATIONS_JSON_BYTES / (1024 * 1024)
                )),
            );
        }
    }
    match fs::read_to_string(path) {
        Ok(contents) => (Some(contents), None),
        Err(error) => (None, Some(error.to_string())),
    }
}

#[tauri::command]
fn load_conversation_snapshots(
    app: tauri::AppHandle,
) -> Result<ConversationSnapshotCandidates, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let (primary, primary_error) = read_optional_file(&dir.join(CONVERSATIONS_FILE));
    let (backup, backup_error) = read_optional_file(&dir.join(CONVERSATIONS_BACKUP_FILE));
    Ok(ConversationSnapshotCandidates {
        primary,
        backup,
        primary_error,
        backup_error,
    })
}

fn write_memory_snapshot_files(
    dir: &std::path::Path,
    contents: &str,
    preserve_backup: bool,
    mirror_both: bool,
) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let primary = dir.join(MEMORY_FILE);
    let backup = dir.join(MEMORY_BACKUP_FILE);
    let temporary = dir.join(MEMORY_TEMP_FILE);
    let backup_temporary = dir.join(MEMORY_BACKUP_TEMP_FILE);

    let write_temp = |path: &std::path::Path| -> Result<(), String> {
        let mut file = fs::File::create(path).map_err(|error| error.to_string())?;
        file.write_all(contents.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        Ok(())
    };
    write_temp(&temporary)?;

    if mirror_both {
        if let Err(error) = write_temp(&backup_temporary) {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
        // For restrictive changes, update the recovery copy first. If the
        // second rename fails, recovery still selects the newer revision.
        if backup.exists() {
            if let Err(error) = fs::remove_file(&backup) {
                let _ = fs::remove_file(&temporary);
                let _ = fs::remove_file(&backup_temporary);
                return Err(error.to_string());
            }
        }
        if let Err(error) = fs::rename(&backup_temporary, &backup) {
            let _ = fs::remove_file(&temporary);
            let _ = fs::remove_file(&backup_temporary);
            return Err(error.to_string());
        }
        if primary.exists() {
            if let Err(error) = fs::remove_file(&primary) {
                let _ = fs::remove_file(&temporary);
                return Err(error.to_string());
            }
        }
        if let Err(error) = fs::rename(&temporary, &primary) {
            let _ = fs::remove_file(&temporary);
            return Err(error.to_string());
        }
        return Ok(());
    }

    if preserve_backup {
        // Hydration selected the backup as the newest valid copy. Keep it until
        // the repaired primary has been written successfully.
        if primary.exists() {
            fs::remove_file(&primary).map_err(|error| error.to_string())?;
        }
    } else {
        if backup.exists() {
            fs::remove_file(&backup).map_err(|error| error.to_string())?;
        }
        if primary.exists() {
            fs::rename(&primary, &backup).map_err(|error| error.to_string())?;
        }
    }

    if let Err(error) = fs::rename(&temporary, &primary) {
        if !preserve_backup && !primary.exists() && backup.exists() {
            let _ = fs::rename(&backup, &primary);
        }
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }

    Ok(())
}

#[tauri::command]
async fn save_memory_snapshot(
    app: tauri::AppHandle,
    memory_json: String,
    preserve_backup: bool,
    mirror_both: bool,
) -> Result<(), String> {
    if memory_json.len() > MAX_MEMORY_JSON_BYTES {
        return Err("memory payload exceeds the 4 MB limit".into());
    }
    let parsed = serde_json::from_str::<serde_json::Value>(&memory_json)
        .map_err(|error| error.to_string())?;
    let envelope = parsed
        .as_object()
        .ok_or_else(|| "memory payload must be an encrypted snapshot envelope".to_string())?;
    if envelope.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || envelope
            .get("revision")
            .and_then(serde_json::Value::as_u64)
            .is_none()
        || envelope
            .get("iv")
            .and_then(serde_json::Value::as_str)
            .is_none()
        || envelope
            .get("data")
            .and_then(serde_json::Value::as_str)
            .is_none()
    {
        return Err("memory payload must be an encrypted snapshot envelope".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        write_memory_snapshot_files(&dir, &memory_json, preserve_backup, mirror_both)
    })
    .await
    .map_err(|error| format!("memory save task failed: {error}"))?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MemorySnapshotCandidates {
    primary: Option<String>,
    backup: Option<String>,
    primary_error: Option<String>,
    backup_error: Option<String>,
}

fn read_memory_file(path: &std::path::Path) -> (Option<String>, Option<String>) {
    if !path.exists() {
        return (None, None);
    }
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.len() > MAX_MEMORY_JSON_BYTES as u64 {
            return (None, Some("memory snapshot exceeds the 4 MB limit".into()));
        }
    }
    match fs::read_to_string(path) {
        Ok(contents) => (Some(contents), None),
        Err(error) => (None, Some(error.to_string())),
    }
}

#[tauri::command]
async fn load_memory_snapshots(app: tauri::AppHandle) -> Result<MemorySnapshotCandidates, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let (primary, primary_error) = read_memory_file(&dir.join(MEMORY_FILE));
        let (backup, backup_error) = read_memory_file(&dir.join(MEMORY_BACKUP_FILE));
        MemorySnapshotCandidates {
            primary,
            backup,
            primary_error,
            backup_error,
        }
    })
    .await
    .map_err(|error| format!("memory load task failed: {error}"))
}

#[cfg(test)]
mod conversation_storage_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("veyra-conversation-storage-{nonce}"))
    }

    #[test]
    fn atomic_snapshot_write_rotates_the_previous_primary_to_backup() {
        let dir = unique_test_dir();
        write_conversation_snapshot_files(&dir, r#"{"version":1}"#).expect("write first snapshot");
        write_conversation_snapshot_files(&dir, r#"{"version":2}"#).expect("write second snapshot");

        assert_eq!(
            fs::read_to_string(dir.join(CONVERSATIONS_FILE)).expect("read primary"),
            r#"{"version":2}"#
        );
        assert_eq!(
            fs::read_to_string(dir.join(CONVERSATIONS_BACKUP_FILE)).expect("read backup"),
            r#"{"version":1}"#
        );
        assert!(!dir.join(CONVERSATIONS_TEMP_FILE).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn conversation_keys_must_be_exactly_32_bytes() {
        let valid = base64::engine::general_purpose::STANDARD.encode([7_u8; 32]);
        let short = base64::engine::general_purpose::STANDARD.encode([7_u8; 16]);
        assert!(validate_conversation_key(&valid).is_ok());
        assert!(validate_conversation_key(&short).is_err());
        assert!(validate_conversation_key("not base64").is_err());
    }

    #[test]
    fn memory_snapshot_writes_have_a_separate_atomic_backup() {
        let dir = unique_test_dir();
        write_memory_snapshot_files(&dir, r#"{"version":1,"revision":1}"#, false, false)
            .expect("write first memory snapshot");
        write_memory_snapshot_files(&dir, r#"{"version":1,"revision":2}"#, false, false)
            .expect("write second memory snapshot");

        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_FILE)).expect("read memory primary"),
            r#"{"version":1,"revision":2}"#
        );
        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_BACKUP_FILE)).expect("read memory backup"),
            r#"{"version":1,"revision":1}"#
        );
        assert!(!dir.join(MEMORY_TEMP_FILE).exists());
        assert!(!dir.join(MEMORY_BACKUP_TEMP_FILE).exists());
        assert!(!dir.join(CONVERSATIONS_FILE).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn memory_repair_preserves_the_recovered_backup() {
        let dir = unique_test_dir();
        fs::create_dir_all(&dir).expect("create test directory");
        fs::write(dir.join(MEMORY_FILE), "corrupt primary").expect("write corrupt primary");
        fs::write(dir.join(MEMORY_BACKUP_FILE), "valid recovered backup")
            .expect("write valid backup");
        write_memory_snapshot_files(&dir, "repaired primary", true, false).expect("repair primary");

        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_FILE)).expect("read repaired primary"),
            "repaired primary"
        );
        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_BACKUP_FILE)).expect("read recovered backup"),
            "valid recovered backup"
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restrictive_memory_save_replaces_both_recovery_copies() {
        let dir = unique_test_dir();
        write_memory_snapshot_files(&dir, "old encrypted snapshot", false, false)
            .expect("write initial snapshot");
        write_memory_snapshot_files(&dir, "restricted encrypted snapshot", false, true)
            .expect("write restrictive snapshot");

        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_FILE)).expect("read primary"),
            "restricted encrypted snapshot"
        );
        assert_eq!(
            fs::read_to_string(dir.join(MEMORY_BACKUP_FILE)).expect("read backup"),
            "restricted encrypted snapshot"
        );
        assert!(!dir.join(MEMORY_TEMP_FILE).exists());
        assert!(!dir.join(MEMORY_BACKUP_TEMP_FILE).exists());
        let _ = fs::remove_dir_all(dir);
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn app_ready(app: tauri::AppHandle) {
    reveal_main_window(&app, true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(artifact_preview::ArtifactPreviewState::default())
        .register_uri_scheme_protocol("artifact-preview", |context, request| {
            artifact_preview::serve_preview(&request, context.app_handle())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_conversations,
            load_conversation_snapshots,
            load_or_create_conversation_key,
            save_memory_snapshot,
            load_memory_snapshots,
            save_provider_credential,
            load_provider_credential,
            delete_provider_credential,
            app_ready,
            artifact_preview::register_artifact_preview,
            exit_app,
            app_update::install_app_update,
            agents::commands::check_pi_available,
            agents::reasoning::inspect_agent_reasoning,
            agents::workspace::inspect_agent_workspace,
            agents::commands::run_pi_agent,
            agents::commands::stop_pi_agent,
            connectivity::commands::probe_internet_connectivity,
            web_search::engine::web_search,
            web_search::engine::get_search_engine_status,
            web_search::engine::restart_search_engine,
            web_search::engine::stop_search_engine,
            web_search::engine::get_search_engine_logs,
            web_search::commands::search_arxiv,
            web_search::commands::search_wikipedia,
            web_search::fetch_commands::fetch_and_extract_pages,
            web_search::fetch_commands::clear_web_fetch_cache,
            web_search::fetch_commands::get_web_fetch_cache_stats,
            shared::lm_studio_setup::start_lm_studio_server,
            projects::commands::create_project,
            projects::commands::update_project,
            projects::commands::list_projects,
            projects::commands::delete_project,
            projects::commands::export_project_manifest,
            research::commands::create_research_run,
            research::commands::get_research_run,
            research::commands::update_research_run,
            research::commands::list_research_runs,
            research::commands::delete_research_run,
            research::commands::create_research_step,
            research::commands::update_research_step,
            research::commands::create_research_source,
            research::commands::update_research_source,
            research::commands::create_research_evidence,
            research::commands::create_research_claim,
            research::commands::update_research_claim,
            research::commands::create_research_contradiction,
            research::commands::create_research_report,
            research::commands::update_research_report,
            research::commands::update_research_source_after_fetch,
            file_extraction::commands::extract_file_text,
            extensions::commands::snapshot_skill_directory,
            extensions::commands::snapshot_skill_zip,
            extensions::commands::discover_streamable_http_mcp,
            extensions::commands::discover_stdio_mcp,
            extensions::commands::call_streamable_http_mcp,
            extensions::commands::read_streamable_http_mcp_resource,
            extensions::commands::get_streamable_http_mcp_prompt,
            extensions::commands::read_stdio_mcp_resource,
            extensions::commands::get_stdio_mcp_prompt,
            extensions::commands::call_stdio_mcp,
        ])
        .setup(|app| {
            let project_db_state = projects::db::ProjectDbState::new(app.handle().clone());
            project_db_state.spawn_background_init();
            app.manage(project_db_state);

            let research_db_state = research::db::ResearchDbState::new(app.handle().clone());
            research_db_state.spawn_background_init();
            app.manage(research_db_state);

            let search_engine_state =
                web_search::engine::SearchEngineState::new(app.handle().clone());
            search_engine_state.start_background();
            app.manage(search_engine_state);

            agents::reasoning::start_reasoning_watcher(app.handle().clone());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<web_search::engine::SearchEngineState>();
                state.stop_now();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                RunEvent::Ready => {
                    // Do not rely on the frontend to reveal the window — if JS fails to
                    // boot or invoke app_ready, the app would stay invisible forever.
                    reveal_main_window(app_handle, false);
                }
                RunEvent::ExitRequested { .. } => {
                    agents::commands::stop_all_pi_agents();
                    if let Some(state) =
                        app_handle.try_state::<web_search::engine::SearchEngineState>()
                    {
                        state.stop_now();
                    }
                }
                _ => {}
            }
        });
}
