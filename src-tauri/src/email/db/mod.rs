mod types;
mod helpers;
mod accounts;
mod gmail;
mod threads;
mod attachments;
mod ai_jobs;
mod ai_drafts;
mod tags;
mod smart_views;

pub use types::*;

use parking_lot::Mutex;
use rusqlite::Connection;
use std::sync::Arc;

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

        add_column_if_missing(conn, "email_accounts", "sync_status", "TEXT NOT NULL DEFAULT 'idle'")?;
        add_column_if_missing(conn, "email_accounts", "last_sync_at", "INTEGER")?;
        add_column_if_missing(conn, "email_accounts", "sync_cursor", "TEXT")?;
        add_column_if_missing(conn, "email_accounts", "ai_enabled", "INTEGER NOT NULL DEFAULT 1")?;
        add_column_if_missing(conn, "email_accounts", "settings_json", "TEXT NOT NULL DEFAULT '{}'")?;

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

        add_column_if_missing(conn, "email_threads", "labels_json", "TEXT NOT NULL DEFAULT '[]'")?;

        conn.execute_batch(
            "UPDATE email_threads SET labels_json = (
                SELECT COALESCE(json_group_array(DISTINCT value), '[]')
                FROM email_messages, json_each(email_messages.labels_json)
                WHERE email_messages.thread_id = email_threads.id
            ) WHERE labels_json = '[]' OR labels_json IS NULL;"
        )
        .map_err(|e| format!("email: backfill thread labels_json failed: {e}"))?;

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
        conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_email_attachments_msg_provider
              ON email_attachments(message_id, provider_attachment_id);",
        )
        .map_err(|e| format!("email: schema v3 attachment index failed: {e}"))?;
        threads::rebuild_thread_labels_and_folders(conn)?;
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
                tone TEXT,
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

    if schema_version < 5 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS email_tags (
                id TEXT PRIMARY KEY,
                account_id TEXT,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                color TEXT,
                source TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tags_account_slug
                ON email_tags(account_id, slug);

            CREATE TABLE IF NOT EXISTS email_message_tags (
                message_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                source TEXT NOT NULL,
                confidence REAL,
                reason TEXT,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (message_id, tag_id),
                FOREIGN KEY(message_id) REFERENCES email_messages(id) ON DELETE CASCADE,
                FOREIGN KEY(tag_id) REFERENCES email_tags(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_email_message_tags_tag
                ON email_message_tags(tag_id);",
        )
        .map_err(|e| format!("email: schema v5 migration failed: {e}"))?;

        tags::seed_system_tags(conn)?;
    }

    if schema_version < 6 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS email_ai_drafts (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                message_id TEXT,
                model_id TEXT NOT NULL,
                tone TEXT NOT NULL DEFAULT 'concise',
                to_json TEXT NOT NULL,
                cc_json TEXT NOT NULL DEFAULT '[]',
                bcc_json TEXT NOT NULL DEFAULT '[]',
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'suggested',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
                FOREIGN KEY(thread_id) REFERENCES email_threads(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_email_ai_drafts_thread
                ON email_ai_drafts(thread_id, created_at);",
        )
        .map_err(|e| format!("email: schema v6 migration failed: {e}"))?;
    }

    conn.execute(
        "INSERT INTO _schema_migrations (module, version, applied_at) VALUES ('email', ?1, datetime('now'))
         ON CONFLICT(module) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at",
        [SCHEMA_VERSION],
    )
    .map_err(|e| format!("email: set schema version failed: {e}"))?;

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

// Re-export all public functions from submodules.
pub use accounts::{add_account, list_accounts, remove_account};
pub use ai_jobs::{
    cancel_ai_job, claim_next_ai_job, complete_ai_job, enqueue_ai_jobs,
    fail_ai_job, get_unprocessed_thread_ids, list_ai_jobs, list_ai_outputs,
};
pub use ai_drafts::{
    delete_ai_draft, list_ai_drafts, save_ai_draft, update_ai_draft_status,
};
pub use attachments::{
    download_attachment, extract_attachment_text, get_attachment_local_path, get_attachment_row,
    list_attachments,
};
pub use gmail::{
    configure_gmail_oauth, connect_gmail, connect_gmail_with_config, has_gmail_oauth_config,
    sync_all_gmail, sync_gmail_account,
};
pub use tags::{
    apply_tag_to_message, create_tag, delete_tag, list_message_tags, list_tags,
    remove_tag_from_message, update_tag, upsert_ai_tags,
};
pub use threads::{
    archive_thread, get_thread, list_folders, list_threads, reparse_message, save_draft,
    send_message, set_read,
};

#[cfg(test)]
mod tests;
