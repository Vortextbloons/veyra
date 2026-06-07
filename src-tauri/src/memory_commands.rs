use crate::memory_db::{self, MemoryDbState};
use tauri::State;

async fn run_db<T, F>(state: &MemoryDbState, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> Result<T, String> + Send + 'static,
{
    let state = state.clone();
    tauri::async_runtime::spawn_blocking(move || state.with_connection(f))
        .await
        .map_err(|error| format!("memory db task failed: {error}"))?
}

#[tauri::command]
pub async fn list_memory_folders(
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFolderRow>, String> {
    run_db(state.inner(), |conn| memory_db::list_folders(conn)).await
}

#[tauri::command]
pub async fn list_memory_files(
    folder_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFileRow>, String> {
    run_db(state.inner(), move |conn| memory_db::list_files(conn, folder_id)).await
}

#[tauri::command]
pub async fn list_memory_nodes(
    filter: String,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db(state.inner(), move |conn| memory_db::list_nodes(conn, filter)).await
}

#[tauri::command]
pub async fn create_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    run_db(state.inner(), move |conn| memory_db::create_node(conn, input)).await
}

#[tauri::command]
pub async fn update_memory_node(
    input: String,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    run_db(state.inner(), move |conn| memory_db::update_node(conn, input)).await
}

#[tauri::command]
pub async fn delete_memory_node(
    id: String,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db(state.inner(), move |conn| memory_db::delete_node(conn, id)).await
}

#[tauri::command]
pub async fn archive_memory_node(
    id: String,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db(state.inner(), move |conn| memory_db::archive_node(conn, id)).await
}

#[tauri::command]
pub async fn pin_memory_node(
    id: String,
    pinned: bool,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db(state.inner(), move |conn| memory_db::pin_node(conn, id, pinned)).await
}

#[tauri::command]
pub async fn search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db(state.inner(), move |conn| {
        memory_db::search_nodes(conn, query, limit as i64, project_id)
    })
    .await
}
