use rusqlite::{params, Connection};

use super::helpers::{account_initials, new_id, now_ms};
use super::types::EmailAccountRow;

pub fn list_accounts(conn: &Connection) -> Result<Vec<EmailAccountRow>, String> {
    let mut stmt = conn.prepare("SELECT id, name, email, provider, status, avatar, sync_status, last_sync_at, ai_enabled FROM email_accounts ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(EmailAccountRow {
                id: row.get(0)?,
                name: row.get(1)?,
                email: row.get(2)?,
                provider: row.get(3)?,
                status: row.get(4)?,
                avatar: row.get(5)?,
                sync_status: row.get(6)?,
                last_sync_at: row.get(7)?,
                ai_enabled: row.get::<_, Option<i64>>(8)?.map(|v| v != 0),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn add_account(
    conn: &Connection,
    provider: String,
    email: String,
    name: String,
) -> Result<EmailAccountRow, String> {
    if email.trim().is_empty() || !email.contains('@') {
        return Err("valid email address is required".into());
    }
    let id = new_id("acct");
    let display_name = if name.trim().is_empty() {
        email.clone()
    } else {
        name.trim().to_string()
    };
    let avatar = account_initials(&display_name, &email);
    conn.execute(
        "INSERT INTO email_accounts (id, name, email, provider, status, avatar, created_at) VALUES (?1, ?2, ?3, ?4, 'connected', ?5, ?6)",
        params![id, display_name, email, provider, avatar, now_ms()],
    ).map_err(|e| e.to_string())?;
    seed_welcome_thread(conn, &id, &display_name)?;
    Ok(EmailAccountRow {
        id,
        name: display_name,
        email,
        provider,
        status: "connected".into(),
        avatar: Some(avatar),
        sync_status: Some("idle".into()),
        last_sync_at: None,
        ai_enabled: Some(true),
    })
}

pub fn seed_welcome_thread(
    conn: &Connection,
    account_id: &str,
    name: &str,
) -> Result<(), String> {
    let thread_id = new_id("thread");
    let message_id = new_id("msg");
    let body = format!("Welcome to Veyra Mail, {name}. This local mailbox is ready for offline drafting, search, read state, archive, and send confirmation. Connect the Gmail adapter when OAuth credentials are available.");
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, is_read, is_archived, is_starred) VALUES (?1, ?2, ?3, ?4, 0, 0, 0)", params![thread_id, account_id, "Veyra Mail is ready", now_ms()]).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json) VALUES (?1, ?2, ?3, 'Veyra', 'mail@local.veyra', ?4, '[]', ?5, ?6, ?7, ?8, 0, 0, 0, ?9, '[]')",
        params![message_id, thread_id, account_id, "[]", "Veyra Mail is ready", body, "Welcome to Veyra Mail. This local mailbox is ready for offline drafting and search.", now_ms(), "[\"inbox\"]"])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_account(conn: &Connection, account_id: String) -> Result<(), String> {
    conn.execute(
        "DELETE FROM email_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_gmail_account(
    conn: &Connection,
    email: String,
    access_token: String,
    refresh_token: String,
    expires_at: i64,
) -> Result<EmailAccountRow, String> {
    let existing = conn
        .query_row(
            "SELECT id FROM email_accounts WHERE provider = 'gmail' AND email = ?1",
            params![email],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let id = existing.unwrap_or_else(|| new_id("gmail"));
    let avatar = account_initials(&email, &email);
    conn.execute("INSERT OR REPLACE INTO email_accounts (id, name, email, provider, status, avatar, created_at) VALUES (?1, ?2, ?3, 'gmail', 'connected', ?4, COALESCE((SELECT created_at FROM email_accounts WHERE id = ?1), ?5))", params![id, email, email, avatar, now_ms()]).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO email_account_tokens (account_id, access_token, refresh_token, expires_at) VALUES (?1, ?2, ?3, ?4)", params![id, access_token, refresh_token, expires_at]).map_err(|e| e.to_string())?;
    Ok(EmailAccountRow {
        id,
        name: email.clone(),
        email,
        provider: "gmail".into(),
        status: "connected".into(),
        avatar: Some(avatar),
        sync_status: Some("idle".into()),
        last_sync_at: None,
        ai_enabled: Some(true),
    })
}
