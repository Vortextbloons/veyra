use crate::db_utils::run_db_command;
use crate::research_db::{self, ResearchDbState};
use crate::research_source_fetcher;
use tauri::State;

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
    input: String,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchRunRow, String> {
    run_db_command(state.inner(), "research", move |conn| {
        research_db::update_run(conn, input)
    })
    .await
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

#[tauri::command]
pub async fn fetch_research_source(
    url: String,
) -> Result<research_source_fetcher::FetchedSource, String> {
    research_source_fetcher::fetch_source_url(url).await
}

#[tauri::command]
pub async fn fetch_research_sources_bulk(
    urls: Vec<String>,
) -> Result<Vec<research_source_fetcher::FetchedSourceResult>, String> {
    Ok(research_source_fetcher::fetch_source_urls(urls).await)
}

#[tauri::command]
pub async fn update_research_source_after_fetch(
    source_id: String,
    fetched: research_source_fetcher::FetchedSource,
    state: State<'_, ResearchDbState>,
) -> Result<research_db::ResearchSourceRow, String> {
    let input = serde_json::json!({
        "id": source_id,
        "status": "fetched",
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
