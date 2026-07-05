use rusqlite::{params, Connection};

use super::helpers::{new_uuid_id, now_ms};
use super::types::*;

pub const AI_JOB_COLUMNS: &str = "id, account_id, thread_id, message_id, attachment_id, task_type, priority, status, model_id, tone, attempt_count, max_attempts, scheduled_at, started_at, finished_at, error, input_hash, created_at";

pub const AI_OUTPUT_COLUMNS: &str = "id, account_id, thread_id, message_id, attachment_id, task_type, model_id, prompt_version, source_message_ids_json, confidence, result_json, display_text, created_at, updated_at";

pub fn read_ai_job_row(row: &rusqlite::Row) -> Result<EmailAiJobRow, rusqlite::Error> {
    Ok(EmailAiJobRow {
        id: row.get(0)?,
        account_id: row.get(1)?,
        thread_id: row.get(2)?,
        message_id: row.get(3)?,
        attachment_id: row.get(4)?,
        task_type: row.get(5)?,
        priority: row.get(6)?,
        status: row.get(7)?,
        model_id: row.get(8)?,
        tone: row.get(9)?,
        attempt_count: row.get(10)?,
        max_attempts: row.get(11)?,
        scheduled_at: row.get(12)?,
        started_at: row.get(13)?,
        finished_at: row.get(14)?,
        error: row.get(15)?,
        input_hash: row.get(16)?,
        created_at: row.get(17)?,
    })
}

