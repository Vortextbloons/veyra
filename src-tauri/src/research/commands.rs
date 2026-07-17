use crate::research::db::{self as research_db, ResearchDbState};
use crate::shared::db_utils::run_db_command;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

#[derive(Serialize, Clone)]
struct PlanApprovedEvent {
    #[serde(rename = "runId")]
    run_id: String,
}

#[tauri::command]
pub async fn create_research_run(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchRunRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_run(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn get_research_run(
    id: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchRunWithRelations, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::get_run_with_relations(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn update_research_run(
    app: tauri::AppHandle,
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchRunRow, String> {
    let result = run_db_command(state.inner(), "research", move |conn| {
        research_db::update_run(conn, input)
    })
    .await?;
    if result
        .plan
        .as_ref()
        .map(|p| p.user_approved)
        .unwrap_or(false)
    {
        let _ = app.emit(
            "research://plan-approved",
            PlanApprovedEvent {
                run_id: result.id.clone(),
            },
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_research_runs(
    filter: String,
    state: State<'_, ResearchDbState>,
) -> Result<Vec<research_db::ResearchRunRow>, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::list_runs(conn, filter)
    })
    .await
}

#[tauri::command]
pub async fn delete_research_run(
    id: String,
    state: State<'_, ResearchDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::delete_run(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn create_research_step(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchStepRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_step(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn update_research_step(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchStepRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_step(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn create_research_source(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchSourceRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_source(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn update_research_source(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchSourceRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_source(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn create_research_evidence(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchEvidenceRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_evidence(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn create_research_claim(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchClaimRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_claim(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn update_research_claim(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchClaimRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_claim(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn create_research_contradiction(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchContradictionRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_contradiction(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn create_research_report(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchReportRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::create_report(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn update_research_report(
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchReportRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_report(conn, input)
    })
    .await
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchedSource {
    pub url: String,
    pub title: String,
    pub content_type: String,
    pub text_content: String,
    pub status_code: i64,
    pub fetch_error: Option<String>,
    pub fetched_at: String,
    /// Whether the fetch itself succeeded. When false, the row is marked
    /// "failed" instead of "fetched" and `fetch_error` is recorded.
    #[serde(default = "default_fetch_ok")]
    pub ok: bool,
}

fn default_fetch_ok() -> bool {
    true
}

#[tauri::command]
pub async fn update_research_source_after_fetch(
    source_id: String,
    fetched: FetchedSource,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchSourceRow, String> {
    let status = if fetched.ok { "fetched" } else { "failed" };
    let input = serde_json::json!({
        "id": source_id,
        "status": status,
        "fullText": fetched.text_content,
        "contentType": fetched.content_type,
        "fetchedAt": fetched.fetched_at,
        "error": fetched.fetch_error,
    });

    let input_json = serde_json::to_string(&input)
        .map_err(|e| format!("failed to serialize update input: {}", e))?;

    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_source(conn, input_json)
    })
    .await
}
