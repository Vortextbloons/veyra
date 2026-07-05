use rusqlite::{params_from_iter, types::Value, Connection};

use super::types::{
    generate_id, CreateResearchRunInput, ListResearchRunsFilter, ResearchRunRow,
    UpdateResearchRunInput,
};

const RUN_SELECT_COLS: &str = "id, project_id, question, clarified_question, depth, status, plan_json, current_step_id, progress_percent, created_at, updated_at, completed_at, error, model_used, provider_id, total_tokens_used, search_provider";

fn row_to_run(row: &rusqlite::Row) -> rusqlite::Result<ResearchRunRow> {
    let plan_json: Option<String> = row.get("plan_json")?;
    let plan = plan_json.and_then(|s| serde_json::from_str(&s).ok());
    Ok(ResearchRunRow {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        question: row.get("question")?,
        clarified_question: row.get("clarified_question")?,
        depth: row.get("depth")?,
        status: row.get("status")?,
        plan,
        current_step_id: row.get("current_step_id")?,
        progress_percent: row.get("progress_percent")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        error: row.get("error")?,
        model_used: row.get("model_used")?,
        provider_id: row.get("provider_id")?,
        total_tokens_used: row.get("total_tokens_used")?,
        search_provider: row.get("search_provider")?,
    })
}

pub fn create_run(conn: &Connection, input_json: String) -> Result<ResearchRunRow, String> {
    let input: CreateResearchRunInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_run input: {}", e))?;
    if input.question.is_empty() {
        return Err("create_run requires question".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("run"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or_else(|| now.clone());
    let updated_at = input.updated_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_run transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_runs
           (id, project_id, question, depth, status, progress_percent, created_at, updated_at, model_used, provider_id)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            input.project_id,
            input.question,
            input.depth,
            "planning",
            0i64,
            created_at,
            updated_at,
            input.model_used,
            input.provider_id,
        ],
    )
    .map_err(|e| format!("insert research_run failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_runs WHERE id = ?1",
                RUN_SELECT_COLS
            ),
            [&id],
            row_to_run,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_run transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_run(conn: &Connection, id: String) -> Result<ResearchRunRow, String> {
    conn.query_row(
        &format!(
            "SELECT {} FROM research_runs WHERE id = ?1",
            RUN_SELECT_COLS
        ),
        [&id],
        row_to_run,
    )
    .map_err(|e| format!("get_run failed: {}", e))
}

pub fn update_run(conn: &Connection, input_json: String) -> Result<ResearchRunRow, String> {
    let input: UpdateResearchRunInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_run input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_run requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.clarified_question {
        sets.push(format!("clarified_question = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.plan {
        let json =
            serde_json::to_string(&v).map_err(|e| format!("failed to serialize plan: {}", e))?;
        sets.push(format!("plan_json = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.current_step_id {
        sets.push(format!("current_step_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.progress_percent {
        sets.push(format!("progress_percent = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.completed_at {
        sets.push(format!("completed_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.total_tokens_used {
        sets.push(format!("total_tokens_used = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    sets.push(format!("updated_at = ?{}", params.len() + 1));
    params.push(Value::Text(
        input
            .updated_at
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    ));
    if let Some(v) = input.search_provider {
        sets.push(format!("search_provider = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_run requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_runs SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_run failed: {}", e))?;

    get_run(conn, input.id)
}

pub fn list_runs(conn: &Connection, filter_json: String) -> Result<Vec<ResearchRunRow>, String> {
    let trimmed = filter_json.trim();
    let filter: ListResearchRunsFilter = if trimmed.is_empty() || trimmed == "null" {
        ListResearchRunsFilter {
            project_id: None,
            status: None,
            limit: None,
        }
    } else {
        serde_json::from_str(trimmed).map_err(|e| format!("invalid list_runs filter: {}", e))?
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(pid) = &filter.project_id {
        conditions.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(pid.clone()));
    }
    if let Some(statuses) = &filter.status {
        if !statuses.is_empty() {
            let placeholders: Vec<String> = (1..=statuses.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("status IN ({})", placeholders.join(",")));
            for s in statuses {
                params.push(Value::Text(s.clone()));
            }
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT {} FROM research_runs{} ORDER BY created_at DESC LIMIT ?{}",
        RUN_SELECT_COLS, where_clause, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_runs failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), row_to_run)
        .map_err(|e| format!("query list_runs failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_runs: {}", e))?);
    }
    Ok(out)
}

pub fn delete_run(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM research_runs WHERE id = ?1", [&id])
        .map_err(|e| format!("delete research_run failed: {}", e))?;
    Ok(())
}
