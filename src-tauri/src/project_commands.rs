use crate::db_utils::run_db_command;
use crate::project_db::{self, ProjectDbState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExportManifest {
    pub schema_version: i64,
    pub exported_at: String,
    pub project: project_db::ProjectRow,
    pub chat_ids: Vec<String>,
    pub document_ids: Vec<String>,
    pub memory_node_ids: Vec<String>,
}

#[tauri::command]
pub async fn create_project(
    input: String,
    state: State<'_, ProjectDbState>,
) -> Result<project_db::ProjectRow, String> {
    run_db_command(state.inner(), "project", move |conn| {
        project_db::create_project(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn get_project(
    id: String,
    state: State<'_, ProjectDbState>,
) -> Result<project_db::ProjectRow, String> {
    run_db_command(state.inner(), "project", move |conn| {
        project_db::get_project(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn update_project(
    input: String,
    state: State<'_, ProjectDbState>,
) -> Result<project_db::ProjectRow, String> {
    run_db_command(state.inner(), "project", move |conn| {
        project_db::update_project(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn list_projects(
    status: Option<String>,
    state: State<'_, ProjectDbState>,
) -> Result<Vec<project_db::ProjectRow>, String> {
    run_db_command(state.inner(), "project", move |conn| {
        project_db::list_projects(conn, status)
    })
    .await
}

#[tauri::command]
pub async fn delete_project(
    id: String,
    state: State<'_, ProjectDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "project", move |conn| {
        project_db::delete_project(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn export_project_manifest(
    project_id: String,
    target_path: String,
    chat_ids: Vec<String>,
    document_ids: Vec<String>,
    memory_node_ids: Vec<String>,
    state: State<'_, ProjectDbState>,
) -> Result<(), String> {
    let manifest = run_db_command(state.inner(), "project", move |conn| {
        let project = project_db::get_project(conn, project_id)?;
        let now = chrono::Utc::now().to_rfc3339();
        Ok(ProjectExportManifest {
            schema_version: 1,
            exported_at: now,
            project,
            chat_ids,
            document_ids,
            memory_node_ids,
        })
    })
    .await?;

    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("failed to serialize manifest: {}", e))?;
    std::fs::write(&target_path, json)
        .map_err(|e| format!("failed to write manifest: {}", e))?;
    Ok(())
}
