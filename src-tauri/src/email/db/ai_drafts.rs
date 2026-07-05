use rusqlite::{params, Connection};

use super::helpers::{new_uuid_id, now_ms};
use super::types::*;

pub const AI_DRAFT_COLUMNS: &str = "id, account_id, thread_id, message_id, model_id, tone, to_json, cc_json, bcc_json, subject, body, status, created_at, updated_at";

pub fn read_ai_draft_row(row: &rusqlite::Row) -> Result<EmailAiDraftRow, rusqlite::Error> {
    Ok(EmailAiDraftRow {
        id: row.get(0)?,
        account_id: row.get(1)?,
        thread_id: row.get(2)?,
        message_id: row.get(3)?,
        model_id: row.get(4)?,
        tone: row.get(5)?,
        to_json: row.get(6)?,
        cc_json: row.get(7)?,
        bcc_json: row.get(8)?,
        subject: row.get(9)?,
        body: row.get(10)?,
        status: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

pub fn list_ai_drafts(
    conn: &Connection,
    thread_id: &str,
) -> Result<Vec<EmailAiDraftRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {AI_DRAFT_COLUMNS} FROM email_ai_drafts WHERE thread_id = ?1 ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![thread_id], read_ai_draft_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_ai_draft(
    conn: &Connection,
    draft_id: &str,
) -> Result<EmailAiDraftRow, String> {
    conn.query_row(
        &format!("SELECT {AI_DRAFT_COLUMNS} FROM email_ai_drafts WHERE id = ?1"),
        params![draft_id],
        read_ai_draft_row,
    )
    .map_err(|e| format!("ai draft not found: {e}"))
}

pub fn save_ai_draft(
    conn: &Connection,
    input: &EmailSaveAiDraftInput,
) -> Result<EmailAiDraftRow, String> {
    let id = new_uuid_id("aidraft");
    let now = now_ms();
    conn.execute(
        "INSERT INTO email_ai_drafts (id, account_id, thread_id, message_id, model_id, tone, to_json, cc_json, bcc_json, subject, body, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'suggested', ?12, ?12)",
        params![
            id,
            input.account_id,
            input.thread_id,
            input.message_id,
            input.model_id,
            input.tone,
            input.to_json,
            input.cc_json,
            input.bcc_json,
            input.subject,
            input.body,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    get_ai_draft(conn, &id)
}

pub fn delete_ai_draft(
    conn: &Connection,
    draft_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM email_ai_drafts WHERE id = ?1",
        params![draft_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_ai_draft_status(
    conn: &Connection,
    draft_id: &str,
    status: &str,
) -> Result<EmailAiDraftRow, String> {
    // Validate status
    let valid_statuses = ["suggested", "inserted", "edited", "dismissed"];
    if !valid_statuses.contains(&status) {
        return Err(format!("invalid status '{}', must be one of: {:?}", status, valid_statuses));
    }
    let now = now_ms();
    conn.execute(
        "UPDATE email_ai_drafts SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, draft_id],
    )
    .map_err(|e| e.to_string())?;
    get_ai_draft(conn, draft_id)
}
