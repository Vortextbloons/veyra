use parking_lot::Mutex;
use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;

pub struct EmailDb(pub Mutex<Connection>);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAccountRow {
    pub id: String,
    pub name: String,
    pub email: String,
    pub provider: String,
    pub status: String,
    pub avatar: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAddressRow {
    pub name: String,
    pub email: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAttachmentRow {
    pub filename: String,
    pub size: i64,
    pub mime_type: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailMessageRow {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub from: EmailAddressRow,
    pub to: Vec<EmailAddressRow>,
    pub cc: Vec<EmailAddressRow>,
    pub subject: String,
    pub body: String,
    pub snippet: String,
    pub timestamp: i64,
    pub is_read: bool,
    pub is_archived: bool,
    pub is_starred: bool,
    pub labels: Vec<String>,
    pub attachments: Vec<EmailAttachmentRow>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailThreadRow {
    pub id: String,
    pub account_id: String,
    pub subject: String,
    pub messages: Vec<EmailMessageRow>,
    pub participants: Vec<String>,
    pub last_message_at: i64,
    pub is_read: bool,
    pub is_archived: bool,
    pub is_starred: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailDraftInput {
    pub id: Option<String>,
    pub account_id: String,
    pub to: String,
    pub cc: String,
    pub bcc: Option<String>,
    pub subject: String,
    pub body: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailDraftRow {
    pub id: String,
    pub account_id: String,
    pub to: String,
    pub cc: String,
    pub bcc: String,
    pub subject: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailSendResult {
    pub sent: bool,
    pub message_id: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailOAuthConfigInput {
    pub client_id: String,
    pub client_secret: String,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  snippet TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT NOT NULL,
  attachments_json TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES email_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  cc_addr TEXT NOT NULL,
  bcc_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_oauth_config (
  provider TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_account_tokens (
  account_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_threads_account ON email_threads(account_id, is_archived, last_message_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_email_messages_search ON email_messages(account_id, subject, from_email);
"#;

impl EmailDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("email schema migration failed: {e}"))?;
        Ok(EmailDb(Mutex::new(conn)))
    }
}

#[derive(Clone)]
pub struct EmailDbState {
    app: tauri::AppHandle,
    db: Arc<Mutex<Option<Result<Arc<EmailDb>, String>>>>,
}

impl EmailDbState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app, db: Arc::new(Mutex::new(None)) }
    }

    pub fn spawn_background_init(&self) {
        crate::db_utils::spawn_lazy_db_init(
            self.app.clone(),
            Arc::clone(&self.db),
            EmailDb::init,
            "EmailDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(EmailDb::init(&self.app).map(Arc::new));
            }
            match slot.as_ref().unwrap() {
                Ok(db) => Arc::clone(db),
                Err(error) => return Err(error.clone()),
            }
        };
        let guard = db.0.lock();
        f(&guard)
    }
}

impl crate::db_utils::DbConnectionState for EmailDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

fn now_ms() -> i64 { chrono::Utc::now().timestamp_millis() }

fn new_id(prefix: &str) -> String { format!("{}-{}", prefix, now_ms()) }

fn parse_json_vec<T: for<'de> Deserialize<'de>>(value: String) -> Vec<T> {
    serde_json::from_str(&value).unwrap_or_default()
}

fn account_initials(name: &str, email: &str) -> String {
    let source = if name.trim().is_empty() { email } else { name };
    source.chars().filter(|c| c.is_ascii_alphanumeric()).take(2).collect::<String>().to_uppercase()
}

pub fn configure_gmail_oauth(conn: &Connection, input: GmailOAuthConfigInput) -> Result<(), String> {
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
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&login_hint=",
        urlencoding::encode(client_id.trim()),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(scope),
    );
    open_url(&auth_url)?;
    let code = wait_for_oauth_code(listener)?;
    let token = exchange_gmail_code(client_id.trim(), client_secret.trim(), redirect_uri, &code)?;
    let profile = gmail_request(&token.access_token, reqwest::blocking::Client::new().get("https://gmail.googleapis.com/gmail/v1/users/me/profile"))?;
    let email = profile.get("emailAddress").and_then(Value::as_str).ok_or_else(|| "Gmail profile did not include an email address".to_string())?.to_string();
    let account = upsert_gmail_account(conn, email, token)?;
    sync_gmail_account(conn, account.id.clone())?;
    Ok(account)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
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
    let code = query.split('&').find_map(|part| {
        let (key, value) = part.split_once('=')?;
        (key == "code").then(|| urlencoding::decode(value).ok().map(|v| v.into_owned())).flatten()
    }).ok_or_else(|| "Gmail OAuth callback did not include a code".to_string())?;
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Gmail connected</h1><p>You can return to Veyra.</p></body></html>";
    let _ = stream.write_all(response.as_bytes());
    Ok(code)
}

#[derive(Debug, Clone)]
struct GmailToken {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
}

fn gmail_oauth_config(conn: &Connection) -> Result<(String, String), String> {
    conn.query_row("SELECT client_id, client_secret FROM email_oauth_config WHERE provider = 'gmail'", [], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Configure Gmail OAuth credentials first. Create a Google Cloud OAuth Desktop client and paste its client ID/secret.".to_string())
}

fn exchange_gmail_code(client_id: &str, client_secret: &str, redirect_uri: &str, code: &str) -> Result<GmailToken, String> {
    let client = reqwest::blocking::Client::new();
    let value: Value = client.post("https://oauth2.googleapis.com/token")
        .form(&[("client_id", client_id), ("client_secret", client_secret), ("code", code), ("grant_type", "authorization_code"), ("redirect_uri", redirect_uri)])
        .send().map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().map_err(|e| e.to_string())?;
    Ok(GmailToken {
        access_token: value.get("access_token").and_then(Value::as_str).ok_or_else(|| "Gmail token response missing access_token".to_string())?.to_string(),
        refresh_token: value.get("refresh_token").and_then(Value::as_str).ok_or_else(|| "Gmail token response missing refresh_token; revoke app access and reconnect".to_string())?.to_string(),
        expires_at: now_ms() + value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600) * 1000,
    })
}

fn refresh_gmail_token(conn: &Connection, account_id: &str) -> Result<String, String> {
    let existing = conn.query_row("SELECT access_token, refresh_token, expires_at FROM email_account_tokens WHERE account_id = ?1", params![account_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))).map_err(|e| e.to_string())?;
    if existing.2 > now_ms() + 60_000 {
        return Ok(existing.0);
    }
    let (client_id, client_secret) = gmail_oauth_config(conn)?;
    let client = reqwest::blocking::Client::new();
    let value: Value = client.post("https://oauth2.googleapis.com/token")
        .form(&[("client_id", client_id.as_str()), ("client_secret", client_secret.as_str()), ("refresh_token", existing.1.as_str()), ("grant_type", "refresh_token")])
        .send().map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().map_err(|e| e.to_string())?;
    let access_token = value.get("access_token").and_then(Value::as_str).ok_or_else(|| "Gmail refresh response missing access_token".to_string())?.to_string();
    let expires_at = now_ms() + value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600) * 1000;
    conn.execute("UPDATE email_account_tokens SET access_token = ?1, expires_at = ?2 WHERE account_id = ?3", params![access_token, expires_at, account_id]).map_err(|e| e.to_string())?;
    Ok(access_token)
}

fn gmail_request(builder_token: &str, builder: reqwest::blocking::RequestBuilder) -> Result<Value, String> {
    builder.bearer_auth(builder_token).send().map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())
}

fn upsert_gmail_account(conn: &Connection, email: String, token: GmailToken) -> Result<EmailAccountRow, String> {
    let existing = conn.query_row("SELECT id FROM email_accounts WHERE provider = 'gmail' AND email = ?1", params![email], |row| row.get::<_, String>(0)).optional().map_err(|e| e.to_string())?;
    let id = existing.unwrap_or_else(|| new_id("gmail"));
    let avatar = account_initials(&email, &email);
    conn.execute("INSERT OR REPLACE INTO email_accounts (id, name, email, provider, status, avatar, created_at) VALUES (?1, ?2, ?3, 'gmail', 'connected', ?4, COALESCE((SELECT created_at FROM email_accounts WHERE id = ?1), ?5))", params![id, email, email, avatar, now_ms()]).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO email_account_tokens (account_id, access_token, refresh_token, expires_at) VALUES (?1, ?2, ?3, ?4)", params![id, token.access_token, token.refresh_token, token.expires_at]).map_err(|e| e.to_string())?;
    Ok(EmailAccountRow { id, name: email.clone(), email, provider: "gmail".into(), status: "connected".into(), avatar: Some(avatar) })
}

pub fn sync_gmail_account(conn: &Connection, account_id: String) -> Result<(), String> {
    let token = refresh_gmail_token(conn, &account_id)?;
    let client = reqwest::blocking::Client::new();
    let list: Value = gmail_request(&token, client.get("https://gmail.googleapis.com/gmail/v1/users/me/messages").query(&[("maxResults", "25"), ("q", "newer_than:90d")]))?;
    let Some(messages) = list.get("messages").and_then(Value::as_array) else { return Ok(()); };
    for item in messages {
        let Some(message_id) = item.get("id").and_then(Value::as_str) else { continue; };
        let message = gmail_request(&token, client.get(format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}")).query(&[("format", "full")]))?;
        upsert_gmail_message(conn, &account_id, &message)?;
    }
    Ok(())
}

fn upsert_gmail_message(conn: &Connection, account_id: &str, message: &Value) -> Result<(), String> {
    let provider_id = message.get("id").and_then(Value::as_str).unwrap_or_default();
    let thread_id = format!("gmail-thread-{}", message.get("threadId").and_then(Value::as_str).unwrap_or(provider_id));
    let payload = message.get("payload").unwrap_or(&Value::Null);
    let headers = payload.get("headers").and_then(Value::as_array).cloned().unwrap_or_default();
    let header = |name: &str| -> String { headers.iter().find(|h| h.get("name").and_then(Value::as_str).map(|n| n.eq_ignore_ascii_case(name)).unwrap_or(false)).and_then(|h| h.get("value")).and_then(Value::as_str).unwrap_or_default().to_string() };
    let subject = header("Subject");
    let from_raw = header("From");
    let (from_name, from_email) = parse_address(&from_raw);
    let to_json = serde_json::to_string(&parse_address_list(&header("To"))).map_err(|e| e.to_string())?;
    let cc_json = serde_json::to_string(&parse_address_list(&header("Cc"))).map_err(|e| e.to_string())?;
    let labels: Vec<String> = message.get("labelIds").and_then(Value::as_array).map(|v| v.iter().filter_map(Value::as_str).map(|s| s.to_lowercase()).collect()).unwrap_or_default();
    let is_read = !labels.iter().any(|label| label == "unread");
    let is_archived = !labels.iter().any(|label| label == "inbox") && !labels.iter().any(|label| label == "sent");
    let timestamp = message.get("internalDate").and_then(Value::as_str).and_then(|v| v.parse::<i64>().ok()).unwrap_or_else(now_ms);
    let body = gmail_body_text(payload);
    let snippet = message.get("snippet").and_then(Value::as_str).unwrap_or_default().to_string();
    conn.execute("INSERT OR REPLACE INTO email_threads (id, account_id, subject, last_message_at, is_read, is_archived, is_starred) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![thread_id, account_id, subject, timestamp, if is_read { 1 } else { 0 }, if is_archived { 1 } else { 0 }, if labels.iter().any(|l| l == "starred") { 1 } else { 0 }]).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, '[]')",
        params![format!("gmail-msg-{provider_id}"), thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, if is_read { 1 } else { 0 }, if is_archived { 1 } else { 0 }, if labels.iter().any(|l| l == "starred") { 1 } else { 0 }, serde_json::to_string(&labels).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_address(raw: &str) -> (String, String) {
    if let Some((name, rest)) = raw.split_once('<') {
        let email = rest.trim_end_matches('>').trim().to_string();
        let name = name.trim().trim_matches('"').to_string();
        return (if name.is_empty() { email.clone() } else { name }, email);
    }
    (raw.to_string(), raw.to_string())
}

fn parse_address_list(raw: &str) -> Vec<EmailAddressRow> {
    raw.split(',').filter_map(|part| {
        let trimmed = part.trim();
        if trimmed.is_empty() { return None; }
        let (name, email) = parse_address(trimmed);
        Some(EmailAddressRow { name, email })
    }).collect()
}

fn gmail_body_text(payload: &Value) -> String {
    if payload.get("mimeType").and_then(Value::as_str).unwrap_or_default().starts_with("text/plain") {
        if let Some(data) = payload.pointer("/body/data").and_then(Value::as_str) {
            return decode_gmail_data(data);
        }
    }
    if let Some(parts) = payload.get("parts").and_then(Value::as_array) {
        for part in parts {
            let body = gmail_body_text(part);
            if !body.is_empty() { return body; }
        }
    }
    String::new()
}

fn decode_gmail_data(data: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(data)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(data))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<EmailAccountRow>, String> {
    let mut stmt = conn.prepare("SELECT id, name, email, provider, status, avatar FROM email_accounts ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(EmailAccountRow {
        id: row.get(0)?, name: row.get(1)?, email: row.get(2)?, provider: row.get(3)?, status: row.get(4)?, avatar: row.get(5)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn add_account(conn: &Connection, provider: String, email: String, name: String) -> Result<EmailAccountRow, String> {
    if email.trim().is_empty() || !email.contains('@') { return Err("valid email address is required".into()); }
    let id = new_id("acct");
    let display_name = if name.trim().is_empty() { email.clone() } else { name.trim().to_string() };
    let avatar = account_initials(&display_name, &email);
    conn.execute(
        "INSERT INTO email_accounts (id, name, email, provider, status, avatar, created_at) VALUES (?1, ?2, ?3, ?4, 'connected', ?5, ?6)",
        params![id, display_name, email, provider, avatar, now_ms()],
    ).map_err(|e| e.to_string())?;
    seed_welcome_thread(conn, &id, &display_name)?;
    Ok(EmailAccountRow { id, name: display_name, email, provider, status: "connected".into(), avatar: Some(avatar) })
}

fn seed_welcome_thread(conn: &Connection, account_id: &str, name: &str) -> Result<(), String> {
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
    conn.execute("DELETE FROM email_accounts WHERE id = ?1", params![account_id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_thread(conn: &Connection, thread_id: String) -> Result<EmailThreadRow, String> {
    let mut thread = conn.query_row("SELECT id, account_id, subject, last_message_at, is_read, is_archived, is_starred FROM email_threads WHERE id = ?1", params![thread_id], |row| Ok(EmailThreadRow {
        id: row.get(0)?, account_id: row.get(1)?, subject: row.get(2)?, messages: Vec::new(), participants: Vec::new(), last_message_at: row.get(3)?, is_read: row.get::<_, i64>(4)? != 0, is_archived: row.get::<_, i64>(5)? != 0, is_starred: row.get::<_, i64>(6)? != 0,
    })).map_err(|e| e.to_string())?;
    thread.messages = load_messages(conn, &thread.id)?;
    thread.participants = thread.messages.iter().map(|m| m.from.name.clone()).collect();
    Ok(thread)
}

fn load_messages(conn: &Connection, thread_id: &str) -> Result<Vec<EmailMessageRow>, String> {
    let mut stmt = conn.prepare("SELECT id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json FROM email_messages WHERE thread_id = ?1 ORDER BY timestamp ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![thread_id], |row| Ok(EmailMessageRow {
        id: row.get(0)?, thread_id: row.get(1)?, account_id: row.get(2)?, from: EmailAddressRow { name: row.get(3)?, email: row.get(4)? }, to: parse_json_vec(row.get(5)?), cc: parse_json_vec(row.get(6)?), subject: row.get(7)?, body: row.get(8)?, snippet: row.get(9)?, timestamp: row.get(10)?, is_read: row.get::<_, i64>(11)? != 0, is_archived: row.get::<_, i64>(12)? != 0, is_starred: row.get::<_, i64>(13)? != 0, labels: parse_json_vec(row.get(14)?), attachments: parse_json_vec(row.get(15)?),
    })).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn list_threads(conn: &Connection, account_id: String, folder: String, query: Option<String>) -> Result<Vec<EmailThreadRow>, String> {
    if folder == "drafts" {
        return list_draft_threads(conn, account_id, query);
    }
    let archived = if folder == "archive" { 1 } else { 0 };
    let mut stmt = conn.prepare("SELECT id FROM email_threads WHERE account_id = ?1 AND is_archived = ?2 ORDER BY last_message_at DESC").map_err(|e| e.to_string())?;
    let ids = stmt.query_map(params![account_id, archived], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
    let needle = query.unwrap_or_default().to_lowercase();
    let mut threads = Vec::new();
    for id in ids {
        let thread = load_thread(conn, id)?;
        if folder == "starred" && !thread.is_starred { continue; }
        if folder == "sent" && !thread.messages.iter().any(|m| m.labels.iter().any(|label| label == "sent")) { continue; }
        if folder == "inbox" && !thread.messages.iter().any(|m| m.labels.iter().any(|label| label == "inbox")) { continue; }
        if !needle.is_empty() {
            let hit = thread.subject.to_lowercase().contains(&needle) || thread.messages.iter().any(|m| m.body.to_lowercase().contains(&needle) || m.from.email.to_lowercase().contains(&needle));
            if !hit { continue; }
        }
        threads.push(thread);
    }
    Ok(threads)
}

fn list_draft_threads(conn: &Connection, account_id: String, query: Option<String>) -> Result<Vec<EmailThreadRow>, String> {
    let mut stmt = conn.prepare("SELECT id, account_id, to_addr, cc_addr, subject, body, created_at, updated_at FROM email_drafts WHERE account_id = ?1 ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![account_id], |row| {
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
            from: EmailAddressRow { name: "Draft".into(), email: "draft@local.veyra".into() },
            to: vec![EmailAddressRow { name: to.clone(), email: to.clone() }],
            cc: if cc.is_empty() { Vec::new() } else { vec![EmailAddressRow { name: cc.clone(), email: cc.clone() }] },
            subject: subject.clone(),
            body,
            snippet,
            timestamp: updated_at,
            is_read: true,
            is_archived: false,
            is_starred: false,
            labels: vec!["draft".into()],
            attachments: Vec::new(),
        };
        Ok(EmailThreadRow {
            id: thread_id,
            account_id,
            subject,
            messages: vec![message],
            participants: if to.is_empty() { vec!["Unsaved recipient".into()] } else { vec![to] },
            last_message_at: updated_at.max(created_at),
            is_read: true,
            is_archived: false,
            is_starred: false,
        })
    }).map_err(|e| e.to_string())?;
    let needle = query.unwrap_or_default().to_lowercase();
    let threads = rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
    if needle.is_empty() {
        return Ok(threads);
    }
    Ok(threads.into_iter().filter(|thread| {
        thread.subject.to_lowercase().contains(&needle) || thread.messages.iter().any(|message| message.body.to_lowercase().contains(&needle))
    }).collect())
}

pub fn get_thread(conn: &Connection, thread_id: String) -> Result<EmailThreadRow, String> {
    if let Some(draft_id) = thread_id.strip_prefix("draft-thread-") {
        return load_draft_thread(conn, draft_id.to_string());
    }
    load_thread(conn, thread_id)
}

fn load_draft_thread(conn: &Connection, draft_id: String) -> Result<EmailThreadRow, String> {
    let account_id = conn.query_row("SELECT account_id FROM email_drafts WHERE id = ?1", params![draft_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    list_draft_threads(conn, account_id, None)?
        .into_iter()
        .find(|thread| thread.id == format!("draft-thread-{draft_id}"))
        .ok_or_else(|| "draft not found".to_string())
}

pub fn save_draft(conn: &Connection, draft: EmailDraftInput) -> Result<EmailDraftRow, String> {
    let now = now_ms();
    let id = draft.id.filter(|v| !v.is_empty()).unwrap_or_else(|| new_id("draft"));
    let bcc = draft.bcc.unwrap_or_default();
    let existing_created = conn.query_row("SELECT created_at FROM email_drafts WHERE id = ?1", params![id], |row| row.get::<_, i64>(0)).optional().map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);
    conn.execute("INSERT OR REPLACE INTO email_drafts (id, account_id, to_addr, cc_addr, bcc_addr, subject, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", params![id, draft.account_id, draft.to, draft.cc, bcc, draft.subject, draft.body, created_at, now]).map_err(|e| e.to_string())?;
    Ok(EmailDraftRow { id, account_id: draft.account_id, to: draft.to, cc: draft.cc, bcc, subject: draft.subject, body: draft.body, created_at, updated_at: now })
}

pub fn send_message(conn: &Connection, draft: EmailDraftInput) -> Result<EmailSendResult, String> {
    if draft.to.trim().is_empty() { return Err("recipient is required".into()); }
    let account = conn.query_row("SELECT name, email, provider FROM email_accounts WHERE id = ?1", params![draft.account_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))).map_err(|e| e.to_string())?;
    if account.2 == "gmail" {
        let sent_id = send_gmail_message(conn, &draft.account_id, &account.1, &draft)?;
        sync_gmail_account(conn, draft.account_id.clone())?;
        if let Some(id) = draft.id { let _ = conn.execute("DELETE FROM email_drafts WHERE id = ?1", params![id]); }
        return Ok(EmailSendResult { sent: true, message_id: Some(sent_id) });
    }
    let thread_id = new_id("thread");
    let message_id = new_id("sent");
    let now = now_ms();
    let to_json = serde_json::to_string(&vec![EmailAddressRow { name: draft.to.clone(), email: draft.to.clone() }]).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, is_read, is_archived, is_starred) VALUES (?1, ?2, ?3, ?4, 1, 0, 0)", params![thread_id, draft.account_id, draft.subject, now]).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, is_read, is_archived, is_starred, labels_json, attachments_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', ?7, ?8, ?9, ?10, 1, 0, 0, '[\"sent\"]', '[]')", params![message_id, thread_id, draft.account_id, account.0, account.1, to_json, draft.subject, draft.body, draft.body.chars().take(160).collect::<String>(), now]).map_err(|e| e.to_string())?;
    if let Some(id) = draft.id { let _ = conn.execute("DELETE FROM email_drafts WHERE id = ?1", params![id]); }
    Ok(EmailSendResult { sent: true, message_id: Some(message_id) })
}

fn send_gmail_message(conn: &Connection, account_id: &str, from_email: &str, draft: &EmailDraftInput) -> Result<String, String> {
    let token = refresh_gmail_token(conn, account_id)?;
    let mut mime = format!("From: {from_email}\r\nTo: {}\r\n", draft.to);
    if !draft.cc.trim().is_empty() { mime.push_str(&format!("Cc: {}\r\n", draft.cc)); }
    if let Some(bcc) = &draft.bcc { if !bcc.trim().is_empty() { mime.push_str(&format!("Bcc: {bcc}\r\n")); } }
    mime.push_str(&format!("Subject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}", draft.subject, draft.body));
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mime.as_bytes());
    let value: Value = reqwest::blocking::Client::new()
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(token)
        .json(&serde_json::json!({ "raw": raw }))
        .send().map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().map_err(|e| e.to_string())?;
    Ok(value.get("id").and_then(Value::as_str).unwrap_or_default().to_string())
}

pub fn archive_thread(conn: &Connection, thread_id: String, account_id: String) -> Result<(), String> {
    apply_gmail_thread_labels(conn, &account_id, &thread_id, vec![], vec!["INBOX"])?;
    conn.execute("UPDATE email_threads SET is_archived = 1 WHERE id = ?1 AND account_id = ?2", params![thread_id, account_id]).map_err(|e| e.to_string())?;
    conn.execute("UPDATE email_messages SET is_archived = 1 WHERE thread_id = ?1 AND account_id = ?2", params![thread_id, account_id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_read(conn: &Connection, thread_id: String, account_id: String, read: bool) -> Result<(), String> {
    if read {
        apply_gmail_thread_labels(conn, &account_id, &thread_id, vec![], vec!["UNREAD"])?;
    } else {
        apply_gmail_thread_labels(conn, &account_id, &thread_id, vec!["UNREAD"], vec![])?;
    }
    let value = if read { 1 } else { 0 };
    conn.execute("UPDATE email_threads SET is_read = ?1 WHERE id = ?2 AND account_id = ?3", params![value, thread_id, account_id]).map_err(|e| e.to_string())?;
    conn.execute("UPDATE email_messages SET is_read = ?1 WHERE thread_id = ?2 AND account_id = ?3", params![value, thread_id, account_id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_gmail_thread_labels(conn: &Connection, account_id: &str, local_thread_id: &str, add: Vec<&str>, remove: Vec<&str>) -> Result<(), String> {
    let provider = conn.query_row("SELECT provider FROM email_accounts WHERE id = ?1", params![account_id], |row| row.get::<_, String>(0)).optional().map_err(|e| e.to_string())?;
    if provider.as_deref() != Some("gmail") || !local_thread_id.starts_with("gmail-thread-") {
        return Ok(());
    }
    let gmail_thread_id = local_thread_id.trim_start_matches("gmail-thread-");
    let token = refresh_gmail_token(conn, account_id)?;
    reqwest::blocking::Client::new()
        .post(format!("https://gmail.googleapis.com/gmail/v1/users/me/threads/{gmail_thread_id}/modify"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "addLabelIds": add, "removeLabelIds": remove }))
        .send().map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    Ok(())
}
