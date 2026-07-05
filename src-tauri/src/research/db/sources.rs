use rusqlite::{params_from_iter, types::Value, Connection};

use super::types::{
    generate_id, CreateResearchSourceInput, ResearchSourceRow, UpdateResearchSourceInput,
};

const SOURCE_SELECT_COLS: &str = "id, run_id, step_id, url, title, snippet, full_text, content_type, status, source_type, engine, score, rank, fetched_at, read_at, error, fetch_status, source_quality_json, created_at";

fn row_to_source(row: &rusqlite::Row) -> rusqlite::Result<ResearchSourceRow> {
    let source_quality_json: Option<String> = row.get("source_quality_json")?;
    let source_quality = source_quality_json.and_then(|s| serde_json::from_str(&s).ok());
    Ok(ResearchSourceRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        step_id: row.get("step_id")?,
        url: row.get("url")?,
        title: row.get("title")?,
        snippet: row.get("snippet")?,
        full_text: row.get("full_text")?,
        content_type: row.get("content_type")?,
        status: row.get("status")?,
        source_type: row.get("source_type")?,
        engine: row.get("engine")?,
        score: row.get("score")?,
        rank: row.get("rank")?,
        fetched_at: row.get("fetched_at")?,
        read_at: row.get("read_at")?,
        error: row.get("error")?,
        fetch_status: row.get("fetch_status")?,
        source_quality,
        created_at: row.get("created_at")?,
    })
}

pub fn create_source(conn: &Connection, input_json: String) -> Result<ResearchSourceRow, String> {
    let input: CreateResearchSourceInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_source input: {}", e))?;
    if input.url.is_empty() {
        return Err("create_source requires url".to_string());
    }
    if input.title.is_empty() {
        return Err("create_source requires title".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("source"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_source transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_sources
           (id, run_id, step_id, url, title, snippet, source_type, engine, score, rank, status, fetch_status, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            id,
            input.run_id,
            input.step_id,
            input.url,
            input.title,
            input.snippet,
            input.source_type,
            input.engine,
            input.score,
            input.rank,
            "discovered",
            input.fetch_status,
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_source failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_sources WHERE id = ?1",
                SOURCE_SELECT_COLS
            ),
            [&id],
            row_to_source,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_source transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_source(conn: &Connection, input_json: String) -> Result<ResearchSourceRow, String> {
    let input: UpdateResearchSourceInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_source input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_source requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.full_text {
        sets.push(format!("full_text = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.content_type {
        sets.push(format!("content_type = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.fetched_at {
        sets.push(format!("fetched_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.read_at {
        sets.push(format!("read_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.source_quality {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize source_quality: {}", e))?;
        sets.push(format!("source_quality_json = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }

    if sets.is_empty() {
        return Err("update_source requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_sources SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_source failed: {}", e))?;

    conn.query_row(
        &format!(
            "SELECT {} FROM research_sources WHERE id = ?1",
            SOURCE_SELECT_COLS
        ),
        [&input.id],
        row_to_source,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_sources_for_run(
    conn: &Connection,
    run_id: String,
) -> Result<Vec<ResearchSourceRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_sources WHERE run_id = ?1 ORDER BY rank ASC, created_at ASC",
            SOURCE_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_sources_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_source)
        .map_err(|e| format!("query list_sources_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_sources_for_run: {}", e))?);
    }
    Ok(out)
}
