use std::fs;
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
mod characters;
mod code_execution;
mod connectivity;
mod documents;
mod email;
mod file_extraction;
mod memory;
mod projects;
mod research;
mod shared;
mod web_search;

const CONVERSATIONS_FILE: &str = "conversations.json";
const CONVERSATION_KEY_FILE: &str = "conversation.key";
const MAX_CONVERSATIONS_JSON_BYTES: usize = 50 * 1024 * 1024;
const KEYRING_SERVICE: &str = "com.veyra.app";
const KEYRING_USER: &str = "conversation-key";

fn app_data_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(file_name))
}

fn read_app_data_file(app: &tauri::AppHandle, file_name: &str) -> Result<String, String> {
    let path = app_data_file_path(app, file_name)?;
    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(path).map_err(|error| error.to_string())
}

fn write_app_data_file(app: &tauri::AppHandle, file_name: &str, contents: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join(file_name), contents).map_err(|error| error.to_string())
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
    write_app_data_file(&app, CONVERSATIONS_FILE, conversations_json)
}

#[tauri::command]
fn load_or_create_conversation_key(app: tauri::AppHandle) -> Result<String, String> {
    // File is the source of truth — always prefer it
    let file_key = read_app_data_file(&app, CONVERSATION_KEY_FILE)?;
    if !file_key.is_empty() {
        let trimmed = file_key.trim().to_string();
        if !trimmed.is_empty() {
            // Best-effort: also write to keyring so future reads can use stronger storage
            if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
                let _ = entry.set_password(&trimmed);
            }
            return Ok(trimmed);
        }
    }

    // File missing — try keyring as fallback
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        match entry.get_password() {
            Ok(key) => {
                let trimmed = key.trim().to_string();
                if !trimmed.is_empty() {
                    eprintln!("[veyra] conversation key recovered from keyring (file missing)");
                    return Ok(trimmed);
                }
            }
            Err(e) => {
                eprintln!("[veyra] keyring read failed: {e}");
            }
        }
    }

    Ok(String::new())
}

#[tauri::command]
fn save_conversation_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.len() < 40 {
        return Err("conversation key is invalid".into());
    }

    // Always persist to file as a reliable backup
    write_app_data_file(&app, CONVERSATION_KEY_FILE, trimmed.clone())?;

    // Best-effort: also write to keyring for stronger at-rest protection
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        if entry.set_password(&trimmed).is_ok() {
            return Ok(());
        }
        eprintln!("[veyra] keyring write failed; key saved to file only");
    } else {
        eprintln!("[veyra] keyring unavailable; key saved to file only");
    }

    Ok(())
}

