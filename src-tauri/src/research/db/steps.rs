use rusqlite::{params_from_iter, types::Value, Connection};

use super::types::{
    generate_id, CreateResearchStepInput, ResearchStepRow, UpdateResearchStepInput,
};

const STEP_SELECT_COLS: &str = "id, run_id, type, status, title, detail, output, error, started_at, completed_at, tokens_used, model_used, created_at";

fn row_to_step(row: &rusqlite::Row) -> rusqlite::Result<ResearchStepRow> {
    Ok(ResearchStepRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        step_type: row.get("type")?,
        status: row.get("status")?,
        title: row.get("title")?,
        detail: row.get("detail")?,
        output: row.get("output")?,
        error: row.get("error")?,
        started_at: row.get("started_at")?,
        completed_at: row.get("completed_at")?,
        tokens_used: row.get("tokens_used")?,
        model_used: row.get("model_used")?,
        created_at: row.get("created_at")?,
    })
}

pub fn create_step(conn: &Connection, input_json: String) -> Result<ResearchStepRow, String> {
    let input: CreateResearchStepInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_step input: {}", e))?;
    if input.title.is_empty() {
        return Err("create_step requires title".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("step"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_step transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_steps
           (id, run_id, type, status, title, detail, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            input.run_id,
            input.step_type,
            "pending",
            input.title,
            input.detail,
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_step failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_steps WHERE id = ?1",
                STEP_SELECT_COLS
            ),
            [&id],
            row_to_step,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_step transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_step(conn: &Connection, input_json: String) -> Result<ResearchStepRow, String> {
    let input: UpdateResearchStepInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_step input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_step requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.detail {
        sets.push(format!("detail = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.output {
        sets.push(format!("output = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.started_at {
        sets.push(format!("started_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.completed_at {
        sets.push(format!("completed_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tokens_used {
        sets.push(format!("tokens_used = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.model_used {
        sets.push(format!("model_used = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_step requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_steps SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_step failed: {}", e))?;

    conn.query_row(
        &format!(
            "SELECT {} FROM research_steps WHERE id = ?1",
            STEP_SELECT_COLS
        ),
        [&input.id],
        row_to_step,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_steps_for_run(
    conn: &Connection,
    run_id: String,
) -> Result<Vec<ResearchStepRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_steps WHERE run_id = ?1 ORDER BY created_at ASC",
            STEP_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_steps_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_step)
        .map_err(|e| format!("query list_steps_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_steps_for_run: {}", e))?);
    }
    Ok(out)
}
