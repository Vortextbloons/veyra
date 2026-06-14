use std::fs;
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

mod agent_commands;
mod character_commands;
mod character_db;
mod connectivity_commands;
mod constants;
mod db_utils;
mod document_commands;
mod document_db;
mod email_commands;
mod email_db;
mod lm_studio_setup;
mod memory_commands;
mod memory_db;
mod path_utils;
mod project_commands;
mod project_db;
mod research_commands;
mod research_db;
mod research_html_parser;
mod research_source_fetcher;
mod searxng_setup;
mod web_search_commands;

const CONVERSATIONS_FILE: &str = "conversations.json";
const CONVERSATION_KEY_FILE: &str = "conversation.key";
const MAX_CONVERSATIONS_JSON_BYTES: usize = 50 * 1024 * 1024;

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
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join(CONVERSATIONS_FILE), conversations_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_or_create_conversation_key(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(CONVERSATION_KEY_FILE);

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_conversation_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    if key.trim().len() < 40 {
        return Err("conversation key is invalid".into());
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join(CONVERSATION_KEY_FILE), key).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_conversations(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(CONVERSATIONS_FILE);

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(path).map_err(|error| error.to_string())
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
            agent_commands::check_opencode_available,
            agent_commands::list_opencode_project_sessions,
            agent_commands::export_opencode_session,
            agent_commands::delete_opencode_session,
            agent_commands::run_opencode_agent,
            agent_commands::stop_opencode_agent,
            memory_commands::list_memory_folders,
            memory_commands::list_memory_files,
            memory_commands::list_memory_nodes,
            memory_commands::create_memory_node,
            memory_commands::update_memory_node,
            memory_commands::delete_memory_node,
            memory_commands::archive_memory_node,
            memory_commands::pin_memory_node,
            memory_commands::search_memory,
            connectivity_commands::probe_internet_connectivity,
            web_search_commands::web_search_searxng,
            web_search_commands::test_searxng_connection,
            searxng_setup::check_searxng_setup,
            searxng_setup::start_searxng_container,
            searxng_setup::stop_searxng_container,
            lm_studio_setup::start_lm_studio_server,
            document_commands::create_document,
            document_commands::get_document,
            document_commands::update_document,
            document_commands::list_documents,
            document_commands::delete_document,
            document_commands::create_document_version,
            document_commands::list_document_versions,
            document_commands::get_document_version,
            document_commands::restore_document_version,
            document_commands::export_document_markdown,
            document_commands::export_document_txt,
            email_commands::email_list_accounts,
            email_commands::email_add_account,
            email_commands::email_configure_gmail_oauth,
            email_commands::email_connect_gmail,
            email_commands::email_sync_account,
            email_commands::email_remove_account,
            email_commands::email_list_threads,
            email_commands::email_get_thread,
            email_commands::email_send_message,
            email_commands::email_save_draft,
            email_commands::email_archive_thread,
            email_commands::email_mark_read,
            email_commands::email_mark_unread,
            project_commands::create_project,
            project_commands::get_project,
            project_commands::update_project,
            project_commands::list_projects,
            project_commands::delete_project,
            project_commands::export_project_manifest,
            research_commands::create_research_run,
            research_commands::get_research_run,
            research_commands::update_research_run,
            research_commands::list_research_runs,
            research_commands::delete_research_run,
            research_commands::create_research_step,
            research_commands::update_research_step,
            research_commands::create_research_source,
            research_commands::update_research_source,
            research_commands::create_research_evidence,
            research_commands::create_research_claim,
            research_commands::update_research_claim,
            research_commands::create_research_contradiction,
            research_commands::create_research_report,
            research_commands::update_research_report,
            research_commands::fetch_research_source,
            research_commands::fetch_research_sources_bulk,
            research_commands::update_research_source_after_fetch,
            character_commands::create_character,
            character_commands::get_character,
            character_commands::update_character,
            character_commands::list_characters,
            character_commands::delete_character,
        ])
        .setup(|app| {
            let db_state = memory_db::MemoryDbState::new(app.handle().clone());
            db_state.spawn_background_init();
            app.manage(db_state);

            let doc_db_state = document_db::DocumentDbState::new(app.handle().clone());
            doc_db_state.spawn_background_init();
            app.manage(doc_db_state);

            let email_db_state = email_db::EmailDbState::new(app.handle().clone());
            email_db_state.spawn_background_init();
            app.manage(email_db_state);

            let project_db_state = project_db::ProjectDbState::new(app.handle().clone());
            project_db_state.spawn_background_init();
            app.manage(project_db_state);

            let research_db_state = research_db::ResearchDbState::new(app.handle().clone());
            research_db_state.spawn_background_init();
            app.manage(research_db_state);

            let character_db_state = character_db::CharacterDbState::new(app.handle().clone());
            character_db_state.spawn_background_init();
            app.manage(character_db_state);

            let searxng_state = searxng_setup::SearxngState::new();
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
                let state = window.state::<searxng_setup::SearxngState>();
                if state.was_started_by_us() {
                    searxng_setup::stop_container();
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
                    reveal_main_window(&app_handle, false);
                }
                RunEvent::ExitRequested { .. } => {
                    if let Some(state) = app_handle.try_state::<searxng_setup::SearxngState>() {
                        if state.was_started_by_us() {
                            searxng_setup::stop_container();
                            state.clear_started();
                        }
                    }
                }
                _ => {}
            }
        });
}
