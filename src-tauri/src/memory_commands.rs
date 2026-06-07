use crate::db_utils::run_db_command;
use crate::memory_db::{self, MemoryDbState};
use tauri::State;

#[tauri::command]
pub async fn list_memory_folders(
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFolderRow>, String> {
    run_db_command(state.inner(), "memory", |conn| {
        memory_db::list_folders(conn)
    })
    .await
}

#[tauri::command]
pub async fn list_memory_files(
    folder_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFileRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_files(conn, folder_id)
    })
    .await
}

#[tauri::command]
pub async fn list_memory_nodes(
    filter: String,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_nodes(conn, filter)
    })
    .await
}

#[tauri::command]
pub async fn create_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::create_node(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn update_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::update_node(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn delete_memory_node(id: String, state: State<'_, MemoryDbState>) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::delete_node(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn archive_memory_node(
    id: String,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::archive_node(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn pin_memory_node(
    id: String,
    pinned: bool,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::pin_node(conn, id, pinned)
    })
    .await
}

#[tauri::command]
pub async fn search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::search_nodes(conn, query, limit as i64, project_id)
    })
    .await
}