pub fn read_ai_output_row(
    row: &rusqlite::Row,
) -> Result<EmailAiOutputRow, rusqlite::Error> {
    Ok(EmailAiOutputRow {
        id: row.get(0)?,
        account_id: row.get(1)?,
        thread_id: row.get(2)?,
        message_id: row.get(3)?,
        attachment_id: row.get(4)?,
        task_type: row.get(5)?,
        model_id: row.get(6)?,
        prompt_version: row.get(7)?,
        source_message_ids_json: row.get(8)?,
        confidence: row.get(9)?,
        result_json: row.get(10)?,
        display_text: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

pub fn enqueue_ai_job(
    conn: &Connection,
    input: &EmailAiJobInput,
) -> Result<EmailAiJobRow, String> {
    let id = new_uuid_id("job");
    let now = now_ms();
    conn.execute(
        "INSERT INTO email_ai_jobs (id, account_id, thread_id, message_id, task_type, priority, status, model_id, tone, scheduled_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8, ?9, ?9)",
        params![id, input.account_id, input.thread_id, input.message_id, input.task_type, input.priority, input.model_id, input.tone, now],
    )
    .map_err(|e| e.to_string())?;
    get_ai_job(conn, &id)
}

pub fn enqueue_ai_jobs(
    conn: &Connection,
    inputs: &[EmailAiJobInput],
) -> Result<Vec<EmailAiJobRow>, String> {
    let mut results = Vec::with_capacity(inputs.len());
    for input in inputs {
        results.push(enqueue_ai_job(conn, input)?);
    }
    Ok(results)
}

pub fn get_ai_job(conn: &Connection, job_id: &str) -> Result<EmailAiJobRow, String> {
    conn.query_row(
        &format!("SELECT {AI_JOB_COLUMNS} FROM email_ai_jobs WHERE id = ?1"),
        params![job_id],
        read_ai_job_row,
    )
    .map_err(|e| format!("ai job not found: {e}"))
}

pub fn claim_next_ai_job(
    conn: &Connection,
    task_types: &[String],
) -> Result<Option<EmailAiJobRow>, String> {
    if task_types.is_empty() {
        return Ok(None);
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let placeholders = task_types.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {AI_JOB_COLUMNS} FROM email_ai_jobs
         WHERE status = 'queued' AND task_type IN ({placeholders})
         ORDER BY priority ASC, scheduled_at ASC LIMIT 1"
    );
    let job = {
        let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(rusqlite::params_from_iter(task_types.iter()), read_ai_job_row)
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(row) => row.map_err(|e| e.to_string())?,
            None => return Ok(None),
        }
    };
    let now = now_ms();
    tx.execute(
        "UPDATE email_ai_jobs SET status = 'running', started_at = ?1 WHERE id = ?2 AND status = 'queued'",
        params![now, job.id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let mut updated = job;
    updated.status = "running".to_string();
    updated.started_at = Some(now);
    Ok(Some(updated))
}

pub fn complete_ai_job(
    conn: &Connection,
    input: &EmailAiOutputInput,
) -> Result<EmailAiJobRow, String> {
    let job = get_ai_job(conn, &input.job_id)?;
    let now = now_ms();
    let output_id = new_uuid_id("out");
    conn.execute(
        "INSERT INTO email_ai_outputs (id, account_id, thread_id, message_id, attachment_id, task_type, model_id, prompt_version, source_message_ids_json, confidence, result_json, display_text, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
        params![
            output_id,
            job.account_id,
            job.thread_id,
            job.message_id,
            job.attachment_id,
            job.task_type,
            input.model_id,
            input.prompt_version,
            input.source_message_ids_json.as_deref().unwrap_or("[]"),
            input.confidence,
            input.result_json,
            input.display_text,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE email_ai_jobs SET status = 'completed', finished_at = ?1 WHERE id = ?2",
        params![now, input.job_id],
    )
    .map_err(|e| e.to_string())?;
    get_ai_job(conn, &input.job_id)
}

pub fn fail_ai_job(
    conn: &Connection,
    job_id: &str,
    error: &str,
) -> Result<EmailAiJobRow, String> {
    let job = get_ai_job(conn, job_id)?;
    let now = now_ms();
    if job.attempt_count + 1 < job.max_attempts {
        conn.execute(
            "UPDATE email_ai_jobs SET status = 'queued', error = ?1, attempt_count = attempt_count + 1, started_at = NULL, scheduled_at = ?2 WHERE id = ?3",
            params![error, now, job_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE email_ai_jobs SET status = 'failed', finished_at = ?1, error = ?2, attempt_count = attempt_count + 1 WHERE id = ?3",
            params![now, error, job_id],
        )
        .map_err(|e| e.to_string())?;
    }
    get_ai_job(conn, job_id)
}

pub fn cancel_ai_job(conn: &Connection, job_id: &str) -> Result<(), String> {
    let now = now_ms();
    conn.execute(
        "UPDATE email_ai_jobs SET status = 'cancelled', finished_at = ?1 WHERE id = ?2 AND status IN ('queued', 'running')",
        params![now, job_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Put a running job back in the queue without counting as a failed attempt.
pub fn requeue_ai_job(conn: &Connection, job_id: &str) -> Result<(), String> {
    let now = now_ms();
    conn.execute(
        "UPDATE email_ai_jobs SET status = 'queued', started_at = NULL, scheduled_at = ?1 WHERE id = ?2 AND status = 'running'",
        params![now, job_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Requeue jobs left in `running` after a crash, stop, or stale worker tick.
/// When `stale_after_ms <= 0`, all running jobs are requeued (startup / worker stopped).
pub fn reconcile_orphaned_running_jobs(conn: &Connection, stale_after_ms: i64) -> Result<u64, String> {
    let now = now_ms();
    let updated = if stale_after_ms <= 0 {
        conn.execute(
            "UPDATE email_ai_jobs
             SET status = 'queued', started_at = NULL, scheduled_at = ?1
             WHERE status = 'running'",
            params![now],
        )
        .map_err(|e| e.to_string())?
    } else {
        let cutoff = now.saturating_sub(stale_after_ms);
        conn.execute(
            "UPDATE email_ai_jobs
             SET status = 'queued', started_at = NULL, scheduled_at = ?1
             WHERE status = 'running' AND (started_at IS NULL OR started_at < ?2)",
            params![now, cutoff],
        )
        .map_err(|e| e.to_string())?
    };
    Ok(updated as u64)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EmailAiClearResult {
    pub jobs_deleted: u64,
    pub outputs_deleted: u64,
    pub drafts_deleted: u64,
    pub message_tags_deleted: u64,
    pub tags_deleted: u64,
}

/// Delete all Email AI jobs, outputs, drafts, and AI-applied tags.
pub fn clear_all_email_ai_data(conn: &Connection) -> Result<EmailAiClearResult, String> {
    let message_tags_deleted = conn
        .execute("DELETE FROM email_message_tags WHERE source = 'ai'", [])
        .map_err(|e| e.to_string())? as u64;
    let drafts_deleted = conn
        .execute("DELETE FROM email_ai_drafts", [])
        .map_err(|e| e.to_string())? as u64;
    let outputs_deleted = conn
        .execute("DELETE FROM email_ai_outputs", [])
        .map_err(|e| e.to_string())? as u64;
    let jobs_deleted = conn
        .execute("DELETE FROM email_ai_jobs", [])
        .map_err(|e| e.to_string())? as u64;
    let tags_deleted = conn
        .execute(
            "DELETE FROM email_tags
             WHERE source = 'ai'
               AND id NOT IN (SELECT tag_id FROM email_message_tags)",
            [],
        )
        .map_err(|e| e.to_string())? as u64;
    Ok(EmailAiClearResult {
        jobs_deleted,
        outputs_deleted,
        drafts_deleted,
        message_tags_deleted,
        tags_deleted,
    })
}

pub fn list_ai_jobs(
    conn: &Connection,
    filter: &EmailAiJobFilter,
) -> Result<Vec<EmailAiJobRow>, String> {
    let mut conditions = vec!["1=1".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;
    if let Some(account_id) = &filter.account_id {
        conditions.push(format!("account_id = ?{idx}"));
        param_values.push(Box::new(account_id.clone()));
        idx += 1;
    }
    if let Some(status) = &filter.status {
        conditions.push(format!("status = ?{idx}"));
        param_values.push(Box::new(status.clone()));
        idx += 1;
    }
    if let Some(task_type) = &filter.task_type {
        conditions.push(format!("task_type = ?{idx}"));
        param_values.push(Box::new(task_type.clone()));
        idx += 1;
    }

    let where_clause = conditions.join(" AND ");
    let limit = filter.limit.unwrap_or(100);
    param_values.push(Box::new(limit));
    let sql = format!("SELECT {AI_JOB_COLUMNS} FROM email_ai_jobs WHERE {where_clause} ORDER BY priority ASC, scheduled_at ASC LIMIT ?{idx}");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(param_values.iter().map(|p| p.as_ref())), read_ai_job_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn list_ai_outputs(
    conn: &Connection,
    thread_id: &str,
) -> Result<Vec<EmailAiOutputRow>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {AI_OUTPUT_COLUMNS} FROM email_ai_outputs WHERE thread_id = ?1 ORDER BY created_at DESC"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![thread_id], read_ai_output_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[allow(dead_code)]
pub fn get_ai_output_for_thread(
    conn: &Connection,
    thread_id: &str,
    task_type: &str,
) -> Result<Option<EmailAiOutputRow>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {AI_OUTPUT_COLUMNS} FROM email_ai_outputs WHERE thread_id = ?1 AND task_type = ?2 ORDER BY updated_at DESC LIMIT 1"))
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query_map(params![thread_id, task_type], read_ai_output_row)
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(row) => Ok(Some(row.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

#[allow(dead_code)]
pub fn get_unprocessed_message_ids(
    conn: &Connection,
    account_id: &str,
    task_type: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.id FROM email_messages m
             WHERE m.account_id = ?1
               AND NOT EXISTS (
                 SELECT 1 FROM email_ai_outputs o
                 WHERE o.message_id = m.id AND o.task_type = ?2
               )
               AND NOT EXISTS (
                 SELECT 1 FROM email_ai_jobs j
                 WHERE j.message_id = m.id AND j.task_type = ?2 AND j.status IN ('queued', 'running')
               )
             ORDER BY m.timestamp DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![account_id, task_type], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_unprocessed_thread_ids(
    conn: &Connection,
    account_id: &str,
    task_type: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT t.id FROM email_threads t
             WHERE t.account_id = ?1
               AND NOT EXISTS (
                 SELECT 1 FROM email_ai_jobs j
                 WHERE j.thread_id = t.id AND j.task_type = ?2 AND j.status IN ('queued', 'running')
               )
               AND (
                 NOT EXISTS (
                   SELECT 1 FROM email_ai_outputs o
                   WHERE o.thread_id = t.id AND o.task_type = ?2
                 )
                 OR EXISTS (
                   SELECT 1 FROM email_messages m
                   WHERE m.thread_id = t.id
                     AND m.timestamp > (
                       SELECT MAX(o2.updated_at) FROM email_ai_outputs o2
                       WHERE o2.thread_id = t.id AND o2.task_type = ?2
                     )
                 )
               )
             ORDER BY t.last_message_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![account_id, task_type], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
