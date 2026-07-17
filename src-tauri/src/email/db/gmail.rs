use base64::Engine;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::io::{Read, Write};
use std::net::TcpListener;

use super::accounts::{list_accounts, remove_account, upsert_gmail_account};
use super::helpers::{new_uuid_id, now_ms};
use super::threads::rebuild_thread_labels_and_folders_for_account;
use super::types::{EmailAccountRow, GmailOAuthConfigInput};

#[derive(Debug, Clone)]
pub struct GmailToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

pub fn gmail_scope_setup_error() -> String {
    "Google connected, but Gmail scopes were not granted. In Google Cloud project `gmal`, make sure the OAuth consent screen includes gmail.modify, gmail.send, and gmail.compose, add your Gmail address as a test user if the app is in Testing, revoke the old Veyra grant from your Google Account, then reconnect.".to_string()
}

pub fn gmail_reauth_required_error() -> String {
    "Gmail authorization expired or was revoked. Reconnect this Gmail account to continue syncing and sending mail.".to_string()
}

pub fn gmail_oauth_config(
    conn: &Connection,
) -> Result<(String, String), String> {
    conn.query_row("SELECT client_id, client_secret FROM email_oauth_config WHERE provider = 'gmail'", [], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Configure Gmail OAuth credentials first. Create a Google Cloud OAuth Desktop client and paste its client ID/secret.".to_string())
}

pub fn refresh_gmail_token(conn: &Connection, account_id: &str) -> Result<String, String> {
    let existing = conn.query_row("SELECT access_token, refresh_token, expires_at FROM email_account_tokens WHERE account_id = ?1", params![account_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))).map_err(|e| e.to_string())?;
    if existing.2 > now_ms() + 60_000 {
        return Ok(existing.0);
    }
    let (client_id, client_secret) = gmail_oauth_config(conn)?;
    let client = reqwest::blocking::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", existing.1.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    let value = google_refresh_response_json(conn, account_id, response)?;
    let access_token = value
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "Gmail refresh response missing access_token".to_string())?
        .to_string();
    let expires_at = now_ms()
        + value
            .get("expires_in")
            .and_then(Value::as_i64)
            .unwrap_or(3600)
            * 1000;
    conn.execute(
        "UPDATE email_account_tokens SET access_token = ?1, expires_at = ?2 WHERE account_id = ?3",
        params![access_token, expires_at, account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(access_token)
}

pub fn disconnect_gmail_account_for_reauth(
    conn: &Connection,
    account_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE email_accounts SET status = 'disconnected', sync_status = 'error' WHERE id = ?1 AND provider = 'gmail'",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM email_account_tokens WHERE account_id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn configure_gmail_oauth(
    conn: &Connection,
    input: GmailOAuthConfigInput,
) -> Result<(), String> {
    if input.client_id.trim().is_empty() || input.client_secret.trim().is_empty() {
        return Err("Gmail OAuth client ID and secret are required".into());
    }
    conn.execute(
        "INSERT OR REPLACE INTO email_oauth_config (provider, client_id, client_secret, updated_at) VALUES ('gmail', ?1, ?2, ?3)",
        params![input.client_id.trim(), input.client_secret.trim(), now_ms()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn has_gmail_oauth_config(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM email_oauth_config WHERE provider = 'gmail'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

pub fn connect_gmail(conn: &Connection) -> Result<EmailAccountRow, String> {
    let (client_id, client_secret) = gmail_oauth_config(conn)?;
    connect_gmail_with_config(conn, &client_id, &client_secret)
}

pub fn connect_gmail_with_config(
    conn: &Connection,
    client_id: &str,
    client_secret: &str,
) -> Result<EmailAccountRow, String> {
    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Gmail OAuth client ID and secret are required".into());
    }
    let redirect_uri = "http://127.0.0.1:53682/oauth/gmail/callback";
    let listener = TcpListener::bind("127.0.0.1:53682")
        .map_err(|e| format!("failed to start Gmail OAuth callback server: {e}"))?;
    let scope = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send openid email profile";
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&include_granted_scopes=true&prompt=consent%20select_account",
        urlencoding::encode(client_id.trim()),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(scope),
    );
    open_url(&auth_url)?;
    let code = wait_for_oauth_code(listener)?;
    let token = exchange_gmail_code(client_id.trim(), client_secret.trim(), redirect_uri, &code)?;
    let profile = google_api_request_json(
        &token.access_token,
        reqwest::blocking::Client::new()
            .get("https://openidconnect.googleapis.com/v1/userinfo"),
    )?;
    let email = profile
        .get("emailAddress")
        .or_else(|| profile.get("email"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Google userinfo did not include an email address".to_string())?
        .to_string();
    let account = upsert_gmail_account(
        conn,
        email,
        token.access_token,
        token.refresh_token,
        token.expires_at,
    )?;
    if let Err(error) = sync_gmail_account(conn, account.id.clone()) {
        if error.contains("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
            || error.contains("insufficient authentication scopes")
            || error.contains("Insufficient Permission")
        {
            let _ = remove_account(conn, account.id.clone());
            return Err(gmail_scope_setup_error());
        }
        let _ = remove_account(conn, account.id.clone());
        return Err(error);
    }
    Ok(account)
}

pub fn sync_gmail_account(
    conn: &Connection,
    account_id: String,
) -> Result<(), String> {
    conn.execute(
        "UPDATE email_accounts SET sync_status = 'syncing' WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    let result = (|| {
        let token = refresh_gmail_token(conn, &account_id)?;
        let client = reqwest::blocking::Client::new();
        sync_gmail_labels(conn, &account_id, &token, &client)?;
        let list: Value = google_api_request_json(
            &token,
            client
                .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
                .query(&[("maxResults", "25"), ("q", "newer_than:90d")]),
        )?;
        if let Some(messages) = list.get("messages").and_then(Value::as_array) {
            for item in messages {
                let Some(message_id) = item.get("id").and_then(Value::as_str) else {
                    continue;
                };
                let message = google_api_request_json(
                    &token,
                    client
                        .get(format!(
                            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}"
                        ))
                        .query(&[("format", "full")]),
                )?;
                upsert_gmail_message(conn, &account_id, &message)?;
            }
        }
        rebuild_thread_labels_and_folders_for_account(conn, &account_id)
    })();

    if let Err(error) = result {
        let _ = conn.execute(
            "UPDATE email_accounts SET sync_status = 'error' WHERE id = ?1",
            params![account_id],
        );
        return Err(error);
    }

    conn.execute(
        "UPDATE email_accounts SET sync_status = 'idle', last_sync_at = ?1 WHERE id = ?2",
        params![now_ms(), account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_all_gmail(conn: &Connection) -> Result<(), String> {
    let accounts = list_accounts(conn)?;
    for account in accounts {
        if account.provider == "gmail" && account.status == "connected" {
            if let Err(e) = sync_gmail_account(conn, account.id.clone()) {
                log::error!("email sync failed for {}: {}", account.email, e);
                let _ = conn.execute(
                    "UPDATE email_accounts SET sync_status = 'error' WHERE id = ?1",
                    params![account.id],
                );
            }
        }
    }
    Ok(())
}

pub fn gmail_label_kind(provider_id: &str) -> (&'static str, &'static str, bool) {
    match provider_id {
        "INBOX" => ("inbox", "system", true),
        "SENT" => ("sent", "system", true),
        "DRAFTS" => ("drafts", "system", true),
        "TRASH" => ("trash", "system", true),
        "SPAM" => ("spam", "system", true),
        "STARRED" => ("starred", "system", true),
        "IMPORTANT" => ("important", "system", true),
        "ARCHIVE" => ("archive", "system", true),
        "UNREAD" => ("unread", "system", false),
        "CATEGORY_PERSONAL" => ("category", "system", true),
        "CATEGORY_SOCIAL" => ("category", "system", true),
        "CATEGORY_PROMOTIONS" => ("category", "system", true),
        "CATEGORY_UPDATES" => ("category", "system", true),
        "CATEGORY_FORUMS" => ("category", "system", true),
        id if id.starts_with("Label_") => ("custom", "user", true),
        _ => ("unknown", "user", true),
    }
}

fn sync_gmail_labels(
    conn: &Connection,
    account_id: &str,
    token: &str,
    client: &reqwest::blocking::Client,
) -> Result<(), String> {
    let labels: Value = google_api_request_json(
        token,
        client.get("https://gmail.googleapis.com/gmail/v1/users/me/labels"),
    )?;
    let Some(label_list) = labels.get("labels").and_then(Value::as_array) else {
        return Ok(());
    };
    let now = now_ms();
    for label in label_list {
        let provider_id = label.get("id").and_then(Value::as_str).unwrap_or("");
        if provider_id.is_empty() {
            continue;
        }
        let name = label
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(provider_id);
        let (kind, label_type, is_visible) = gmail_label_kind(provider_id);
        let is_system = label_type == "system";
        let unread_count = label
            .get("messagesUnread")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let total_count = label
            .get("threadsTotal")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let folder_id = new_uuid_id("folder");
        conn.execute(
            "INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(account_id, provider_id) DO UPDATE SET
               name = excluded.name, kind = excluded.kind, type = excluded.type,
               is_system = excluded.is_system, unread_count = excluded.unread_count,
               total_count = excluded.total_count, updated_at = excluded.updated_at",
            params![
                folder_id,
                account_id,
                provider_id,
                name,
                kind,
                label_type,
                if is_system { 1 } else { 0 },
                if is_visible { 1 } else { 0 },
                unread_count,
                total_count,
                now,
            ],
        )
        .map_err(|e| format!("email: upsert folder {provider_id} failed: {e}"))?;
    }
    Ok(())
}

pub fn upsert_gmail_message(
    conn: &Connection,
    account_id: &str,
    message: &Value,
) -> Result<(), String> {
    let provider_id = message
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let provider_thread_id = message
        .get("threadId")
        .and_then(Value::as_str)
        .unwrap_or(provider_id);
    let thread_id = format!("gmail-thread-{provider_thread_id}");
    let payload = message.get("payload").unwrap_or(&Value::Null);
    let headers = payload
        .get("headers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let header = |name: &str| -> String {
        headers
            .iter()
            .find(|h| {
                h.get("name")
                    .and_then(Value::as_str)
                    .map(|n| n.eq_ignore_ascii_case(name))
                    .unwrap_or(false)
            })
            .and_then(|h| h.get("value"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let subject = header("Subject");
    let from_raw = header("From");
    let (from_name, from_email) = parse_address(&from_raw);
    let to_json =
        serde_json::to_string(&parse_address_list(&header("To"))).map_err(|e| e.to_string())?;
    let cc_json =
        serde_json::to_string(&parse_address_list(&header("Cc"))).map_err(|e| e.to_string())?;
    let labels_raw: Vec<String> = message
        .get("labelIds")
        .and_then(Value::as_array)
        .map(|v| {
            v.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();
    let labels_lower: Vec<String> = labels_raw.iter().map(|s| s.to_lowercase()).collect();
    let is_read = !labels_lower.iter().any(|label| label == "unread");
    let has_inbox = labels_lower.iter().any(|label| label == "inbox");
    let has_sent = labels_lower.iter().any(|label| label == "sent");
    let is_archived = !labels_lower.is_empty() && !has_inbox && !has_sent;
    let is_starred = labels_lower.iter().any(|l| l == "starred");
    let timestamp = message
        .get("internalDate")
        .and_then(Value::as_str)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or_else(now_ms);
    let body_text = gmail_body_text(payload);
    let body_html_raw = gmail_body_html(payload);
    let sanitized_html = if !body_html_raw.is_empty() {
        crate::email::html::sanitize_email_html(&body_html_raw)
    } else {
        String::new()
    };
    let body = if body_text.is_empty() && !sanitized_html.is_empty() {
        crate::email::html::html_to_plain_text(&sanitized_html)
    } else {
        body_text.clone()
    };
    let html_for_parse = html_for_body_parse(&body_html_raw, &sanitized_html);
    let parsed = crate::email::thread_parser::parse_message_body(html_for_parse, &body_text);
    let body_parse_status = parsed.parse_status.clone();
    let parsed_parts_json =
        serde_json::to_string(&parsed).map_err(|e| e.to_string())?;
    let body_html_val: Option<String> = if body_html_raw.is_empty() {
        None
    } else {
        Some(body_html_raw)
    };
    let sanitized_html_val: Option<String> = if sanitized_html.is_empty() {
        None
    } else {
        Some(sanitized_html)
    };

    let snippet = message
        .get("snippet")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let now = now_ms();
    let labels_json =
        serde_json::to_string(&labels_raw).map_err(|e| e.to_string())?;
    let attachments_json = serde_json::to_string(
        &gmail_attachment_metadata(payload),
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO email_threads (id, account_id, subject, last_message_at, is_read, is_archived, is_starred, labels_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           last_message_at = MAX(email_threads.last_message_at, excluded.last_message_at),
           is_read = CASE WHEN excluded.is_read = 0 THEN 0 ELSE email_threads.is_read END,
           is_archived = excluded.is_archived,
           is_starred = CASE WHEN excluded.is_starred = 1 THEN 1 ELSE email_threads.is_starred END,
           labels_json = excluded.labels_json",
        params![
            thread_id,
            account_id,
            subject,
            timestamp,
            if is_read { 1 } else { 0 },
            if is_archived { 1 } else { 0 },
            if is_starred { 1 } else { 0 },
            labels_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json, provider_message_id, provider_thread_id, body_html, sanitized_html, body_parse_status, parsed_parts_json, body_text, headers_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
        params![
            format!("gmail-msg-{provider_id}"),
            thread_id,
            account_id,
            from_name,
            from_email,
            to_json,
            cc_json,
            subject,
            body,
            snippet,
            timestamp,
            if is_read { 1 } else { 0 },
            if is_archived { 1 } else { 0 },
            if is_starred { 1 } else { 0 },
            labels_json,
            attachments_json,
            provider_id,
            provider_thread_id,
            body_html_val,
            sanitized_html_val,
            body_parse_status,
            parsed_parts_json,
            body_text,
            "{}",
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let all_thread_labels: Vec<String> = super::threads::query_strings(
        conn,
        "SELECT DISTINCT value FROM email_messages, json_each(email_messages.labels_json) WHERE thread_id = ?1",
        params![thread_id],
    )?;
    let thread_labels_json =
        serde_json::to_string(&all_thread_labels).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE email_threads SET labels_json = ?1 WHERE id = ?2",
        params![thread_labels_json, thread_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM email_thread_folders WHERE thread_id = ?1",
        params![thread_id],
    )
    .map_err(|e| e.to_string())?;
    for label in &all_thread_labels {
        conn.execute(
            "INSERT OR IGNORE INTO email_thread_folders (thread_id, folder_id)
             SELECT ?1, id FROM email_folders WHERE account_id = ?2 AND UPPER(provider_id) = UPPER(?3)",
            params![thread_id, account_id, label],
        )
        .map_err(|e| e.to_string())?;
    }

    let attachments = gmail_attachment_metadata(payload);
    for att in attachments {
        let att_id = new_uuid_id("att");
        let msg_id = format!("gmail-msg-{provider_id}");
        conn.execute(
            "INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'metadata', 'not_started', ?9, ?9)
             ON CONFLICT(message_id, provider_attachment_id) DO UPDATE SET
               filename = excluded.filename, mime_type = excluded.mime_type,
               size = excluded.size, updated_at = excluded.updated_at",
            params![
                att_id,
                account_id,
                thread_id,
                msg_id,
                att.attachment_id,
                att.filename,
                att.mime_type,
                att.size,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GmailAttachmentMeta {
    pub attachment_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
}

pub fn gmail_attachment_metadata(payload: &Value) -> Vec<GmailAttachmentMeta> {
    let mut result = Vec::new();
    collect_attachment_parts(payload, &mut result);
    result
}

fn collect_attachment_parts(payload: &Value, out: &mut Vec<GmailAttachmentMeta>) {
    if let Some(parts) = payload.get("parts").and_then(Value::as_array) {
        for part in parts {
            let body = part.get("body").unwrap_or(&Value::Null);
            if let Some(att_id) = body.get("attachmentId").and_then(Value::as_str) {
                let filename = part
                    .get("filename")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                if !filename.is_empty() {
                    out.push(GmailAttachmentMeta {
                        attachment_id: att_id.to_string(),
                        filename,
                        mime_type: part
                            .get("mimeType")
                            .and_then(Value::as_str)
                            .unwrap_or("application/octet-stream")
                            .to_string(),
                        size: body.get("size").and_then(Value::as_i64).unwrap_or(0),
                    });
                }
            }
            collect_attachment_parts(part, out);
        }
    }
}

pub fn parse_address(raw: &str) -> (String, String) {
    if let Some((name, rest)) = raw.split_once('<') {
        let email = rest.trim_end_matches('>').trim().to_string();
        let name = name.trim().trim_matches('"').to_string();
        return (if name.is_empty() { email.clone() } else { name }, email);
    }
    (raw.to_string(), raw.to_string())
}

pub fn parse_address_list(raw: &str) -> Vec<super::types::EmailAddressRow> {
    raw.split(',')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let (name, email) = parse_address(trimmed);
            Some(super::types::EmailAddressRow { name, email })
        })
        .collect()
}

pub fn html_for_body_parse<'a>(body_html_raw: &'a str, sanitized_html: &'a str) -> &'a str {
    if !sanitized_html.is_empty() {
        sanitized_html
    } else {
        body_html_raw
    }
}

pub fn gmail_body_text(payload: &Value) -> String {
    if payload
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .starts_with("text/plain")
    {
        if let Some(data) = payload.pointer("/body/data").and_then(Value::as_str) {
            return decode_gmail_data(data);
        }
    }
    if let Some(parts) = payload.get("parts").and_then(Value::as_array) {
        for part in parts {
            let body = gmail_body_text(part);
            if !body.is_empty() {
                return body;
            }
        }
    }
    String::new()
}

pub fn gmail_body_html(payload: &Value) -> String {
    if payload
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .starts_with("text/html")
    {
        if let Some(data) = payload.pointer("/body/data").and_then(Value::as_str) {
            return decode_gmail_data(data);
        }
    }
    if let Some(parts) = payload.get("parts").and_then(Value::as_array) {
        for part in parts {
            let body = gmail_body_html(part);
            if !body.is_empty() {
                return body;
            }
        }
    }
    String::new()
}

pub fn decode_gmail_data(data: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(data)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(data))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
        Ok(())
    }
}

fn wait_for_oauth_code(listener: TcpListener) -> Result<String, String> {
    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    let mut buffer = [0_u8; 4096];
    let read = stream.read(&mut buffer).map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let first_line = request.lines().next().unwrap_or_default();
    let path = first_line.split_whitespace().nth(1).unwrap_or_default();
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or_default();
    if let Some(error) = query_param(query, "error") {
        let description = query_param(query, "error_description")
            .unwrap_or_else(|| "Google did not include more detail".to_string());
        let response = format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Gmail connection failed</h1><p>{}: {}</p><p>You can return to Veyra.</p></body></html>",
            html_escape(&error),
            html_escape(&description)
        );
        let _ = stream.write_all(response.as_bytes());
        return Err(format!("Gmail OAuth failed: {error}: {description}"));
    }
    let code = query
        .split('&')
        .find_map(|part| {
            let (key, value) = part.split_once('=')?;
            (key == "code")
                .then(|| urlencoding::decode(value).ok().map(|v| v.into_owned()))
                .flatten()
        })
        .ok_or_else(|| "Gmail OAuth callback did not include a code".to_string())?;
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Gmail connected</h1><p>You can return to Veyra.</p></body></html>";
    let _ = stream.write_all(response.as_bytes());
    Ok(code)
}

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|part| {
        let (key, value) = part.split_once('=')?;
        (key == name)
            .then(|| urlencoding::decode(value).ok().map(|v| v.into_owned()))
            .flatten()
    })
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn exchange_gmail_code(
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> Result<GmailToken, String> {
    let client = reqwest::blocking::Client::new();
    let value: Value = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .map_err(|e| e.to_string())
        .and_then(google_response_json)?;
    validate_gmail_token_scope(&value)?;
    Ok(GmailToken {
        access_token: value
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| "Gmail token response missing access_token".to_string())?
            .to_string(),
        refresh_token: value
            .get("refresh_token")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                "Gmail token response missing refresh_token; revoke app access and reconnect"
                    .to_string()
            })?
            .to_string(),
        expires_at: now_ms()
            + value
                .get("expires_in")
                .and_then(Value::as_i64)
                .unwrap_or(3600)
                * 1000,
    })
}

fn validate_gmail_token_scope(value: &Value) -> Result<(), String> {
    let Some(scope) = value.get("scope").and_then(Value::as_str) else {
        return Ok(());
    };
    let scopes: std::collections::HashSet<&str> = scope.split_whitespace().collect();
    let required = [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.send",
    ];
    if required.iter().all(|scope| scopes.contains(scope)) {
        return Ok(());
    }
    Err(gmail_scope_setup_error())
}

fn google_api_request_json(
    builder_token: &str,
    builder: reqwest::blocking::RequestBuilder,
) -> Result<Value, String> {
    let response = builder
        .bearer_auth(builder_token)
        .send()
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Google API request failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|e| format!("failed to parse Google API response: {e}; body: {body}"))
}

fn google_response_json(response: reqwest::blocking::Response) -> Result<Value, String> {
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Google OAuth token request failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|e| format!("failed to parse Google OAuth token response: {e}; body: {body}"))
}

fn google_refresh_response_json(
    conn: &Connection,
    account_id: &str,
    response: reqwest::blocking::Response,
) -> Result<Value, String> {
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    if status.is_success() {
        return serde_json::from_str(&body).map_err(|e| {
            format!("failed to parse Google OAuth token response: {e}; body: {body}")
        });
    }
    if is_invalid_grant_response(&body) {
        disconnect_gmail_account_for_reauth(conn, account_id)?;
        return Err(gmail_reauth_required_error());
    }
    Err(format!("Google OAuth token request failed ({status}): {body}"))
}

pub fn is_invalid_grant_response(body: &str) -> bool {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(Value::as_str)
                .map(|error| error == "invalid_grant")
        })
        .unwrap_or(false)
}

pub fn send_gmail_message(
    conn: &Connection,
    account_id: &str,
    from_email: &str,
    draft: &super::types::EmailDraftInput,
) -> Result<String, String> {
    let token = refresh_gmail_token(conn, account_id)?;
    let mut mime = format!("From: {from_email}\r\nTo: {}\r\n", draft.to);
    if !draft.cc.trim().is_empty() {
        mime.push_str(&format!("Cc: {}\r\n", draft.cc));
    }
    if let Some(bcc) = &draft.bcc {
        if !bcc.trim().is_empty() {
            mime.push_str(&format!("Bcc: {bcc}\r\n"));
        }
    }
    mime.push_str(&format!(
        "Subject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
        draft.subject, draft.body
    ));
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mime.as_bytes());
    let value: Value = reqwest::blocking::Client::new()
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(token)
        .json(&serde_json::json!({ "raw": raw }))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    Ok(value
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string())
}

pub fn apply_gmail_thread_labels(
    conn: &Connection,
    account_id: &str,
    local_thread_id: &str,
    add: Vec<&str>,
    remove: Vec<&str>,
) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    let provider = conn
        .query_row(
            "SELECT provider FROM email_accounts WHERE id = ?1",
            params![account_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if provider.as_deref() != Some("gmail") || !local_thread_id.starts_with("gmail-thread-") {
        return Ok(());
    }
    let gmail_thread_id = local_thread_id.trim_start_matches("gmail-thread-");
    let token = refresh_gmail_token(conn, account_id)?;
    reqwest::blocking::Client::new()
        .post(format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/threads/{gmail_thread_id}/modify"
        ))
        .bearer_auth(token)
        .json(&serde_json::json!({ "addLabelIds": add, "removeLabelIds": remove }))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    Ok(())
}
