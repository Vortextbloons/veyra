use rusqlite::{params, Connection};
use std::collections::HashMap;

use super::ai_jobs::get_ai_output_for_thread;
use super::gmail::{apply_gmail_thread_labels, html_for_body_parse, send_gmail_message};
use super::helpers::{new_id, now_ms, parse_json_vec};
use super::types::*;

pub fn query_strings<P: rusqlite::Params>(
    conn: &Connection,
    sql: &str,
    params: P,
) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params, |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

pub fn rebuild_thread_labels_and_folders(conn: &Connection) -> Result<(), String> {
    normalize_message_label_casing(conn)?;

    conn.execute_batch(
        "UPDATE email_threads SET labels_json = (
            SELECT COALESCE(json_group_array(DISTINCT value), '[]')
            FROM email_messages, json_each(email_messages.labels_json)
            WHERE email_messages.thread_id = email_threads.id
        );",
    )
    .map_err(|e| format!("email: rebuild thread labels_json failed: {e}"))?;

    conn.execute_batch("DELETE FROM email_thread_folders;")
        .map_err(|e| format!("email: clear thread-folder joins failed: {e}"))?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO email_thread_folders (thread_id, folder_id)
         SELECT DISTINCT m.thread_id, f.id
         FROM email_messages m
         JOIN json_each(m.labels_json) je
         JOIN email_folders f ON f.account_id = m.account_id
           AND UPPER(f.provider_id) = UPPER(je.value)
         WHERE je.value != '';",
    )
    .map_err(|e| format!("email: rebuild thread-folder joins failed: {e}"))?;

    Ok(())
}

pub fn rebuild_thread_labels_and_folders_for_account(
    conn: &Connection,
    account_id: &str,
) -> Result<(), String> {
    normalize_message_label_casing_for_account(conn, account_id)?;

    conn.execute(
        "UPDATE email_threads SET labels_json = (
            SELECT COALESCE(json_group_array(DISTINCT value), '[]')
            FROM email_messages, json_each(email_messages.labels_json)
            WHERE email_messages.thread_id = email_threads.id
        ) WHERE account_id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM email_thread_folders WHERE thread_id IN (
            SELECT id FROM email_threads WHERE account_id = ?1
        )",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO email_thread_folders (thread_id, folder_id)
         SELECT DISTINCT m.thread_id, f.id
         FROM email_messages m
         JOIN json_each(m.labels_json) je
         JOIN email_folders f ON f.account_id = m.account_id
           AND UPPER(f.provider_id) = UPPER(je.value)
         WHERE m.account_id = ?1 AND je.value != ''",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn normalize_message_label_casing(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, account_id, labels_json FROM email_messages WHERE labels_json != '[]'")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    for (msg_id, account_id, labels_json) in rows {
        normalize_one_message_labels(conn, &msg_id, &account_id, &labels_json)?;
    }
    Ok(())
}

fn normalize_message_label_casing_for_account(
    conn: &Connection,
    account_id: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, labels_json FROM email_messages WHERE account_id = ?1 AND labels_json != '[]'",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    for (msg_id, labels_json) in rows {
        normalize_one_message_labels(conn, &msg_id, account_id, &labels_json)?;
    }
    Ok(())
}

