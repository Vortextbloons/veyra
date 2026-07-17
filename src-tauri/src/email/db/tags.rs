use rusqlite::{params, Connection};

use super::helpers::{new_uuid_id, now_ms, slugify};
use super::types::*;

pub const TAG_COLUMNS: &str = "id, account_id, name, slug, color, source, created_at, updated_at";

pub fn read_tag_row(row: &rusqlite::Row) -> Result<EmailTagRow, rusqlite::Error> {
    Ok(EmailTagRow {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        slug: row.get(3)?,
        color: row.get(4)?,
        source: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn seed_system_tags(conn: &Connection) -> Result<(), String> {
    let now = now_ms();
    let system_tags = [
        ("work", Some("#3b82f6")),
        ("personal", Some("#8b5cf6")),
        ("finance", Some("#10b981")),
        ("travel", Some("#f59e0b")),
        ("notification", Some("#6b7280")),
        ("newsletter", Some("#6366f1")),
        ("urgent", Some("#ef4444")),
        ("action-required", Some("#f97316")),
    ];
    for (name, color) in &system_tags {
        let id = new_uuid_id("tag");
        let slug = slugify(name);
        conn.execute(
            "INSERT OR IGNORE INTO email_tags (id, account_id, name, slug, color, source, created_at, updated_at) VALUES (?1, NULL, ?2, ?3, ?4, 'system', ?5, ?5)",
            params![id, name, slug, color, now],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_tags(
    conn: &Connection,
    account_id: Option<&str>,
) -> Result<Vec<EmailTagRow>, String> {
    let sql = match account_id {
        Some(_) => format!(
            "SELECT {TAG_COLUMNS} FROM email_tags WHERE account_id IS NULL OR account_id = ?1 ORDER BY source, name"
        ),
        None => format!("SELECT {TAG_COLUMNS} FROM email_tags ORDER BY source, name"),
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = match account_id {
        Some(aid) => stmt.query_map(params![aid], read_tag_row),
        None => stmt.query_map([], read_tag_row),
    }
    .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn create_tag(
    conn: &Connection,
    input: &EmailCreateTagInput,
) -> Result<EmailTagRow, String> {
    let id = new_uuid_id("tag");
    let now = now_ms();
    let slug = slugify(&input.name);
    let exists = conn.query_row(
        "SELECT COUNT(*) FROM email_tags WHERE slug = ?1 AND (account_id IS ?2 OR (account_id IS NULL AND ?2 IS NULL))",
        params![slug, input.account_id],
        |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())?;
    if exists > 0 {
        return Err(format!("A tag named '{}' already exists", input.name));
    }
    conn.execute(
        &format!("INSERT INTO email_tags ({TAG_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)"),
        params![id, input.account_id, input.name, slug, input.color, input.source, now],
    )
    .map_err(|e| e.to_string())?;
    get_tag(conn, &id)
}

pub fn get_tag(conn: &Connection, tag_id: &str) -> Result<EmailTagRow, String> {
    conn.query_row(
        &format!("SELECT {TAG_COLUMNS} FROM email_tags WHERE id = ?1"),
        params![tag_id],
        read_tag_row,
    )
    .map_err(|e| format!("tag not found: {e}"))
}

pub fn update_tag(
    conn: &Connection,
    input: &EmailUpdateTagInput,
) -> Result<EmailTagRow, String> {
    let now = now_ms();
    if let Some(name) = &input.name {
        let slug = slugify(name);
        conn.execute(
            "UPDATE email_tags SET name = ?1, slug = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, slug, now, input.tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(color) = &input.color {
        conn.execute(
            "UPDATE email_tags SET color = ?1, updated_at = ?2 WHERE id = ?3",
            params![color, now, input.tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    get_tag(conn, &input.tag_id)
}

pub fn delete_tag(conn: &Connection, tag_id: &str) -> Result<(), String> {
    let source: String = conn
        .query_row("SELECT source FROM email_tags WHERE id = ?1", params![tag_id], |row| row.get(0))
        .map_err(|e| format!("tag not found: {e}"))?;
    if source == "system" {
        return Err("cannot delete system tags".into());
    }
    conn.execute("DELETE FROM email_tags WHERE id = ?1", params![tag_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn apply_tag_to_message(
    conn: &Connection,
    input: &EmailApplyTagInput,
) -> Result<(), String> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO email_message_tags (message_id, tag_id, source, confidence, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(message_id, tag_id) DO UPDATE SET source = excluded.source, confidence = excluded.confidence, reason = excluded.reason",
        params![input.message_id, input.tag_id, input.source, input.confidence, input.reason, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_tag_from_message(
    conn: &Connection,
    input: &EmailRemoveTagInput,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM email_message_tags WHERE message_id = ?1 AND tag_id = ?2",
        params![input.message_id, input.tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_message_tags(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<EmailTagRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.account_id, t.name, t.slug, t.color, t.source, t.created_at, t.updated_at
             FROM email_tags t
             JOIN email_message_tags mt ON mt.tag_id = t.id
             WHERE mt.message_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![message_id], read_tag_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn upsert_ai_tags(
    conn: &Connection,
    message_id: &str,
    tag_names: &[String],
    confidence: f64,
    reason: &str,
) -> Result<(), String> {
    let now = now_ms();
    for name in tag_names {
        let slug = slugify(name);
        let existing = conn.query_row(
            "SELECT id FROM email_tags WHERE account_id IS NULL AND slug = ?1",
            params![slug],
            |row| row.get::<_, String>(0),
        );
        let tag_id = match existing {
            Ok(id) => id,
            Err(_) => {
                let id = new_uuid_id("tag");
                conn.execute(
                    &format!("INSERT INTO email_tags ({TAG_COLUMNS}) VALUES (?1, NULL, ?2, ?3, NULL, 'ai', ?4, ?4)"),
                    params![id, name, slug, now],
                )
                .map_err(|e| e.to_string())?;
                id
            }
        };
        conn.execute(
            "INSERT INTO email_message_tags (message_id, tag_id, source, confidence, reason, created_at)
             VALUES (?1, ?2, 'ai', ?3, ?4, ?5)
             ON CONFLICT(message_id, tag_id) DO UPDATE SET confidence = excluded.confidence, reason = excluded.reason",
            params![message_id, tag_id, confidence, reason, now],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
