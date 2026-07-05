use base64::Engine;
use parking_lot::Mutex;
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
    pub sync_status: Option<String>,
    pub last_sync_at: Option<i64>,
    pub ai_enabled: Option<bool>,
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
pub struct FullEmailAttachmentRow {
    pub id: String,
    pub account_id: String,
    pub thread_id: String,
    pub message_id: String,
    pub provider_attachment_id: Option<String>,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
    pub local_path: Option<String>,
    pub download_status: String,
    pub extract_status: String,
    pub extracted_text: Option<String>,
    pub extracted_text_chars: i64,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
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
    pub body_html: Option<String>,
    pub sanitized_html: Option<String>,
    pub body_parse_status: String,
    pub parsed_parts: crate::email::thread_parser::ParsedBody,
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
    pub labels: Vec<String>,
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

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailFolderRow {
    pub id: String,
    pub account_id: String,
    pub provider_id: String,
    pub name: String,
    pub kind: String,
    #[serde(rename = "type")]
    pub folder_type: String,
    pub is_system: bool,
    pub is_visible: bool,
    pub unread_count: i64,
    pub total_count: i64,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailOAuthConfigInput {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiJobRow {
    pub id: String,
    pub account_id: String,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub attachment_id: Option<String>,
    pub task_type: String,
    pub priority: i64,
    pub status: String,
    pub model_id: Option<String>,
    pub attempt_count: i64,
    pub max_attempts: i64,
    pub scheduled_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub error: Option<String>,
    pub input_hash: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiOutputRow {
    pub id: String,
    pub account_id: String,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub attachment_id: Option<String>,
    pub task_type: String,
    pub model_id: String,
    pub prompt_version: String,
    pub source_message_ids_json: String,
    pub confidence: Option<f64>,
    pub result_json: String,
    pub display_text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiJobInput {
    pub account_id: String,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub task_type: String,
    pub priority: i64,
    pub model_id: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiOutputInput {
    pub job_id: String,
    pub model_id: String,
    pub prompt_version: String,
    pub source_message_ids_json: Option<String>,
    pub confidence: Option<f64>,
    pub result_json: String,
    pub display_text: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiJobFilter {
    pub account_id: Option<String>,
    pub status: Option<String>,
    pub task_type: Option<String>,
    pub limit: Option<i64>,
}

const SCHEMA_VERSION: i64 = 4;

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

CREATE TABLE IF NOT EXISTS email_ai_settings (
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, account_id)
);

CREATE INDEX IF NOT EXISTS idx_email_threads_account ON email_threads(account_id, is_archived, last_message_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_email_messages_search ON email_messages(account_id, subject, from_email);
"#;

impl EmailDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let conn = crate::shared::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        run_migrations(&conn)?;
        Ok(EmailDb(Mutex::new(conn)))
    }
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (
            module TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("email: create _schema_migrations table failed: {e}"))?;

    let schema_version: i64 = conn
        .query_row(
            "SELECT version FROM _schema_migrations WHERE module = 'email'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if schema_version < 1 {
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("email: schema v1 migration failed: {e}"))?;

        // Phase 1 prep: add new columns to email_accounts when that phase lands.
        add_column_if_missing(conn, "email_accounts", "sync_status", "TEXT NOT NULL DEFAULT 'idle'")?;
        add_column_if_missing(conn, "email_accounts", "last_sync_at", "INTEGER")?;
        add_column_if_missing(conn, "email_accounts", "sync_cursor", "TEXT")?;
        add_column_if_missing(conn, "email_accounts", "ai_enabled", "INTEGER NOT NULL DEFAULT 1")?;
        add_column_if_missing(conn, "email_accounts", "settings_json", "TEXT NOT NULL DEFAULT '{}'")?;

        // Phase 2 prep: add body/html columns to email_messages.
        add_column_if_missing(conn, "email_messages", "provider_message_id", "TEXT")?;
        add_column_if_missing(conn, "email_messages", "provider_thread_id", "TEXT")?;
        add_column_if_missing(conn, "email_messages", "headers_json", "TEXT NOT NULL DEFAULT '{}'")?;
        add_column_if_missing(conn, "email_messages", "body_text", "TEXT NOT NULL DEFAULT ''")?;
        add_column_if_missing(conn, "email_messages", "body_html", "TEXT")?;
        add_column_if_missing(conn, "email_messages", "sanitized_html", "TEXT")?;
        add_column_if_missing(conn, "email_messages", "body_parse_status", "TEXT NOT NULL DEFAULT 'pending'")?;
        add_column_if_missing(conn, "email_messages", "parsed_parts_json", "TEXT NOT NULL DEFAULT '{}'")?;
        add_column_if_missing(conn, "email_messages", "raw_payload_json", "TEXT")?;
        add_column_if_missing(conn, "email_messages", "updated_at", "INTEGER")?;

        // Repair legacy defaults from earlier schema prep.
        conn.execute(
            "UPDATE email_messages SET parsed_parts_json = '{}' WHERE parsed_parts_json IN ('[]', '')",
            [],
        )
        .map_err(|e| format!("email: repair parsed_parts_json failed: {e}"))?;
        conn.execute(
            "UPDATE email_messages SET body_text = body WHERE body_text = '' AND body != ''",
            [],
        )
        .map_err(|e| format!("email: backfill body_text failed: {e}"))?;
    }

    if schema_version < 2 {
        // New tables for folder/label normalization and attachment tracking.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS email_folders (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              provider_id TEXT NOT NULL,
              name TEXT NOT NULL,
              kind TEXT NOT NULL,
              type TEXT NOT NULL,
              is_system INTEGER NOT NULL DEFAULT 0,
              is_visible INTEGER NOT NULL DEFAULT 1,
              unread_count INTEGER NOT NULL DEFAULT 0,
              total_count INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_email_folders_account_provider
              ON email_folders(account_id, provider_id);
            CREATE INDEX IF NOT EXISTS idx_email_folders_account_kind
              ON email_folders(account_id, kind);

            CREATE TABLE IF NOT EXISTS email_thread_folders (
              thread_id TEXT NOT NULL,
              folder_id TEXT NOT NULL,
              PRIMARY KEY (thread_id, folder_id),
              FOREIGN KEY(thread_id) REFERENCES email_threads(id) ON DELETE CASCADE,
              FOREIGN KEY(folder_id) REFERENCES email_folders(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_email_thread_folders_folder
              ON email_thread_folders(folder_id);

            CREATE TABLE IF NOT EXISTS email_attachments (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              thread_id TEXT NOT NULL,
              message_id TEXT NOT NULL,
              provider_attachment_id TEXT,
              filename TEXT NOT NULL,
              mime_type TEXT NOT NULL,
              size INTEGER NOT NULL DEFAULT 0,
              local_path TEXT,
              download_status TEXT NOT NULL DEFAULT 'metadata',
              extract_status TEXT NOT NULL DEFAULT 'not_started',
              extracted_text TEXT,
              extracted_text_chars INTEGER NOT NULL DEFAULT 0,
              error TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
              FOREIGN KEY(thread_id) REFERENCES email_threads(id) ON DELETE CASCADE,
              FOREIGN KEY(message_id) REFERENCES email_messages(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_email_attachments_message
              ON email_attachments(message_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_email_attachments_msg_provider
              ON email_attachments(message_id, provider_attachment_id);
            CREATE INDEX IF NOT EXISTS idx_email_messages_account_provider
              ON email_messages(account_id, provider_message_id);",
        )
        .map_err(|e| format!("email: schema v2 migration failed: {e}"))?;

        // Add thread-level labels_json for denormalized label access.
        add_column_if_missing(conn, "email_threads", "labels_json", "TEXT NOT NULL DEFAULT '[]'")?;

        // Backfill thread labels_json from message labels.
        conn.execute_batch(
            "UPDATE email_threads SET labels_json = (
                SELECT COALESCE(json_group_array(DISTINCT value), '[]')
                FROM email_messages, json_each(email_messages.labels_json)
                WHERE email_messages.thread_id = email_threads.id
            ) WHERE labels_json = '[]' OR labels_json IS NULL;"
        )
        .map_err(|e| format!("email: backfill thread labels_json failed: {e}"))?;

        // Backfill thread-folder joins from message labels → folder mapping.
        // Uses UPPER(provider_id) for system labels (INBOX, SENT, etc.) and original case for user labels.
        conn.execute_batch(
            "INSERT OR IGNORE INTO email_thread_folders (thread_id, folder_id)
             SELECT DISTINCT m.thread_id, f.id
             FROM email_messages m
             JOIN json_each(m.labels_json) je
             JOIN email_folders f ON f.account_id = m.account_id
               AND (f.provider_id = je.value OR f.provider_id = UPPER(je.value))
             WHERE je.value != '';"
        )
        .map_err(|e| format!("email: backfill thread-folder joins failed: {e}"))?;
    }

    if schema_version < 3 {
        // Re-run for DBs that already reached v2 before backfill/index fixes landed.
        conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_email_attachments_msg_provider
              ON email_attachments(message_id, provider_attachment_id);",
        )
        .map_err(|e| format!("email: schema v3 attachment index failed: {e}"))?;
        rebuild_thread_labels_and_folders(conn)?;
    }

    if schema_version < 4 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS email_ai_jobs (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                thread_id TEXT,
                message_id TEXT,
                attachment_id TEXT,
                task_type TEXT NOT NULL,
                priority INTEGER NOT NULL,
                status TEXT NOT NULL,
                model_id TEXT,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 3,
                scheduled_at INTEGER NOT NULL,
                started_at INTEGER,
                finished_at INTEGER,
                error TEXT,
                input_hash TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS email_ai_outputs (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                thread_id TEXT,
                message_id TEXT,
                attachment_id TEXT,
                task_type TEXT NOT NULL,
                model_id TEXT NOT NULL,
                prompt_version TEXT NOT NULL,
                source_message_ids_json TEXT NOT NULL DEFAULT '[]',
                confidence REAL,
                result_json TEXT NOT NULL,
                display_text TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_email_ai_jobs_status_priority
                ON email_ai_jobs(status, priority, scheduled_at);
            CREATE INDEX IF NOT EXISTS idx_email_ai_outputs_thread_task
                ON email_ai_outputs(thread_id, task_type, updated_at);
            CREATE INDEX IF NOT EXISTS idx_email_folders_account_kind
                ON email_folders(account_id, kind);
            CREATE INDEX IF NOT EXISTS idx_email_messages_account_provider
                ON email_messages(account_id, provider_message_id);
            CREATE INDEX IF NOT EXISTS idx_email_messages_thread_timestamp
                ON email_messages(thread_id, timestamp);",
        )
        .map_err(|e| format!("email: schema v4 migration failed: {e}"))?;
    }

    conn.execute(
        "INSERT INTO _schema_migrations (module, version, applied_at) VALUES ('email', ?1, datetime('now'))
         ON CONFLICT(module) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at",
        [SCHEMA_VERSION],
    )
    .map_err(|e| format!("email: set schema version failed: {e}"))?;

    Ok(())
}

/// Rebuild thread labels and folder joins for all accounts (migration / repair).
fn rebuild_thread_labels_and_folders(conn: &Connection) -> Result<(), String> {
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

fn rebuild_thread_labels_and_folders_for_account(
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

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| format!("email: prepare table_info for {table}.{column} failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("email: query table_info for {table}.{column} failed: {e}"))?;
    for row in rows {
        if row.map_err(|e| format!("email: table_info row failed: {e}"))? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )
    .map_err(|e| format!("email: add column {table}.{column} failed: {e}"))?;
    Ok(())
}

#[derive(Clone)]
pub struct EmailDbState {
    app: tauri::AppHandle,
    db: crate::shared::db_utils::DbSlot<EmailDb>,
}

impl EmailDbState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            db: Arc::new(Mutex::new(None)),
        }
    }

    pub fn spawn_background_init(&self) {
        crate::shared::db_utils::spawn_lazy_db_init(
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

impl crate::shared::db_utils::DbConnectionState for EmailDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn new_id(prefix: &str) -> String {
    format!("{}-{}", prefix, now_ms())
}

/// UUID-based ID for new entity types (folders, attachments, tags, AI jobs, AI outputs, AI drafts).
/// Kept separate from `new_id` so existing account IDs retain backward-compatible format.
fn new_uuid_id(prefix: &str) -> String {
    format!("{}-{}", prefix, uuid::Uuid::new_v4())
}

fn parse_json_vec<T: for<'de> Deserialize<'de>>(value: String) -> Vec<T> {
    serde_json::from_str(&value).unwrap_or_default()
}

fn account_initials(name: &str, email: &str) -> String {
    let source = if name.trim().is_empty() { email } else { name };
    source
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(2)
        .collect::<String>()
        .to_uppercase()
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
    let account = upsert_gmail_account(conn, email, token)?;
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

#[derive(Debug, Clone)]
struct GmailToken {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
}

fn gmail_scope_setup_error() -> String {
    "Google connected, but Gmail scopes were not granted. In Google Cloud project `gmal`, make sure the OAuth consent screen includes gmail.modify, gmail.send, and gmail.compose, add your Gmail address as a test user if the app is in Testing, revoke the old Veyra grant from your Google Account, then reconnect.".to_string()
}

fn gmail_oauth_config(conn: &Connection) -> Result<(String, String), String> {
    conn.query_row("SELECT client_id, client_secret FROM email_oauth_config WHERE provider = 'gmail'", [], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Configure Gmail OAuth credentials first. Create a Google Cloud OAuth Desktop client and paste its client ID/secret.".to_string())
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

fn refresh_gmail_token(conn: &Connection, account_id: &str) -> Result<String, String> {
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

fn disconnect_gmail_account_for_reauth(conn: &Connection, account_id: &str) -> Result<(), String> {
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

fn gmail_reauth_required_error() -> String {
    "Gmail authorization expired or was revoked. Reconnect this Gmail account to continue syncing and sending mail.".to_string()
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

fn is_invalid_grant_response(body: &str) -> bool {
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

fn upsert_gmail_account(
    conn: &Connection,
    email: String,
    token: GmailToken,
) -> Result<EmailAccountRow, String> {
    let existing = conn
        .query_row(
            "SELECT id FROM email_accounts WHERE provider = 'gmail' AND email = ?1",
            params![email],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let id = existing.unwrap_or_else(|| new_id("gmail"));
    let avatar = account_initials(&email, &email);
    conn.execute("INSERT OR REPLACE INTO email_accounts (id, name, email, provider, status, avatar, created_at) VALUES (?1, ?2, ?3, 'gmail', 'connected', ?4, COALESCE((SELECT created_at FROM email_accounts WHERE id = ?1), ?5))", params![id, email, email, avatar, now_ms()]).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO email_account_tokens (account_id, access_token, refresh_token, expires_at) VALUES (?1, ?2, ?3, ?4)", params![id, token.access_token, token.refresh_token, token.expires_at]).map_err(|e| e.to_string())?;
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

pub fn sync_gmail_account(conn: &Connection, account_id: String) -> Result<(), String> {
    conn.execute(
        "UPDATE email_accounts SET sync_status = 'syncing' WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    let token = refresh_gmail_token(conn, &account_id)?;
    let client = reqwest::blocking::Client::new();
    sync_gmail_labels(conn, &account_id, &token, &client)?;
    let list: Value = google_api_request_json(
        &token,
        client
            .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
            .query(&[("maxResults", "25"), ("q", "newer_than:90d")]),
    )?;
    let Some(messages) = list.get("messages").and_then(Value::as_array) else {
        return Ok(());
    };
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
    rebuild_thread_labels_and_folders_for_account(conn, &account_id)?;
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

fn gmail_label_kind(provider_id: &str) -> (&'static str, &'static str, bool) {
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

fn upsert_gmail_message(
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
    // Lowercase copies for boolean checks only.
    let labels_lower: Vec<String> = labels_raw.iter().map(|s| s.to_lowercase()).collect();
    let is_read = !labels_lower.iter().any(|label| label == "unread");
    let has_inbox = labels_lower.iter().any(|label| label == "inbox");
    let has_sent = labels_lower.iter().any(|label| label == "sent");
    // Archived = has at least one label but neither inbox nor sent.
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
    // If no text/plain, fall back to extracting text from sanitized HTML.
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

    // Upsert thread: preserve original subject on conflict, update mutable fields.
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

    // Upsert message.
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

    // Rebuild thread-folder joins from the union of all message labels in this thread.
    // This prevents one message's label set from overwriting another's.
    let all_thread_labels: Vec<String> = query_strings(
        conn,
        "SELECT DISTINCT value FROM email_messages, json_each(email_messages.labels_json) WHERE thread_id = ?1",
        params![thread_id],
    )?;
    // Update thread-level labels_json with the union.
    let thread_labels_json =
        serde_json::to_string(&all_thread_labels).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE email_threads SET labels_json = ?1 WHERE id = ?2",
        params![thread_labels_json, thread_id],
    )
    .map_err(|e| e.to_string())?;
    // Rebuild folder joins.
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

    // Upsert attachment metadata — deduplicate by (message_id, provider_attachment_id).
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

#[derive(Serialize, Deserialize)]
struct GmailAttachmentMeta {
    attachment_id: String,
    filename: String,
    mime_type: String,
    size: i64,
}

fn gmail_attachment_metadata(payload: &Value) -> Vec<GmailAttachmentMeta> {
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

pub fn list_attachments(conn: &Connection, message_id: &str) -> Result<Vec<FullEmailAttachmentRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, thread_id, message_id, provider_attachment_id,
                    filename, mime_type, size, local_path, download_status,
                    extract_status, extracted_text, extracted_text_chars,
                    error, created_at, updated_at
             FROM email_attachments WHERE message_id = ?1 ORDER BY filename",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![message_id], |row| {
            Ok(FullEmailAttachmentRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                thread_id: row.get(2)?,
                message_id: row.get(3)?,
                provider_attachment_id: row.get(4)?,
                filename: row.get(5)?,
                mime_type: row.get(6)?,
                size: row.get(7)?,
                local_path: row.get(8)?,
                download_status: row.get(9)?,
                extract_status: row.get(10)?,
                extracted_text: row.get(11)?,
                extracted_text_chars: row.get(12)?,
                error: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_attachment_row(conn: &Connection, attachment_id: &str) -> Result<FullEmailAttachmentRow, String> {
    conn.query_row(
        "SELECT id, account_id, thread_id, message_id, provider_attachment_id,
                filename, mime_type, size, local_path, download_status,
                extract_status, extracted_text, extracted_text_chars,
                error, created_at, updated_at
         FROM email_attachments WHERE id = ?1",
        params![attachment_id],
        |row| {
            Ok(FullEmailAttachmentRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                thread_id: row.get(2)?,
                message_id: row.get(3)?,
                provider_attachment_id: row.get(4)?,
                filename: row.get(5)?,
                mime_type: row.get(6)?,
                size: row.get(7)?,
                local_path: row.get(8)?,
                download_status: row.get(9)?,
                extract_status: row.get(10)?,
                extracted_text: row.get(11)?,
                extracted_text_chars: row.get(12)?,
                error: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        },
    )
    .map_err(|e| format!("attachment not found: {e}"))
}

pub fn download_attachment(
    conn: &Connection,
    attachment_id: &str,
    app_data_dir: &std::path::Path,
) -> Result<FullEmailAttachmentRow, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.download_status == "downloaded" {
        return Ok(att);
    }
    let provider_att_id = att
        .provider_attachment_id
        .as_ref()
        .ok_or("attachment has no provider_attachment_id")?;
    let now = now_ms();
    conn.execute(
        "UPDATE email_attachments SET download_status = 'downloading', error = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, attachment_id],
    )
    .map_err(|e| e.to_string())?;

    let result = (|| -> Result<FullEmailAttachmentRow, String> {
        let token = refresh_gmail_token(conn, &att.account_id)?;
        let provider_message_id: String = conn
            .query_row(
                "SELECT provider_message_id FROM email_messages WHERE id = ?1",
                params![att.message_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("failed to look up provider_message_id: {e}"))?;
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/attachments/{}",
            provider_message_id, provider_att_id
        );
        let value: Value = reqwest::blocking::Client::new()
            .get(&url)
            .bearer_auth(&token)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .map_err(|e| e.to_string())?;
        let data_b64 = value
            .get("data")
            .and_then(Value::as_str)
            .ok_or("Gmail attachment response missing data field")?;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(data_b64)
            .map_err(|e| format!("failed to decode attachment base64: {e}"))?;

        let dir = app_data_dir
            .join("email_attachments")
            .join(&att.account_id)
            .join(&att.message_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create attachment dir {:?}: {e}", dir))?;
        let safe_filename = att
            .filename
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let safe_name = format!("{}_{}", attachment_id, safe_filename);
        let file_path = dir.join(&safe_name);
        std::fs::write(&file_path, &bytes)
            .map_err(|e| format!("failed to write attachment {:?}: {e}", file_path))?;

        let local_path_str = file_path.to_string_lossy().to_string();
        let now = now_ms();
        conn.execute(
            "UPDATE email_attachments SET download_status = 'downloaded', local_path = ?1, error = NULL, updated_at = ?2 WHERE id = ?3",
            params![local_path_str, now, attachment_id],
        )
        .map_err(|e| e.to_string())?;

        get_attachment_row(conn, attachment_id)
    })();

    match result {
        Ok(row) => Ok(row),
        Err(err) => {
            let now = now_ms();
            let _ = conn.execute(
                "UPDATE email_attachments SET download_status = 'failed', error = ?1, updated_at = ?2 WHERE id = ?3",
                params![err, now, attachment_id],
            );
            Err(err)
        }
    }
}

pub fn extract_attachment_text(
    conn: &Connection,
    attachment_id: &str,
) -> Result<FullEmailAttachmentRow, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.extract_status == "extracted" {
        return Ok(att);
    }
    if att.download_status != "downloaded" {
        return Err("attachment must be downloaded before extraction".into());
    }
    let local_path = att.local_path.as_ref().ok_or("attachment has no local_path")?;
    let now = now_ms();
    conn.execute(
        "UPDATE email_attachments SET extract_status = 'extracting', error = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, attachment_id],
    )
    .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(String, i64), String> {
        let mime = att.mime_type.to_lowercase();
        let path = std::path::Path::new(local_path);

        let text = if mime.starts_with("text/")
            || mime == "application/json"
            || mime == "application/xml"
            || mime == "application/javascript"
            || mime == "application/csv"
            || mime.ends_with("+xml")
            || mime.ends_with("+json")
        {
            std::fs::read_to_string(path)
                .map_err(|e| format!("failed to read text file: {e}"))?
        } else if mime == "application/pdf" {
            pdf_extract::extract_text(path)
                .map_err(|e| format!("PDF extraction failed: {e}"))?
        } else if mime
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            || att.filename.to_lowercase().ends_with(".docx")
        {
            extract_docx_text(path)?
        } else if mime
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            || att.filename.to_lowercase().ends_with(".xlsx")
        {
            extract_xlsx_text(path)?
        } else if mime == "text/csv" || att.filename.to_lowercase().ends_with(".csv") {
            std::fs::read_to_string(path)
                .map_err(|e| format!("failed to read CSV file: {e}"))?
        } else {
            return Err(format!("unsupported mime type: {mime}"));
        };

        let trimmed = text.trim().to_string();
        let chars = trimmed.chars().count() as i64;
        Ok((trimmed, chars))
    })();

    match result {
        Ok((text, chars)) => {
            let now = now_ms();
            conn.execute(
                "UPDATE email_attachments SET extract_status = 'extracted', extracted_text = ?1, extracted_text_chars = ?2, error = NULL, updated_at = ?3 WHERE id = ?4",
                params![text, chars, now, attachment_id],
            )
            .map_err(|e| e.to_string())?;
            get_attachment_row(conn, attachment_id)
        }
        Err(err) => {
            let status = if err.starts_with("unsupported mime type") {
                "unsupported"
            } else {
                "failed"
            };
            let now = now_ms();
            let _ = conn.execute(
                "UPDATE email_attachments SET extract_status = ?1, error = ?2, updated_at = ?3 WHERE id = ?4",
                params![status, err, now, attachment_id],
            );
            Err(err)
        }
    }
}

fn extract_docx_text(path: &std::path::Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open docx: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("failed to read docx zip: {e}"))?;
    let doc_xml = archive
        .by_name("word/document.xml")
        .map_err(|e| format!("docx missing word/document.xml: {e}"))?;
    let reader = std::io::BufReader::new(doc_xml);
    let mut xml_reader = quick_xml::Reader::from_reader(reader);
    let mut text = String::new();
    let mut buf = Vec::new();
    loop {
        match xml_reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Text(t)) => {
                let decoded = t.unescape().map_err(|e| e.to_string())?;
                text.push_str(&decoded);
                text.push(' ');
            }
            Ok(quick_xml::events::Event::End(ref e))
                if e.name().as_ref() == b"w:p" =>
            {
                text.push('\n');
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("docx xml parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }
    Ok(text)
}

fn extract_xlsx_text(path: &std::path::Path) -> Result<String, String> {
    use calamine::{open_workbook, Reader, Xlsx, Data};
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("failed to open xlsx: {e}"))?;
    let mut text = String::new();
    for sheet_name in workbook.sheet_names().to_owned() {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            text.push_str(&format!("[{sheet_name}]\n"));
            for row in range.rows() {
                for cell in row {
                    match cell {
                        Data::String(s) => text.push_str(s),
                        Data::Float(f) => text.push_str(&f.to_string()),
                        Data::Int(i) => text.push_str(&i.to_string()),
                        Data::Bool(b) => text.push_str(&b.to_string()),
                        Data::Empty => {}
                        _ => {}
                    }
                    text.push('\t');
                }
                text.push('\n');
            }
        }
    }
    Ok(text)
}

pub fn get_attachment_local_path(
    conn: &Connection,
    attachment_id: &str,
) -> Result<String, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.download_status != "downloaded" {
        return Err("attachment is not downloaded".into());
    }
    att.local_path.ok_or_else(|| "attachment has no local_path".into())
}

fn read_ai_job_row(row: &rusqlite::Row) -> Result<EmailAiJobRow, rusqlite::Error> {
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
        attempt_count: row.get(9)?,
        max_attempts: row.get(10)?,
        scheduled_at: row.get(11)?,
        started_at: row.get(12)?,
        finished_at: row.get(13)?,
        error: row.get(14)?,
        input_hash: row.get(15)?,
        created_at: row.get(16)?,
    })
}

fn read_ai_output_row(row: &rusqlite::Row) -> Result<EmailAiOutputRow, rusqlite::Error> {
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

const AI_JOB_COLUMNS: &str = "id, account_id, thread_id, message_id, attachment_id, task_type, priority, status, model_id, attempt_count, max_attempts, scheduled_at, started_at, finished_at, error, input_hash, created_at";

const AI_OUTPUT_COLUMNS: &str = "id, account_id, thread_id, message_id, attachment_id, task_type, model_id, prompt_version, source_message_ids_json, confidence, result_json, display_text, created_at, updated_at";

pub fn enqueue_ai_job(conn: &Connection, input: &EmailAiJobInput) -> Result<EmailAiJobRow, String> {
    let id = new_uuid_id("job");
    let now = now_ms();
    conn.execute(
        "INSERT INTO email_ai_jobs (id, account_id, thread_id, message_id, task_type, priority, status, model_id, scheduled_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8, ?8)",
        params![id, input.account_id, input.thread_id, input.message_id, input.task_type, input.priority, input.model_id, now],
    )
    .map_err(|e| e.to_string())?;
    get_ai_job(conn, &id)
}

pub fn enqueue_ai_jobs(conn: &Connection, inputs: &[EmailAiJobInput]) -> Result<Vec<EmailAiJobRow>, String> {
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

pub fn claim_next_ai_job(conn: &Connection, task_types: &[String]) -> Result<Option<EmailAiJobRow>, String> {
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

pub fn complete_ai_job(conn: &Connection, input: &EmailAiOutputInput) -> Result<EmailAiJobRow, String> {
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

pub fn fail_ai_job(conn: &Connection, job_id: &str, error: &str) -> Result<EmailAiJobRow, String> {
    let job = get_ai_job(conn, job_id)?;
    let now = now_ms();
    if job.attempt_count + 1 < job.max_attempts {
        // Re-queue for retry
        conn.execute(
            "UPDATE email_ai_jobs SET status = 'queued', error = ?1, attempt_count = attempt_count + 1, started_at = NULL, scheduled_at = ?2 WHERE id = ?3",
            params![error, now, job_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Permanently failed
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

pub fn list_ai_jobs(conn: &Connection, filter: &EmailAiJobFilter) -> Result<Vec<EmailAiJobRow>, String> {
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

pub fn list_ai_outputs(conn: &Connection, thread_id: &str) -> Result<Vec<EmailAiOutputRow>, String> {
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
pub fn get_ai_output_for_thread(conn: &Connection, thread_id: &str, task_type: &str) -> Result<Option<EmailAiOutputRow>, String> {
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

fn parse_address(raw: &str) -> (String, String) {
    if let Some((name, rest)) = raw.split_once('<') {
        let email = rest.trim_end_matches('>').trim().to_string();
        let name = name.trim().trim_matches('"').to_string();
        return (if name.is_empty() { email.clone() } else { name }, email);
    }
    (raw.to_string(), raw.to_string())
}

fn parse_address_list(raw: &str) -> Vec<EmailAddressRow> {
    raw.split(',')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let (name, email) = parse_address(trimmed);
            Some(EmailAddressRow { name, email })
        })
        .collect()
}

fn html_for_body_parse<'a>(body_html_raw: &'a str, sanitized_html: &'a str) -> &'a str {
    if !sanitized_html.is_empty() {
        sanitized_html
    } else {
        body_html_raw
    }
}

fn gmail_body_text(payload: &Value) -> String {
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

fn gmail_body_html(payload: &Value) -> String {
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

fn decode_gmail_data(data: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(data)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(data))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

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
    conn.execute(
        "DELETE FROM email_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_thread(conn: &Connection, thread_id: String) -> Result<EmailThreadRow, String> {
    let mut thread = conn.query_row("SELECT id, account_id, subject, last_message_at, is_read, is_archived, is_starred, labels_json FROM email_threads WHERE id = ?1", params![thread_id], |row| Ok(EmailThreadRow {
        id: row.get(0)?, account_id: row.get(1)?, subject: row.get(2)?, messages: Vec::new(), participants: Vec::new(), last_message_at: row.get(3)?, is_read: row.get::<_, i64>(4)? != 0, is_archived: row.get::<_, i64>(5)? != 0, is_starred: row.get::<_, i64>(6)? != 0, labels: parse_json_vec(row.get(7)?),
    })).map_err(|e| e.to_string())?;
    thread.messages = load_messages(conn, &thread.id)?;
    thread.participants = thread
        .messages
        .iter()
        .map(|m| m.from.name.clone())
        .collect();
    Ok(thread)
}

fn load_messages(conn: &Connection, thread_id: &str) -> Result<Vec<EmailMessageRow>, String> {
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

    // Reload and return the full message.
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

    let ids: Vec<String> = if folder_id == "unified" {
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
    Ok(threads)
}

fn query_strings<P: rusqlite::Params>(
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

fn query_inbox_thread_ids(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
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
    load_thread(conn, thread_id)
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
        sync_gmail_account(conn, draft.account_id.clone())?;
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

fn send_gmail_message(
    conn: &Connection,
    account_id: &str,
    from_email: &str,
    draft: &EmailDraftInput,
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

fn apply_gmail_thread_labels(
    conn: &Connection,
    account_id: &str,
    local_thread_id: &str,
    add: Vec<&str>,
    remove: Vec<&str>,
) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn load_fixture(name: &str) -> Value {
        let path = format!("{}/src/email/fixtures/{}.json", env!("CARGO_MANIFEST_DIR"), name);
        let data = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("failed to read fixture {path}: {e}"));
        serde_json::from_str(&data).unwrap_or_else(|e| panic!("failed to parse fixture {path}: {e}"))
    }

    #[test]
    fn new_id_uses_prefix_and_timestamp() {
        let id = new_id("acct");
        assert!(id.starts_with("acct-"));
        assert!(id.len() > 5);
    }

    #[test]
    fn new_uuid_id_uses_prefix_and_uuid() {
        let id = new_uuid_id("tag");
        assert!(id.starts_with("tag-"));
        let uuid_part = id.strip_prefix("tag-").unwrap();
        assert_eq!(uuid_part.len(), 36, "UUID should be 36 chars");
        assert_eq!(uuid_part.chars().filter(|c| *c == '-').count(), 4);
    }

    #[test]
    fn new_uuid_id_produces_unique_values() {
        let a = new_uuid_id("job");
        let b = new_uuid_id("job");
        assert_ne!(a, b);
    }

    #[test]
    fn gmail_body_text_extracts_plain_text_simple() {
        let msg = load_fixture("simple_text");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert_eq!(body, "Hey, just wanted to check in on the project timeline.");
    }

    #[test]
    fn gmail_body_text_extracts_plain_from_multipart() {
        let msg = load_fixture("multipart_html_text");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert_eq!(body, "Here is the quarterly report with some formatting.");
    }

    #[test]
    fn gmail_body_text_returns_empty_for_attachment_only() {
        let msg = load_fixture("with_attachment");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert_eq!(body, "Please find the attached spreadsheet.");
    }

    #[test]
    fn gmail_body_text_extracts_from_html_only_message() {
        let msg = load_fixture("outlook_reply");
        let payload = msg.get("payload").unwrap();
        // outlook_reply has only text/html body, no text/plain part
        let body = gmail_body_text(payload);
        assert!(body.is_empty(), "gmail_body_text only extracts text/plain, not text/html");
    }

    #[test]
    fn gmail_body_text_extracts_plain_text_gt_quotes() {
        let msg = load_fixture("plain_text_gt_quotes");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert!(body.contains("Agreed, we should ship it this week."));
        assert!(body.contains("> We are ready to ship."));
    }

    #[test]
    fn gmail_body_text_extracts_cjk_content() {
        let msg = load_fixture("cjk_attribution");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert!(body.contains("提案について確認しました"));
    }

    #[test]
    fn gmail_body_text_extracts_forwarded_message() {
        let msg = load_fixture("forwarded_message");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert!(body.contains("---------- Forwarded message ----------"));
        assert!(body.contains("We should use RESTful for the new API."));
    }

    #[test]
    fn decode_gmail_data_handles_base64url() {
        // "Hello World" in base64url without padding
        let encoded = "SGVsbG8gV29ybGQ";
        let decoded = decode_gmail_data(encoded);
        assert_eq!(decoded, "Hello World");
    }

    #[test]
    fn decode_gmail_data_handles_base64url_with_padding() {
        let encoded = "SGVsbG8gV29ybGQ=";
        let decoded = decode_gmail_data(encoded);
        assert_eq!(decoded, "Hello World");
    }

    #[test]
    fn decode_gmail_data_returns_empty_for_invalid() {
        let decoded = decode_gmail_data("!!!not-base64!!!");
        assert_eq!(decoded, "");
    }

    #[test]
    fn parse_address_extracts_name_and_email() {
        let (name, email) = parse_address("Alice Smith <alice@example.com>");
        assert_eq!(name, "Alice Smith");
        assert_eq!(email, "alice@example.com");
    }

    #[test]
    fn parse_address_handles_email_only() {
        let (name, email) = parse_address("bob@example.com");
        assert_eq!(name, "bob@example.com");
        assert_eq!(email, "bob@example.com");
    }

    #[test]
    fn parse_address_handles_quoted_name() {
        let (name, email) = parse_address("\"Carol D.\" <carol@example.com>");
        assert_eq!(name, "Carol D.");
        assert_eq!(email, "carol@example.com");
    }

    #[test]
    fn parse_address_list_splits_multiple() {
        let list = parse_address_list("alice@example.com, Bob <bob@example.com>");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].email, "alice@example.com");
        assert_eq!(list[1].name, "Bob");
        assert_eq!(list[1].email, "bob@example.com");
    }

    #[test]
    fn parse_address_list_handles_empty() {
        let list = parse_address_list("");
        assert!(list.is_empty());
    }

    #[test]
    fn fixture_simple_text_has_expected_labels() {
        let msg = load_fixture("simple_text");
        let labels: Vec<String> = msg
            .get("labelIds")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .map(|s| s.to_string())
            .collect();
        assert!(labels.contains(&"INBOX".to_string()));
        assert!(labels.contains(&"UNREAD".to_string()));
        assert!(labels.contains(&"CATEGORY_PERSONAL".to_string()));
    }

    #[test]
    fn fixture_system_labels_has_starred_and_important() {
        let msg = load_fixture("system_labels");
        let labels: Vec<String> = msg
            .get("labelIds")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .map(|s| s.to_string())
            .collect();
        assert!(labels.contains(&"STARRED".to_string()));
        assert!(labels.contains(&"IMPORTANT".to_string()));
    }

    #[test]
    fn fixture_custom_labels_has_user_label() {
        let msg = load_fixture("custom_labels");
        let labels: Vec<String> = msg
            .get("labelIds")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .map(|s| s.to_string())
            .collect();
        assert!(labels.contains(&"Label_42".to_string()));
        assert!(labels.contains(&"CATEGORY_UPDATES".to_string()));
    }

    #[test]
    fn fixture_with_attachment_has_attachment_part() {
        let msg = load_fixture("with_attachment");
        let parts = msg
            .pointer("/payload/parts")
            .and_then(Value::as_array)
            .unwrap();
        let att_part = parts
            .iter()
            .find(|p| {
                p.get("mimeType")
                    .and_then(Value::as_str)
                    .map(|m| m.starts_with("application/"))
                    .unwrap_or(false)
            })
            .expect("should have attachment part");
        assert_eq!(
            att_part.get("filename").and_then(Value::as_str).unwrap(),
            "budget_2024.xlsx"
        );
        assert!(att_part.get("body").unwrap().get("attachmentId").is_some());
    }

    // ── Gmail quoted reply fixture ────────────────────────────────────────

    #[test]
    fn gmail_body_text_extracts_gmail_quoted_reply() {
        let msg = load_fixture("gmail_quoted_reply");
        let payload = msg.get("payload").unwrap();
        let body = gmail_body_text(payload);
        assert!(body.contains("Sounds good, let me evaluate the draft."));
        assert!(body.contains("We should meet next week"));
    }

    #[test]
    fn fixture_gmail_quoted_reply_has_html_part() {
        let msg = load_fixture("gmail_quoted_reply");
        let parts = msg
            .pointer("/payload/parts")
            .and_then(Value::as_array)
            .unwrap();
        let html_part = parts
            .iter()
            .find(|p| {
                p.get("mimeType")
                    .and_then(Value::as_str)
                    .map(|m| m == "text/html")
                    .unwrap_or(false)
            })
            .expect("should have text/html part");
        let data = html_part
            .pointer("/body/data")
            .and_then(Value::as_str)
            .unwrap();
        let decoded = decode_gmail_data(data);
        assert!(decoded.contains("gmail_quote"), "HTML should contain Gmail quote class");
    }

    // ── Nested blockquotes fixture ────────────────────────────────────────

    #[test]
    fn gmail_body_text_extracts_nested_blockquotes() {
        let msg = load_fixture("nested_blockquotes");
        let payload = msg.get("payload").unwrap();
        // nested_blockquotes is text/html only — gmail_body_text extracts text/plain
        let body = gmail_body_text(payload);
        assert!(body.is_empty(), "nested_blockquotes is html-only, plain text extractor returns empty");
    }

    #[test]
    fn fixture_nested_blockquotes_has_nested_structure() {
        let msg = load_fixture("nested_blockquotes");
        let body_data = msg
            .pointer("/payload/body/data")
            .and_then(Value::as_str)
            .unwrap();
        let decoded = decode_gmail_data(body_data);
        assert!(decoded.contains("<blockquote"), "should contain blockquote elements");
        // Count nested blockquotes — the fixture has 3 levels
        let bq_count = decoded.matches("<blockquote").count();
        assert!(bq_count >= 2, "should have at least 2 nested blockquotes, got {bq_count}");
    }

    // ── run_migrations tests ──────────────────────────────────────────────

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("create in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
        .expect("set pragmas");
        conn
    }

    #[test]
    fn migrations_creates_all_base_tables() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let tables: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(tables.contains(&"email_accounts".to_string()));
        assert!(tables.contains(&"email_threads".to_string()));
        assert!(tables.contains(&"email_messages".to_string()));
        assert!(tables.contains(&"email_drafts".to_string()));
        assert!(tables.contains(&"email_oauth_config".to_string()));
        assert!(tables.contains(&"email_account_tokens".to_string()));
        assert!(tables.contains(&"email_ai_settings".to_string()));
        assert!(tables.contains(&"_schema_migrations".to_string()));
    }

    #[test]
    fn migrations_sets_schema_version() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let version: i64 = conn
            .query_row(
                "SELECT version FROM _schema_migrations WHERE module = 'email'",
                [],
                |row| row.get(0),
            )
            .expect("should have email version row");
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn migrations_creates_phase1_prep_columns() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        // Verify Phase 1 prep columns exist on email_accounts
        let columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(email_accounts)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(columns.contains(&"sync_status".to_string()));
        assert!(columns.contains(&"last_sync_at".to_string()));
        assert!(columns.contains(&"sync_cursor".to_string()));
        assert!(columns.contains(&"ai_enabled".to_string()));
        assert!(columns.contains(&"settings_json".to_string()));
    }

    #[test]
    fn migrations_creates_phase2_prep_columns() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(email_messages)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(columns.contains(&"provider_message_id".to_string()));
        assert!(columns.contains(&"provider_thread_id".to_string()));
        assert!(columns.contains(&"headers_json".to_string()));
        assert!(columns.contains(&"body_text".to_string()));
        assert!(columns.contains(&"body_html".to_string()));
        assert!(columns.contains(&"sanitized_html".to_string()));
        assert!(columns.contains(&"body_parse_status".to_string()));
        assert!(columns.contains(&"parsed_parts_json".to_string()));
        assert!(columns.contains(&"raw_payload_json".to_string()));
        assert!(columns.contains(&"updated_at".to_string()));
    }

    #[test]
    fn migrations_is_idempotent() {
        let conn = open_test_db();
        run_migrations(&conn).expect("first migration should succeed");
        run_migrations(&conn).expect("second migration should also succeed (idempotent)");

        let version: i64 = conn
            .query_row(
                "SELECT version FROM _schema_migrations WHERE module = 'email'",
                [],
                |row| row.get(0),
            )
            .expect("should have email version row");
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn migrations_does_not_seed_ai_settings() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM email_ai_settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0, "run_migrations should not seed AI settings — frontend Zustand is source of truth");
    }

    #[test]
    fn ai_settings_global_scope_uses_empty_sentinel() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        // Insert a global row using the '' sentinel
        conn.execute(
            "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', '', '{}', 0)",
            [],
        )
        .expect("insert global row");

        // Inserting a second ('global', '') should fail due to PK constraint
        let result = conn.execute(
            "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', '', '{}', 0)",
            [],
        );
        assert!(result.is_err(), "duplicate (scope, account_id) should violate PRIMARY KEY");

        // But ('global', 'some-account') should succeed
        conn.execute(
            "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', 'acct-123', '{}', 0)",
            [],
        )
        .expect("insert account-scoped row should succeed");
    }

    #[test]
    fn invalid_grant_response_is_detected_from_google_body() {
        assert!(is_invalid_grant_response(
            r#"{ "error": "invalid_grant", "error_description": "Token has been expired or revoked." }"#
        ));
        assert!(!is_invalid_grant_response(
            r#"{ "error": "temporarily_unavailable" }"#
        ));
        assert!(!is_invalid_grant_response("not json"));
    }

    #[test]
    fn disconnect_gmail_account_for_reauth_marks_account_and_removes_token() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('acct-1', 'Test', 'test@example.com', 'gmail', 'connected', 0)",
            [],
        )
        .expect("insert account");
        conn.execute(
            "INSERT INTO email_account_tokens (account_id, access_token, refresh_token, expires_at) VALUES ('acct-1', 'access', 'refresh', 0)",
            [],
        )
        .expect("insert token");

        disconnect_gmail_account_for_reauth(&conn, "acct-1").expect("disconnect account");

        let (status, sync_status): (String, String) = conn
            .query_row(
                "SELECT status, sync_status FROM email_accounts WHERE id = 'acct-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read account");
        assert_eq!(status, "disconnected");
        assert_eq!(sync_status, "error");

        let token_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM email_account_tokens WHERE account_id = 'acct-1'",
                [],
                |row| row.get(0),
            )
            .expect("count tokens");
        assert_eq!(token_count, 0);
    }

    #[test]
    fn add_column_if_missing_adds_new_column() {
        let conn = open_test_db();
        conn.execute_batch("CREATE TABLE test_table (id TEXT PRIMARY KEY)")
            .unwrap();

        add_column_if_missing(&conn, "test_table", "name", "TEXT NOT NULL DEFAULT ''")
            .expect("should add column");

        let columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(test_table)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert!(columns.contains(&"name".to_string()));
    }

    #[test]
    fn add_column_if_missing_is_idempotent() {
        let conn = open_test_db();
        conn.execute_batch("CREATE TABLE test_table (id TEXT PRIMARY KEY)")
            .unwrap();

        add_column_if_missing(&conn, "test_table", "name", "TEXT NOT NULL DEFAULT ''")
            .expect("first add should succeed");
        add_column_if_missing(&conn, "test_table", "name", "TEXT NOT NULL DEFAULT ''")
            .expect("second add should be a no-op");
    }

    // ── Phase 1: migration v2 tests ─────────────────────────────────────

    #[test]
    fn migrations_v2_creates_folder_tables() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let tables: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(tables.contains(&"email_folders".to_string()));
        assert!(tables.contains(&"email_thread_folders".to_string()));
        assert!(tables.contains(&"email_attachments".to_string()));
    }

    #[test]
    fn migrations_v2_adds_thread_labels_json() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(email_threads)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(columns.contains(&"labels_json".to_string()));
    }

    #[test]
    fn migrations_v2_creates_folder_indexes() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let indexes: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_email%'")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(indexes.contains(&"idx_email_folders_account_provider".to_string()));
        assert!(indexes.contains(&"idx_email_folders_account_kind".to_string()));
        assert!(indexes.contains(&"idx_email_thread_folders_folder".to_string()));
        assert!(indexes.contains(&"idx_email_attachments_message".to_string()));
    }

    #[test]
    fn migrations_v2_is_idempotent() {
        let conn = open_test_db();
        run_migrations(&conn).expect("first migration");
        run_migrations(&conn).expect("second migration (idempotent)");

        let version: i64 = conn
            .query_row(
                "SELECT version FROM _schema_migrations WHERE module = 'email'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn gmail_label_kind_mapping() {
        assert_eq!(gmail_label_kind("INBOX"), ("inbox", "system", true));
        assert_eq!(gmail_label_kind("SENT"), ("sent", "system", true));
        assert_eq!(gmail_label_kind("DRAFTS"), ("drafts", "system", true));
        assert_eq!(gmail_label_kind("TRASH"), ("trash", "system", true));
        assert_eq!(gmail_label_kind("SPAM"), ("spam", "system", true));
        assert_eq!(gmail_label_kind("STARRED"), ("starred", "system", true));
        assert_eq!(gmail_label_kind("IMPORTANT"), ("important", "system", true));
        assert_eq!(gmail_label_kind("CATEGORY_PERSONAL"), ("category", "system", true));
        assert_eq!(gmail_label_kind("CATEGORY_SOCIAL"), ("category", "system", true));
        assert_eq!(gmail_label_kind("Label_42"), ("custom", "user", true));
        assert_eq!(gmail_label_kind("UNREAD"), ("unread", "system", false));
        assert_eq!(gmail_label_kind("CUSTOM_THING"), ("unknown", "user", true));
    }

    #[test]
    fn folder_upsert_creates_and_updates() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        // Create a test account.
        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('acct-1', 'Test', 'test@example.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();

        // Insert a folder.
        conn.execute(
            "INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at)
             VALUES ('folder-1', 'acct-1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 5, 20, 0, 0)",
            [],
        ).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM email_folders WHERE account_id = 'acct-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Upsert with updated counts.
        conn.execute(
            "INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at)
             VALUES ('folder-1', 'acct-1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 3, 25, 0, 1)
             ON CONFLICT(account_id, provider_id) DO UPDATE SET unread_count = excluded.unread_count, total_count = excluded.total_count, updated_at = excluded.updated_at",
            [],
        ).unwrap();

        let (unread, total): (i64, i64) = conn
            .query_row("SELECT unread_count, total_count FROM email_folders WHERE account_id = 'acct-1' AND provider_id = 'INBOX'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(unread, 3);
        assert_eq!(total, 25);
    }

    #[test]
    fn thread_folder_join_basic() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        // Create account, folder, thread, and join.
        conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('acct-1', 'T', 't@e.com', 'gmail', 'connected', 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f-inbox', 'acct-1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f-sent', 'acct-1', 'SENT', 'Sent', 'sent', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t-1', 'acct-1', 'Hello', 100, '[\"inbox\"]')", []).unwrap();
        conn.execute("INSERT INTO email_thread_folders (thread_id, folder_id) VALUES ('t-1', 'f-inbox')", []).unwrap();

        // Verify join exists.
        let folder_id: String = conn
            .query_row("SELECT folder_id FROM email_thread_folders WHERE thread_id = 't-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(folder_id, "f-inbox");

        // Verify query by folder.
        let thread_ids: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT t.id FROM email_threads t JOIN email_thread_folders tf ON tf.thread_id = t.id WHERE tf.folder_id = 'f-inbox'"
            ).unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert_eq!(thread_ids, vec!["t-1".to_string()]);
    }

    #[test]
    fn account_isolation_folders() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
        conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a2', 'B', 'b@e.com', 'gmail', 'connected', 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f1', 'a1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f2', 'a2', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();

        let folders_a1 = list_folders(&conn, Some("a1".into())).unwrap();
        let folders_a2 = list_folders(&conn, Some("a2".into())).unwrap();
        assert_eq!(folders_a1.len(), 1);
        assert_eq!(folders_a1[0].account_id, "a1");
        assert_eq!(folders_a2.len(), 1);
        assert_eq!(folders_a2[0].account_id, "a2");

        let all_folders = list_folders(&conn, None).unwrap();
        assert_eq!(all_folders.len(), 2);
    }

    #[test]
    fn account_isolation_thread_folders() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
        conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a2', 'B', 'b@e.com', 'gmail', 'connected', 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f1', 'a1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f2', 'a2', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Thread 1', 100, '[\"inbox\"]')", []).unwrap();
        conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t2', 'a2', 'Thread 2', 200, '[\"inbox\"]')", []).unwrap();
        conn.execute("INSERT INTO email_thread_folders (thread_id, folder_id) VALUES ('t1', 'f1')", []).unwrap();
        conn.execute("INSERT INTO email_thread_folders (thread_id, folder_id) VALUES ('t2', 'f2')", []).unwrap();

        // Query threads in folder f1 should only return t1.
        let ids = query_strings(&conn, "SELECT t.id FROM email_threads t JOIN email_thread_folders tf ON tf.thread_id = t.id WHERE tf.folder_id = 'f1'", []).unwrap();
        assert_eq!(ids, vec!["t1".to_string()]);

        // Query threads in folder f2 should only return t2.
        let ids = query_strings(&conn, "SELECT t.id FROM email_threads t JOIN email_thread_folders tf ON tf.thread_id = t.id WHERE tf.folder_id = 'f2'", []).unwrap();
        assert_eq!(ids, vec!["t2".to_string()]);
    }

    #[test]
    fn gmail_attachment_metadata_extracts_parts() {
        let msg = load_fixture("with_attachment");
        let payload = msg.get("payload").unwrap();
        let attachments = gmail_attachment_metadata(payload);
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].filename, "budget_2024.xlsx");
        assert_eq!(attachments[0].size, 24576);
        assert!(attachments[0].mime_type.contains("spreadsheet"));
    }

    #[test]
    fn gmail_attachment_metadata_empty_for_text_only() {
        let msg = load_fixture("simple_text");
        let payload = msg.get("payload").unwrap();
        let attachments = gmail_attachment_metadata(payload);
        assert!(attachments.is_empty());
    }

    #[test]
    fn migrations_v3_creates_attachment_dedup_index() {
        let conn = open_test_db();
        run_migrations(&conn).expect("migrations should succeed");

        let indexes: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_email_attachments%'")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert!(indexes.contains(&"idx_email_attachments_msg_provider".to_string()));
    }

    #[test]
    fn migrations_v3_normalizes_lowercase_labels_to_folder_casing() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at)
             VALUES ('f-custom', 'a1', 'Label_42', 'My Label', 'custom', 'user', 0, 1, 0, 0, 0, 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json)
             VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[\"label_42\", \"inbox\"]', '[]')",
            [],
        ).unwrap();

        rebuild_thread_labels_and_folders(&conn).unwrap();

        let labels_json: String = conn
            .query_row("SELECT labels_json FROM email_messages WHERE id = 'm1'", [], |r| r.get(0))
            .unwrap();
        assert!(labels_json.contains("Label_42"), "expected canonical label casing, got {labels_json}");
        assert!(labels_json.contains("inbox") || labels_json.contains("INBOX"));

        let join_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM email_thread_folders tf
                 JOIN email_folders f ON f.id = tf.folder_id
                 WHERE tf.thread_id = 't1' AND f.provider_id = 'Label_42'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(join_count, 1);
    }

    #[test]
    fn attachment_upsert_is_idempotent() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json)
             VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')",
            [],
        ).unwrap();

        for _ in 0..2 {
            conn.execute(
                "INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at)
                 VALUES ('att-1', 'a1', 't1', 'm1', 'prov-att-1', 'file.pdf', 'application/pdf', 100, 'metadata', 'not_started', 0, 0)
                 ON CONFLICT(message_id, provider_attachment_id) DO UPDATE SET
                   filename = excluded.filename, size = excluded.size, updated_at = excluded.updated_at",
                [],
            ).unwrap();
        }

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM email_attachments WHERE message_id = 'm1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn list_threads_inbox_falls_back_without_folder_joins() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, is_archived, labels_json) VALUES ('t1', 'a1', 'Hello', 100, 0, '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, is_archived, labels_json) VALUES ('t2', 'a1', 'Archived', 50, 1, '[]')",
            [],
        ).unwrap();

        let ids = query_inbox_thread_ids(&conn, "a1").unwrap();
        assert_eq!(ids, vec!["t1".to_string()]);
    }

    fn setup_attachment_test_data(conn: &Connection) {
        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json)
             VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at)
             VALUES ('att-1', 'a1', 't1', 'm1', 'prov-1', 'report.pdf', 'application/pdf', 1024, 'metadata', 'not_started', 0, 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at)
             VALUES ('att-2', 'a1', 't1', 'm1', 'prov-2', 'notes.txt', 'text/plain', 512, 'downloaded', 'not_started', 0, 0)",
            [],
        ).unwrap();
    }

    #[test]
    fn list_attachments_returns_all_for_message() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_attachment_test_data(&conn);

        let atts = list_attachments(&conn, "m1").unwrap();
        assert_eq!(atts.len(), 2);
        assert_eq!(atts[0].filename, "notes.txt");
        assert_eq!(atts[1].filename, "report.pdf");
    }

    #[test]
    fn list_attachments_returns_empty_for_unknown_message() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        let atts = list_attachments(&conn, "nonexistent").unwrap();
        assert!(atts.is_empty());
    }

    #[test]
    fn get_attachment_local_path_requires_downloaded() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_attachment_test_data(&conn);

        let err = get_attachment_local_path(&conn, "att-1").unwrap_err();
        assert!(err.contains("not downloaded"));

        let err = get_attachment_local_path(&conn, "att-2").unwrap_err();
        assert!(err.contains("no local_path"));
    }

    #[test]
    fn extract_attachment_text_requires_downloaded() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_attachment_test_data(&conn);

        let err = extract_attachment_text(&conn, "att-1").unwrap_err();
        assert!(err.contains("must be downloaded"));
    }

    #[test]
    fn attachment_full_row_fields() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_attachment_test_data(&conn);

        let atts = list_attachments(&conn, "m1").unwrap();
        let pdf = atts.iter().find(|a| a.filename == "report.pdf").unwrap();
        assert_eq!(pdf.id, "att-1");
        assert_eq!(pdf.account_id, "a1");
        assert_eq!(pdf.thread_id, "t1");
        assert_eq!(pdf.message_id, "m1");
        assert_eq!(pdf.provider_attachment_id, Some("prov-1".to_string()));
        assert_eq!(pdf.mime_type, "application/pdf");
        assert_eq!(pdf.size, 1024);
        assert_eq!(pdf.download_status, "metadata");
        assert_eq!(pdf.extract_status, "not_started");
        assert!(pdf.local_path.is_none());
        assert!(pdf.extracted_text.is_none());
        assert_eq!(pdf.extracted_text_chars, 0);
        assert!(pdf.error.is_none());
    }

    fn setup_ai_test_data(conn: &Connection) {
        conn.execute(
            "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json)
             VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')",
            [],
        ).unwrap();
    }

    #[test]
    fn enqueue_and_claim_ai_job() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        let input = EmailAiJobInput {
            account_id: "a1".into(),
            thread_id: Some("t1".into()),
            message_id: Some("m1".into()),
            task_type: "thread_summary".into(),
            priority: 2,
            model_id: None,
        };
        let job = enqueue_ai_job(&conn, &input).unwrap();
        assert_eq!(job.status, "queued");
        assert_eq!(job.priority, 2);

        let claimed = claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap().unwrap();
        assert_eq!(claimed.id, job.id);
        assert_eq!(claimed.status, "running");
        assert!(claimed.started_at.is_some());
    }

