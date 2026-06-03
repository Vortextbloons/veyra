use crate::memory_db::{self, MemoryDbState};
use tauri::State;

macro_rules! with_db {
    ($state:expr, |$conn:ident| $body:expr) => {{
        $state.with_connection(|$conn| $body)
    }};
}

#[tauri::command]
pub fn list_memory_folders(
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFolderRow>, String> {
    with_db!(state, |conn| memory_db::list_folders(conn))
}

#[tauri::command]
pub fn list_memory_files(
    folder_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFileRow>, String> {
    with_db!(state, |conn| memory_db::list_files(conn, folder_id))
}

#[tauri::command]
pub fn list_memory_nodes(
    filter: String,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    with_db!(state, |conn| memory_db::list_nodes(conn, filter))
}

#[tauri::command]
pub fn create_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    with_db!(state, |conn| memory_db::create_node(conn, input))
}

#[tauri::command]
pub fn update_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    with_db!(state, |conn| memory_db::update_node(conn, input))
}

#[tauri::command]
pub fn delete_memory_node(id: String, state: State<'_, MemoryDbState>) -> Result<(), String> {
    with_db!(state, |conn| memory_db::delete_node(conn, id))
}

#[tauri::command]
pub fn archive_memory_node(id: String, state: State<'_, MemoryDbState>) -> Result<(), String> {
    with_db!(state, |conn| memory_db::archive_node(conn, id))
}

#[tauri::command]
pub fn pin_memory_node(
    id: String,
    pinned: bool,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    with_db!(state, |conn| memory_db::pin_node(conn, id, pinned))
}

#[tauri::command]
pub fn search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    with_db!(state, |conn| memory_db::search_nodes(
        conn,
        query,
        limit as i64,
        project_id
    ))
}