#[tauri::command]
fn load_conversations(app: tauri::AppHandle) -> Result<String, String> {
    read_app_data_file(&app, CONVERSATIONS_FILE)
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
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_conversations,
            load_conversations,
            load_or_create_conversation_key,
            save_conversation_key,
            app_ready,
            exit_app,
            agents::commands::check_pi_available,
            agents::commands::run_pi_agent,
            agents::commands::stop_pi_agent,
            agents::commands::list_pi_sessions,
            agents::commands::switch_pi_session,
            agents::commands::delete_pi_session,
            code_execution::commands::check_python_available,
            code_execution::commands::execute_python_code,
            memory::commands::list_memory_folders,
            memory::commands::list_memory_files,
            memory::commands::list_memory_nodes,
            memory::commands::create_memory_node,
            memory::commands::update_memory_node,
            memory::commands::delete_memory_node,
            memory::commands::archive_memory_node,
            memory::commands::pin_memory_node,
            memory::commands::search_memory,
            memory::commands::vector_search_memory,
            memory::commands::compute_all_embeddings,
            memory::commands::get_embedding_memory_status,
            memory::commands::find_duplicate_memory_nodes,
            connectivity::commands::probe_internet_connectivity,
            web_search::commands::web_search_searxng,
            web_search::commands::test_searxng_connection,
            web_search::commands::search_arxiv,
            web_search::commands::search_wikipedia,
            web_search::fetch_commands::fetch_and_extract_pages,
            web_search::fetch_commands::clear_web_fetch_cache,
            web_search::fetch_commands::get_web_fetch_cache_stats,
            web_search::searxng_setup::check_searxng_setup,
            web_search::searxng_setup::start_searxng_container,
            web_search::searxng_setup::stop_searxng_container,
            shared::lm_studio_setup::start_lm_studio_server,
            documents::commands::create_document,
            documents::commands::get_document,
            documents::commands::update_document,
            documents::commands::list_documents,
            documents::commands::delete_document,
            documents::commands::create_document_version,
            documents::commands::list_document_versions,
            documents::commands::get_document_version,
            documents::commands::restore_document_version,
            documents::commands::export_document_markdown,
            documents::commands::export_document_txt,
            documents::commands::create_document_folder,
            documents::commands::list_document_folders,
            documents::commands::update_document_folder,
            documents::commands::delete_document_folder,
            documents::commands::move_document_to_folder,
            email::commands::email_list_accounts,
            email::commands::email_add_account,
            email::commands::email_configure_gmail_oauth,
            email::commands::email_connect_gmail,
            email::commands::email_connect_gmail_with_config,
            email::commands::email_has_gmail_oauth_config,
            email::commands::email_sync_account,
            email::commands::email_sync_all_gmail,
            email::commands::email_remove_account,
            email::commands::email_list_folders,
            email::commands::email_list_threads,
            email::commands::email_get_thread,
            email::commands::email_send_message,
            email::commands::email_save_draft,
            email::commands::email_archive_thread,
            email::commands::email_mark_read,
            email::commands::email_mark_unread,
            email::commands::email_reparse_message,
            email::commands::email_list_attachments,
            email::commands::email_download_attachment,
            email::commands::email_extract_attachment_text,
            email::commands::email_open_attachment,
            email::commands::email_enqueue_ai_jobs,
            email::commands::email_claim_ai_job,
            email::commands::email_complete_ai_job,
            email::commands::email_fail_ai_job,
            email::commands::email_cancel_ai_job,
            email::commands::email_list_ai_jobs,
            email::commands::email_list_ai_outputs,
            email::commands::email_get_unprocessed_thread_ids,
            projects::commands::create_project,
            projects::commands::get_project,
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
            characters::commands::create_character,
            characters::commands::get_character,
            characters::commands::update_character,
            characters::commands::list_characters,
            characters::commands::delete_character,
            characters::group_commands::create_character_group,
            characters::group_commands::get_character_group,
            characters::group_commands::update_character_group,
            characters::group_commands::list_character_groups,
            characters::group_commands::delete_character_group,
            characters::io_commands::read_text_file,
            characters::io_commands::read_binary_file,
            characters::io_commands::write_text_file,
            characters::io_commands::write_binary_file,
            characters::io_commands::export_character_card,
            characters::io_commands::save_character_avatar,
            characters::io_commands::delete_character_avatar,
            characters::io_commands::read_character_avatar,
            file_extraction::commands::extract_file_text,
        ])
        .setup(|app| {
            code_execution::commands::cleanup_stale_temp_files();

            let db_state = memory::db::MemoryDbState::new(app.handle().clone());
            db_state.spawn_background_init();
            app.manage(db_state);

            let doc_db_state = documents::db::DocumentDbState::new(app.handle().clone());
            doc_db_state.spawn_background_init();
            app.manage(doc_db_state);

            let email_db_state = email::db::EmailDbState::new(app.handle().clone());
            email_db_state.spawn_background_init();
            app.manage(email_db_state);

            let project_db_state = projects::db::ProjectDbState::new(app.handle().clone());
            project_db_state.spawn_background_init();
            app.manage(project_db_state);

            let research_db_state = research::db::ResearchDbState::new(app.handle().clone());
            research_db_state.spawn_background_init();
            app.manage(research_db_state);

            let character_db_state = characters::db::CharacterDbState::new(app.handle().clone());
            character_db_state.spawn_background_init();
            app.manage(character_db_state);

            let character_group_db_state =
                characters::group_db::CharacterGroupDbState::new(app.handle().clone());
            character_group_db_state.spawn_background_init();
            app.manage(character_group_db_state);

            let searxng_state = web_search::searxng_setup::SearxngState::new();
            app.manage(searxng_state);

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
                let state = window.state::<web_search::searxng_setup::SearxngState>();
                if state.was_started_by_us() {
                    web_search::searxng_setup::stop_container();
                    state.clear_started();
                }
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
                    if let Some(state) = app_handle.try_state::<web_search::searxng_setup::SearxngState>() {
                        if state.was_started_by_us() {
                            web_search::searxng_setup::stop_container();
                            state.clear_started();
                        }
                    }
                }
                _ => {}
            }
        });
}
