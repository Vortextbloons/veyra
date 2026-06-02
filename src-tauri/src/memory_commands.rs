use tauri::State;
use crate::memory_db::{self, MemoryDb};

#[tauri::command]
pub fn list_memory_folders(db: State<'_, MemoryDb>) -> Result<Vec<memory_db::MemoryFolderRow>, String> {
    let guard = db.0.lock();
    memory_db::list_folders(&guard)
}

#[tauri::command]
pub fn list_memory_files(
    folder_id: Option<String>,
    db: State<'_, MemoryDb>,
) -> Result<Vec<memory_db::MemoryFileRow>, String> {
    let guard = db.0.lock();
    memory_db::list_files(&guard, folder_id)
}

#[tauri::command]
pub fn list_memory_nodes(
    filter: String,
    db: State<'_, MemoryDb>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    let guard = db.0.lock();
    memory_db::list_nodes(&guard, filter)
}

#[tauri::command]
pub fn create_memory_node(
    input: String,
    db: State<'_, MemoryDb>,
) -> Result<memory_db::MemoryNodeRow, String> {
    let guard = db.0.lock();
    memory_db::create_node(&guard, input)
}

#[tauri::command]
pub fn update_memory_node(
    input: String,
    db: State<'_, MemoryDb>,
) -> Result<memory_db::MemoryNodeRow, String> {
    let guard = db.0.lock();
    memory_db::update_node(&guard, input)
}

#[tauri::command]
pub fn delete_memory_node(id: String, db: State<'_, MemoryDb>) -> Result<(), String> {
    let guard = db.0.lock();
    memory_db::delete_node(&guard, id)
}

#[tauri::command]
pub fn archive_memory_node(id: String, db: State<'_, MemoryDb>) -> Result<(), String> {
    let guard = db.0.lock();
    memory_db::archive_node(&guard, id)
}

#[tauri::command]
pub fn pin_memory_node(id: String, pinned: bool, db: State<'_, MemoryDb>) -> Result<(), String> {
    let guard = db.0.lock();
    memory_db::pin_node(&guard, id, pinned)
}

#[tauri::command]
pub fn search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    db: State<'_, MemoryDb>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    let guard = db.0.lock();
    memory_db::search_nodes(&guard, query, limit as i64, project_id)
}
