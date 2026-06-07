use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, RunEvent, WindowEvent};

/// Ensures `app_ready` only reveals/focuses the window once per process (avoids
/// stealing focus on Vite HMR remounts during `tauri dev`).
static INITIAL_WINDOW_SHOWN: AtomicBool = AtomicBool::new(false);

mod agent_commands;
mod lm_studio_setup;
mod memory_commands;
mod memory_db;
mod searxng_setup;
mod web_search_commands;

const CONVERSATIONS_FILE: &str = "conversations.json";
const CONVERSATION_KEY_FILE: &str = "conversation.key";

#[tauri::command]
fn save_conversations(app: tauri::AppHandle, conversations_json: String) -> Result<(), String> {
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
    if INITIAL_WINDOW_SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        // Dev: never steal OS focus on show/HMR. Release: focus on first real launch.
        if !cfg!(debug_assertions) {
            let _ = window.set_focus();
        }
    }
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
            memory_commands::list_memory_folders,
            memory_commands::list_memory_files,
            memory_commands::list_memory_nodes,
            memory_commands::create_memory_node,
            memory_commands::update_memory_node,
            memory_commands::delete_memory_node,
            memory_commands::archive_memory_node,
            memory_commands::pin_memory_node,
            memory_commands::search_memory,
            web_search_commands::web_search_searxng,
            web_search_commands::test_searxng_connection,
            searxng_setup::check_searxng_setup,
            searxng_setup::start_searxng_container,
            searxng_setup::stop_searxng_container,
            lm_studio_setup::lm_studio_server_running,
            lm_studio_setup::start_lm_studio_server,
        ])
        .setup(|app| {
            let db_state = memory_db::MemoryDbState::new(app.handle().clone());
            db_state.spawn_background_init();
            app.manage(db_state);

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
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<searxng_setup::SearxngState>() {
                    if state.was_started_by_us() {
                        searxng_setup::stop_container();
                        state.clear_started();
                    }
                }
            }
        });
}
