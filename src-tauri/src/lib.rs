use std::fs;
use tauri::Manager;

mod memory_commands;
mod memory_db;

const CONVERSATIONS_FILE: &str = "conversations.json";

#[tauri::command]
fn save_conversations(app: tauri::AppHandle, conversations_json: String) -> Result<(), String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?;
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  fs::write(dir.join(CONVERSATIONS_FILE), conversations_json).map_err(|error| error.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
      save_conversations,
      load_conversations,
      memory_commands::list_memory_folders,
      memory_commands::list_memory_files,
      memory_commands::list_memory_nodes,
      memory_commands::create_memory_node,
      memory_commands::update_memory_node,
      memory_commands::delete_memory_node,
      memory_commands::archive_memory_node,
      memory_commands::pin_memory_node,
      memory_commands::search_memory,
    ])
    .setup(|app| {
      let db = memory_db::MemoryDb::init(app.handle())?;
      app.manage(db);
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