    #[test]
    fn claim_respects_priority() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "thread_summary".into(), priority: 3, model_id: None,
        }).unwrap();
        let high = enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "thread_summary".into(), priority: 1, model_id: None,
        }).unwrap();

        let claimed = claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap().unwrap();
        assert_eq!(claimed.id, high.id);
    }

    #[test]
    fn complete_ai_job_writes_output() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        let job = enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: Some("m1".into()),
            task_type: "thread_summary".into(), priority: 2, model_id: None,
        }).unwrap();
        claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap();

        let completed = complete_ai_job(&conn, &EmailAiOutputInput {
            job_id: job.id.clone(),
            model_id: "test-model".into(),
            prompt_version: "1.0.0".into(),
            source_message_ids_json: Some("[\"m1\"]".into()),
            confidence: Some(0.9),
            result_json: "{\"shortSummary\":\"test\"}".into(),
            display_text: "Test summary".into(),
        }).unwrap();
        assert_eq!(completed.status, "completed");

        let outputs = list_ai_outputs(&conn, "t1").unwrap();
        assert_eq!(outputs.len(), 1);
        assert_eq!(outputs[0].task_type, "thread_summary");
        assert_eq!(outputs[0].display_text, "Test summary");
    }

    #[test]
    fn fail_ai_job_increments_attempt() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        let job = enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "spam_score".into(), priority: 2, model_id: None,
        }).unwrap();
        assert_eq!(job.max_attempts, 3);
        claim_next_ai_job(&conn, &["spam_score".into()]).unwrap();

        // First failure: re-queued (attempt 1 < max_attempts 3)
        let retried = fail_ai_job(&conn, &job.id, "model error").unwrap();
        assert_eq!(retried.status, "queued");
        assert_eq!(retried.attempt_count, 1);
        assert_eq!(retried.error.as_deref(), Some("model error"));

        // Claim again and fail again
        claim_next_ai_job(&conn, &["spam_score".into()]).unwrap();
        let retried2 = fail_ai_job(&conn, &job.id, "model error 2").unwrap();
        assert_eq!(retried2.status, "queued");
        assert_eq!(retried2.attempt_count, 2);

        // Third failure: permanently failed (attempt 3 == max_attempts 3)
        claim_next_ai_job(&conn, &["spam_score".into()]).unwrap();
        let failed = fail_ai_job(&conn, &job.id, "model error 3").unwrap();
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.attempt_count, 3);
    }

    #[test]
    fn cancel_ai_job_transitions_status() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        let job = enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "urgency_score".into(), priority: 2, model_id: None,
        }).unwrap();

        cancel_ai_job(&conn, &job.id).unwrap();
        let cancelled = get_ai_job(&conn, &job.id).unwrap();
        assert_eq!(cancelled.status, "cancelled");
    }

    #[test]
    fn get_unprocessed_thread_ids_excludes_processed() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        // t1 has no output yet -> should appear.
        let ids = get_unprocessed_thread_ids(&conn, "a1", "thread_summary").unwrap();
        assert_eq!(ids, vec!["t1"]);

        // Enqueue a job -> should be excluded (already queued).
        enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "thread_summary".into(), priority: 2, model_id: None,
        }).unwrap();
        let ids = get_unprocessed_thread_ids(&conn, "a1", "thread_summary").unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn claim_returns_none_when_no_queued_jobs() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();

        let result = claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn claim_skips_wrong_task_type() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
            task_type: "spam_score".into(), priority: 2, model_id: None,
        }).unwrap();

        let result = claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_ai_output_for_thread_returns_latest() {
        let conn = open_test_db();
        run_migrations(&conn).unwrap();
        setup_ai_test_data(&conn);

        let job = enqueue_ai_job(&conn, &EmailAiJobInput {
            account_id: "a1".into(), thread_id: Some("t1".into()), message_id: Some("m1".into()),
            task_type: "thread_summary".into(), priority: 2, model_id: None,
        }).unwrap();
        claim_next_ai_job(&conn, &["thread_summary".into()]).unwrap();
        complete_ai_job(&conn, &EmailAiOutputInput {
            job_id: job.id,
            model_id: "model".into(),
            prompt_version: "1.0.0".into(),
            source_message_ids_json: None,
            confidence: None,
            result_json: "{}".into(),
            display_text: "first".into(),
        }).unwrap();

        let output = get_ai_output_for_thread(&conn, "t1", "thread_summary").unwrap();
        assert!(output.is_some());
        assert_eq!(output.unwrap().display_text, "first");

        let none = get_ai_output_for_thread(&conn, "t1", "spam_score").unwrap();
        assert!(none.is_none());
    }
}