fn normalize_one_message_labels(
    conn: &Connection,
    msg_id: &str,
    account_id: &str,
    labels_json: &str,
) -> Result<(), String> {
    let labels: Vec<String> = parse_json_vec(labels_json.to_string());
    if labels.is_empty() {
        return Ok(());
    }

    let mut seen = std::collections::HashSet::new();
    let mut normalized = Vec::new();
    for label in labels {
        let canonical: String = conn
            .query_row(
                "SELECT provider_id FROM email_folders
                 WHERE account_id = ?1 AND UPPER(provider_id) = UPPER(?2)
                 LIMIT 1",
                params![account_id, &label],
                |row| row.get(0),
            )
            .unwrap_or(label);
        if seen.insert(canonical.clone()) {
            normalized.push(canonical);
        }
    }

    let updated = serde_json::to_string(&normalized).map_err(|e| e.to_string())?;
    if updated != labels_json {
        conn.execute(
            "UPDATE email_messages SET labels_json = ?1 WHERE id = ?2",
            params![updated, msg_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn load_messages(conn: &Connection, thread_id: &str) -> Result<Vec<EmailMessageRow>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, account_id, from_name, from_email, to_json, cc_json,
         subject, body, snippet, timestamp, is_read, is_archived, is_starred,
         labels_json, attachments_json, body_html, sanitized_html, body_parse_status, parsed_parts_json
         FROM email_messages WHERE thread_id = ?1 ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![thread_id], |row| {
            let body_parse_status: String = row.get(18).unwrap_or_else(|_| "pending".into());
            let parsed_parts_json: String = row.get(19).unwrap_or_else(|_| "{}".into());
            let parsed_parts: crate::email::thread_parser::ParsedBody =
                serde_json::from_str(&parsed_parts_json).unwrap_or_default();
            Ok(EmailMessageRow {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                account_id: row.get(2)?,
                from: EmailAddressRow {
                    name: row.get(3)?,
                    email: row.get(4)?,
                },
                to: parse_json_vec(row.get(5)?),
                cc: parse_json_vec(row.get(6)?),
                subject: row.get(7)?,
                body: row.get(8)?,
                snippet: row.get(9)?,
                timestamp: row.get(10)?,
                is_read: row.get::<_, i64>(11)? != 0,
                is_archived: row.get::<_, i64>(12)? != 0,
                is_starred: row.get::<_, i64>(13)? != 0,
                labels: parse_json_vec(row.get(14)?),
                attachments: parse_json_vec(row.get(15)?),
                body_html: row.get(16)?,
                sanitized_html: row.get(17)?,
                body_parse_status,
                parsed_parts,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn load_thread(conn: &Connection, thread_id: String) -> Result<EmailThreadRow, String> {
    let mut thread = conn.query_row("SELECT id, account_id, subject, last_message_at, is_read, is_archived, is_starred, labels_json FROM email_threads WHERE id = ?1", params![thread_id], |row| Ok(EmailThreadRow {
        id: row.get(0)?, account_id: row.get(1)?, subject: row.get(2)?, messages: Vec::new(), participants: Vec::new(), last_message_at: row.get(3)?, is_read: row.get::<_, i64>(4)? != 0, is_archived: row.get::<_, i64>(5)? != 0, is_starred: row.get::<_, i64>(6)? != 0, labels: parse_json_vec(row.get(7)?), ai_metadata: None,
    })).map_err(|e| e.to_string())?;
    thread.messages = load_messages(conn, &thread.id)?;
    thread.participants = thread
        .messages
        .iter()
        .map(|m| m.from.name.clone())
        .collect();
    Ok(thread)
}

pub fn load_ai_metadata_for_thread(conn: &Connection, thread_id: &str) -> EmailThreadAiMetadata {
    let mut meta = EmailThreadAiMetadata::default();
    let task_types = ["thread_summary", "classification", "spam_score", "urgency_score"];
    for task_type in &task_types {
        if let Ok(Some(output)) = get_ai_output_for_thread(conn, thread_id, task_type) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&output.result_json) {
                match *task_type {
                    "thread_summary" => {
                        meta.summary = parsed.get("shortSummary").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    "classification" => {
                        meta.category = parsed.get("category").and_then(|v| v.as_str()).map(|s| s.to_string());
                        meta.needs_reply = parsed.get("needsReply").and_then(|v| v.as_bool());
                    }
                    "spam_score" => {
                        meta.spam_score = parsed.get("spamScore").and_then(|v| v.as_f64());
                        meta.marketing_score = parsed.get("marketingScore").and_then(|v| v.as_f64());
                        meta.newsletter = parsed.get("newsletter").and_then(|v| v.as_bool());
                    }
                    "urgency_score" => {
                        meta.urgency = parsed.get("level").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    _ => {}
                }
            }
        }
    }
    if let Ok(tags) = load_tags_for_latest_message(conn, thread_id) {
        meta.tags = tags;
    }
    meta
}

fn load_tags_for_latest_message(conn: &Connection, thread_id: &str) -> Result<Vec<String>, String> {
    use rusqlite::OptionalExtension;
    let latest_msg_id: Option<String> = conn
        .query_row(
            "SELECT id FROM email_messages WHERE thread_id = ?1 ORDER BY timestamp DESC LIMIT 1",
            params![thread_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match latest_msg_id {
        Some(msg_id) => {
            let mut stmt = conn
                .prepare("SELECT t.name FROM email_tags t JOIN email_message_tags mt ON mt.tag_id = t.id WHERE mt.message_id = ?1 ORDER BY t.name")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![msg_id], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let mut tags = Vec::new();
            for row in rows {
                tags.push(row.map_err(|e| e.to_string())?);
            }
            Ok(tags)
        }
        None => Ok(vec![]),
    }
}

pub fn load_ai_metadata_map(
    conn: &Connection,
    thread_ids: &[String],
) -> Result<HashMap<String, EmailThreadAiMetadata>, String> {
    let mut map: HashMap<String, EmailThreadAiMetadata> = HashMap::new();
    if thread_ids.is_empty() {
        return Ok(map);
    }
    for id in thread_ids {
        map.insert(id.clone(), EmailThreadAiMetadata::default());
    }
    let placeholders = thread_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 2)).collect::<Vec<_>>().join(",");
    let task_types = ["thread_summary", "classification", "spam_score", "urgency_score"];
    for task_type in &task_types {
        let sql = format!(
            "SELECT thread_id, result_json FROM email_ai_outputs
             WHERE task_type = ?1 AND thread_id IN ({placeholders})
             AND id IN (SELECT id FROM email_ai_outputs o2 WHERE o2.thread_id = email_ai_outputs.thread_id AND o2.task_type = email_ai_outputs.task_type ORDER BY o2.updated_at DESC LIMIT 1)"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        params_vec.push(Box::new(task_type.to_string()));
        for id in thread_ids {
            params_vec.push(Box::new(id.clone()));
        }
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for row in rows {
            let (tid, result_json) = row.map_err(|e| e.to_string())?;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&result_json) {
                if let Some(meta) = map.get_mut(&tid) {
                    match *task_type {
                        "thread_summary" => {
                            meta.summary = parsed.get("shortSummary").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                        "classification" => {
                            meta.category = parsed.get("category").and_then(|v| v.as_str()).map(|s| s.to_string());
                            meta.needs_reply = parsed.get("needsReply").and_then(|v| v.as_bool());
                        }
                        "spam_score" => {
                            meta.spam_score = parsed.get("spamScore").and_then(|v| v.as_f64());
                            meta.marketing_score = parsed.get("marketingScore").and_then(|v| v.as_f64());
                            meta.newsletter = parsed.get("newsletter").and_then(|v| v.as_bool());
                        }
                        "urgency_score" => {
                            meta.urgency = parsed.get("level").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    let tag_sql = format!(
        "SELECT m.thread_id, t.name FROM email_message_tags mt
         JOIN email_tags t ON t.id = mt.tag_id
         JOIN email_messages m ON m.id = mt.message_id
         WHERE m.thread_id IN ({placeholders})
         AND m.timestamp = (SELECT MAX(m2.timestamp) FROM email_messages m2 WHERE m2.thread_id = m.thread_id)
         ORDER BY t.name"
    );
    let mut tag_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for id in thread_ids {
        tag_params.push(Box::new(id.clone()));
    }
    let mut tag_stmt = conn.prepare(&tag_sql).map_err(|e| e.to_string())?;
    let tag_rows = tag_stmt.query_map(rusqlite::params_from_iter(tag_params.iter().map(|p| p.as_ref())), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    for row in tag_rows {
        let (tid, tag_name) = row.map_err(|e| e.to_string())?;
        if let Some(meta) = map.get_mut(&tid) {
            meta.tags.push(tag_name);
        }
    }
    Ok(map)
}

pub fn is_metadata_empty(meta: &EmailThreadAiMetadata) -> bool {
    meta.summary.is_none()
        && meta.urgency.is_none()
        && meta.category.is_none()
        && meta.needs_reply.is_none()
        && meta.spam_score.is_none()
        && meta.marketing_score.is_none()
        && meta.newsletter.is_none()
        && meta.tags.is_empty()
}

pub fn reparse_message(conn: &Connection, message_id: &str) -> Result<EmailMessageRow, String> {
    let (body_text, body, body_html, sanitized_html): (
        String,
        String,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT body_text, body, body_html, sanitized_html FROM email_messages WHERE id = ?1",
            params![message_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("email: message {message_id} not found: {e}"))?;

    let effective_body_text = if body_text.is_empty() { body } else { body_text };
    let body_html_raw = body_html.unwrap_or_default();
    let sanitized = sanitized_html.unwrap_or_default();
    let html_for_parse = html_for_body_parse(&body_html_raw, &sanitized);
    let parsed =
        crate::email::thread_parser::parse_message_body(html_for_parse, &effective_body_text);
    let body_parse_status = parsed.parse_status.clone();
    let parsed_parts_json =
        serde_json::to_string(&parsed).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE email_messages SET body_parse_status = ?1, parsed_parts_json = ?2 WHERE id = ?3",
        params![body_parse_status, parsed_parts_json, message_id],
    )
    .map_err(|e| e.to_string())?;

    let thread_id: String = conn
        .query_row(
            "SELECT thread_id FROM email_messages WHERE id = ?1",
            params![message_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let messages = load_messages(conn, &thread_id)?;
    messages
        .into_iter()
        .find(|m| m.id == message_id)
        .ok_or_else(|| format!("email: message {message_id} not found after reparse"))
}

pub fn list_folders(
    conn: &Connection,
    account_id: Option<String>,
) -> Result<Vec<EmailFolderRow>, String> {
    let (sql, params_vec): (String, Vec<String>) = match account_id {
        Some(aid) => (
            "SELECT id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count
             FROM email_folders WHERE account_id = ?1 AND is_visible = 1 ORDER BY kind, name"
                .into(),
            vec![aid],
        ),
        None => (
            "SELECT id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count
             FROM email_folders WHERE is_visible = 1 ORDER BY account_id, kind, name"
                .into(),
            vec![],
        ),
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(EmailFolderRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                provider_id: row.get(2)?,
                name: row.get(3)?,
                kind: row.get(4)?,
                folder_type: row.get(5)?,
                is_system: row.get::<_, i64>(6)? != 0,
                is_visible: row.get::<_, i64>(7)? != 0,
                unread_count: row.get(8)?,
                total_count: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn list_threads(
    conn: &Connection,
    account_id: String,
    folder_id: String,
    query: Option<String>,
) -> Result<Vec<EmailThreadRow>, String> {
    if folder_id == "drafts" {
        return list_draft_threads(conn, account_id, query);
    }

    let ids: Vec<String> = if let Some(smart_view) = folder_id.strip_prefix("smart:") {
        super::smart_views::get_smart_view_thread_ids(conn, &account_id, smart_view)?
    } else if folder_id == "unified" {
        query_unified_inbox_thread_ids(conn)?
    } else if folder_id.starts_with("folder-") {
        query_strings(conn,
            "SELECT t.id FROM email_threads t
             JOIN email_thread_folders tf ON tf.thread_id = t.id
             WHERE tf.folder_id = ?1
             ORDER BY t.last_message_at DESC",
            params![folder_id],
        )?
    } else {
        let kind = folder_id.as_str();
        match kind {
            "starred" => query_strings(conn,
                "SELECT id FROM email_threads WHERE account_id = ?1 AND is_starred = 1 ORDER BY last_message_at DESC",
                params![account_id],
            )?,
            "archive" => query_strings(conn,
                "SELECT id FROM email_threads WHERE account_id = ?1 AND is_archived = 1 ORDER BY last_message_at DESC",
                params![account_id],
            )?,
            "sent" => query_sent_thread_ids(conn, &account_id)?,
            "inbox" => query_inbox_thread_ids(conn, &account_id)?,
            _ => query_inbox_thread_ids(conn, &account_id)?,
        }
    };

    let needle = query.unwrap_or_default().to_lowercase();
    let mut threads = Vec::new();
    for id in ids {
        let thread = load_thread(conn, id)?;
        if !needle.is_empty() {
            let hit = thread.subject.to_lowercase().contains(&needle)
                || thread.messages.iter().any(|m| {
                    m.body.to_lowercase().contains(&needle)
                        || m.from.email.to_lowercase().contains(&needle)
                });
            if !hit {
                continue;
            }
        }
        threads.push(thread);
    }
    let thread_ids: Vec<String> = threads.iter().map(|t| t.id.clone()).collect();
    if let Ok(meta_map) = load_ai_metadata_map(conn, &thread_ids) {
        for thread in &mut threads {
            if let Some(meta) = meta_map.get(&thread.id) {
                if !is_metadata_empty(meta) {
                    thread.ai_metadata = Some(meta.clone());
                }
            }
        }
    }
    Ok(threads)
}

pub fn query_inbox_thread_ids(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
    let ids = query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_thread_folders tf ON tf.thread_id = t.id
         JOIN email_folders f ON f.id = tf.folder_id
         WHERE t.account_id = ?1 AND f.kind = 'inbox'
         ORDER BY t.last_message_at DESC",
        params![account_id],
    )?;
    if !ids.is_empty() {
        return Ok(ids);
    }
    let label_ids = query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_messages m ON m.thread_id = t.id
         JOIN json_each(m.labels_json) je ON UPPER(je.value) = 'INBOX'
         WHERE t.account_id = ?1
         ORDER BY t.last_message_at DESC",
        params![account_id],
    )?;
    if !label_ids.is_empty() {
        return Ok(label_ids);
    }
    query_strings(
        conn,
        "SELECT id FROM email_threads WHERE account_id = ?1 AND is_archived = 0 ORDER BY last_message_at DESC",
        params![account_id],
    )
}

fn query_sent_thread_ids(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
    let ids = query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_thread_folders tf ON tf.thread_id = t.id
         JOIN email_folders f ON f.id = tf.folder_id
         WHERE t.account_id = ?1 AND f.kind = 'sent'
         ORDER BY t.last_message_at DESC",
        params![account_id],
    )?;
    if !ids.is_empty() {
        return Ok(ids);
    }
    query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_messages m ON m.thread_id = t.id
         JOIN json_each(m.labels_json) je ON UPPER(je.value) = 'SENT'
         WHERE t.account_id = ?1
         ORDER BY t.last_message_at DESC",
        params![account_id],
    )
}

fn query_unified_inbox_thread_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let ids = query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_thread_folders tf ON tf.thread_id = t.id
         JOIN email_folders f ON f.id = tf.folder_id
         WHERE f.kind = 'inbox'
         ORDER BY t.last_message_at DESC",
        [],
    )?;
    if !ids.is_empty() {
        return Ok(ids);
    }
    let label_ids = query_strings(
        conn,
        "SELECT DISTINCT t.id FROM email_threads t
         JOIN email_messages m ON m.thread_id = t.id
         JOIN json_each(m.labels_json) je ON UPPER(je.value) = 'INBOX'
         ORDER BY t.last_message_at DESC",
        [],
    )?;
    if !label_ids.is_empty() {
        return Ok(label_ids);
    }
    query_strings(
        conn,
        "SELECT id FROM email_threads WHERE is_archived = 0 ORDER BY last_message_at DESC",
        [],
    )
}

fn list_draft_threads(
    conn: &Connection,
    account_id: String,
    query: Option<String>,
) -> Result<Vec<EmailThreadRow>, String> {
    let mut stmt = conn.prepare("SELECT id, account_id, to_addr, cc_addr, subject, body, created_at, updated_at FROM email_drafts WHERE account_id = ?1 ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |row| {
            let id: String = row.get(0)?;
            let account_id: String = row.get(1)?;
            let to: String = row.get(2)?;
            let cc: String = row.get(3)?;
            let subject: String = row.get(4)?;
            let body: String = row.get(5)?;
            let created_at: i64 = row.get(6)?;
            let updated_at: i64 = row.get(7)?;
            let thread_id = format!("draft-thread-{id}");
            let snippet = body.chars().take(160).collect::<String>();
            let message = EmailMessageRow {
                id: id.clone(),
                thread_id: thread_id.clone(),
                account_id: account_id.clone(),
                from: EmailAddressRow {
                    name: "Draft".into(),
                    email: "draft@local.veyra".into(),
                },
                to: vec![EmailAddressRow {
                    name: to.clone(),
                    email: to.clone(),
                }],
                cc: if cc.is_empty() {
                    Vec::new()
                } else {
                    vec![EmailAddressRow {
                        name: cc.clone(),
                        email: cc.clone(),
                    }]
                },
                subject: subject.clone(),
                body,
                snippet,
                timestamp: updated_at,
                is_read: true,
                is_archived: false,
                is_starred: false,
                labels: vec!["draft".into()],
                attachments: Vec::new(),
                body_html: None,
                sanitized_html: None,
                body_parse_status: "fallback".into(),
                parsed_parts: crate::email::thread_parser::ParsedBody::default(),
            };
            Ok(EmailThreadRow {
                id: thread_id,
                account_id,
                subject,
                messages: vec![message],
                participants: if to.is_empty() {
                    vec!["Unsaved recipient".into()]
                } else {
                    vec![to]
                },
                last_message_at: updated_at.max(created_at),
                is_read: true,
                is_archived: false,
                is_starred: false,
                labels: vec!["draft".into()],
                ai_metadata: None,
            })
        })
        .map_err(|e| e.to_string())?;
    let needle = query.unwrap_or_default().to_lowercase();
    let threads = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    if needle.is_empty() {
        return Ok(threads);
    }
    Ok(threads
        .into_iter()
        .filter(|thread| {
            thread.subject.to_lowercase().contains(&needle)
                || thread
                    .messages
                    .iter()
                    .any(|message| message.body.to_lowercase().contains(&needle))
        })
        .collect())
}

pub fn get_thread(conn: &Connection, thread_id: String) -> Result<EmailThreadRow, String> {
    if let Some(draft_id) = thread_id.strip_prefix("draft-thread-") {
        return load_draft_thread(conn, draft_id.to_string());
    }
    let mut thread = load_thread(conn, thread_id)?;
    let meta = load_ai_metadata_for_thread(conn, &thread.id);
    if !is_metadata_empty(&meta) {
        thread.ai_metadata = Some(meta);
    }
    Ok(thread)
}

fn load_draft_thread(conn: &Connection, draft_id: String) -> Result<EmailThreadRow, String> {
    let account_id = conn
        .query_row(
            "SELECT account_id FROM email_drafts WHERE id = ?1",
            params![draft_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?;
    list_draft_threads(conn, account_id, None)?
        .into_iter()
        .find(|thread| thread.id == format!("draft-thread-{draft_id}"))
        .ok_or_else(|| "draft not found".to_string())
}

pub fn save_draft(conn: &Connection, draft: EmailDraftInput) -> Result<EmailDraftRow, String> {
    use rusqlite::OptionalExtension;
    let now = now_ms();
    let id = draft
        .id
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| new_id("draft"));
    let bcc = draft.bcc.unwrap_or_default();
    let existing_created = conn
        .query_row(
            "SELECT created_at FROM email_drafts WHERE id = ?1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);
    conn.execute("INSERT OR REPLACE INTO email_drafts (id, account_id, to_addr, cc_addr, bcc_addr, subject, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", params![id, draft.account_id, draft.to, draft.cc, bcc, draft.subject, draft.body, created_at, now]).map_err(|e| e.to_string())?;
    Ok(EmailDraftRow {
        id,
        account_id: draft.account_id,
        to: draft.to,
        cc: draft.cc,
        bcc,
        subject: draft.subject,
        body: draft.body,
        created_at,
        updated_at: now,
    })
}

pub fn send_message(conn: &Connection, draft: EmailDraftInput) -> Result<EmailSendResult, String> {
    if draft.to.trim().is_empty() {
        return Err("recipient is required".into());
    }
    validate_email_headers(&draft)?;
    let account = conn
        .query_row(
            "SELECT name, email, provider FROM email_accounts WHERE id = ?1",
            params![draft.account_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    if account.2 == "gmail" {
        let sent_id = send_gmail_message(conn, &draft.account_id, &account.1, &draft)?;
        super::gmail::sync_gmail_account(conn, draft.account_id.clone())?;
        if let Some(id) = draft.id {
            let _ = conn.execute("DELETE FROM email_drafts WHERE id = ?1", params![id]);
        }
        return Ok(EmailSendResult {
            sent: true,
            message_id: Some(sent_id),
        });
    }
    let thread_id = new_id("thread");
    let message_id = new_id("sent");
    let now = now_ms();
    let to_json = serde_json::to_string(&vec![EmailAddressRow {
        name: draft.to.clone(),
        email: draft.to.clone(),
    }])
    .map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, is_read, is_archived, is_starred) VALUES (?1, ?2, ?3, ?4, 1, 0, 0)", params![thread_id, draft.account_id, draft.subject, now]).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', ?7, ?8, ?9, ?10, 1, 0, 0, '[\"sent\"]', '[]')", params![message_id, thread_id, draft.account_id, account.0, account.1, to_json, draft.subject, draft.body, draft.body.chars().take(160).collect::<String>(), now]).map_err(|e| e.to_string())?;
    if let Some(id) = draft.id {
        let _ = conn.execute("DELETE FROM email_drafts WHERE id = ?1", params![id]);
    }
    Ok(EmailSendResult {
        sent: true,
        message_id: Some(message_id),
    })
}

fn reject_header_control_chars(label: &str, value: &str) -> Result<(), String> {
    if value
        .chars()
        .any(|c| matches!(c, '\r' | '\n') || (c.is_control() && c != '\t'))
    {
        return Err(format!("{label} contains invalid header characters"));
    }
    Ok(())
}

fn validate_email_headers(draft: &EmailDraftInput) -> Result<(), String> {
    reject_header_control_chars("recipient", &draft.to)?;
    reject_header_control_chars("cc", &draft.cc)?;
    if let Some(bcc) = &draft.bcc {
        reject_header_control_chars("bcc", bcc)?;
    }
    reject_header_control_chars("subject", &draft.subject)?;
    Ok(())
}

pub fn archive_thread(
    conn: &Connection,
    thread_id: String,
    account_id: String,
) -> Result<(), String> {
    apply_gmail_thread_labels(conn, &account_id, &thread_id, vec![], vec!["INBOX"])?;
    conn.execute(
        "UPDATE email_threads SET is_archived = 1 WHERE id = ?1 AND account_id = ?2",
        params![thread_id, account_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE email_messages SET is_archived = 1 WHERE thread_id = ?1 AND account_id = ?2",
        params![thread_id, account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_read(
    conn: &Connection,
    thread_id: String,
    account_id: String,
    read: bool,
) -> Result<(), String> {
    if read {
        apply_gmail_thread_labels(conn, &account_id, &thread_id, vec![], vec!["UNREAD"])?;
    } else {
        apply_gmail_thread_labels(conn, &account_id, &thread_id, vec!["UNREAD"], vec![])?;
    }
    let value = if read { 1 } else { 0 };
    conn.execute(
        "UPDATE email_threads SET is_read = ?1 WHERE id = ?2 AND account_id = ?3",
        params![value, thread_id, account_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE email_messages SET is_read = ?1 WHERE thread_id = ?2 AND account_id = ?3",
        params![value, thread_id, account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
