use crate::projects::db::{self as project_db, ProjectDbState};
use crate::shared::db_utils::run_db_command;
use crate::shared::path_utils::validate_export_file_path;
use crate::vault::state::VaultManager;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExportManifest {
    pub schema_version: i64,
    pub exported_at: String,
    pub project: project_db::ProjectRow,
    pub chat_ids: Vec<String>,
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

/// Deletes an ordinary (unlocked) project. Lock-enabled projects must go
/// through `delete_locked_project`, which destroys the vault instead of
/// detaching protected conversations into ordinary chat scope.
#[tauri::command]
pub async fn delete_project(id: String, state: State<'_, ProjectDbState>) -> Result<(), String> {
    run_db_command(state.inner(), "project", move |conn| {
        let existing = project_db::try_get_project(conn, &id)?;
        if let Some(row) = existing {
            if row.is_lock_enabled() {
                return Err(
                    "This project is password-locked. Delete it from the project menu, which destroys its encrypted vault."
                        .to_string(),
                );
            }
        }
        project_db::delete_project(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn export_project_manifest(
    project_id: String,
    target_path: String,
    chat_ids: Vec<String>,
    state: State<'_, ProjectDbState>,
    vault_manager: State<'_, VaultManager>,
) -> Result<(), String> {
    // A locked project's name, instructions, and settings are vault-owned; the
    // plaintext manifest command must never be a bypass. Unlocked exports go
    // through `export_locked_project`.
    let is_locked = run_db_command(state.inner(), "project", {
        let project_id = project_id.clone();
        move |conn| {
            Ok(project_db::try_get_project(conn, &project_id)?
                .map(|row| row.is_lock_enabled())
                .unwrap_or(false))
        }
    })
    .await?;
    if is_locked {
        return Err(
            "This project is password-locked. Use its encrypted export instead of a plaintext manifest."
                .to_string(),
        );
    }
    let _ = &vault_manager;

    let manifest = run_db_command(state.inner(), "project", move |conn| {
        let project = project_db::get_project(conn, project_id)?;
        let now = chrono::Utc::now().to_rfc3339();
        Ok(ProjectExportManifest {
            schema_version: 1,
            exported_at: now,
            project,
            chat_ids,
        })
    })
    .await?;

    let export_path = validate_export_file_path(&target_path, &["json"])?;

    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("failed to serialize manifest: {}", e))?;
    std::fs::write(&export_path, json).map_err(|e| format!("failed to write manifest: {}", e))?;
    Ok(())
}
