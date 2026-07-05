use super::*;
use rusqlite::params;
use serde_json::Value;

use super::ai_jobs::{
    cancel_ai_job, claim_next_ai_job, complete_ai_job, enqueue_ai_job, fail_ai_job, get_ai_job,
    get_ai_output_for_thread, list_ai_outputs,
};
use super::threads::{query_inbox_thread_ids, rebuild_thread_labels_and_folders, query_strings};

fn load_fixture(name: &str) -> Value {
    let path = format!("{}/src/email/fixtures/{}.json", env!("CARGO_MANIFEST_DIR"), name);
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {path}: {e}"));
    serde_json::from_str(&data).unwrap_or_else(|e| panic!("failed to parse fixture {path}: {e}"))
}

#[test]
fn new_id_uses_prefix_and_timestamp() {
    let id = helpers::new_id("acct");
    assert!(id.starts_with("acct-"));
    assert!(id.len() > 5);
}

#[test]
fn new_uuid_id_uses_prefix_and_uuid() {
    let id = helpers::new_uuid_id("tag");
    assert!(id.starts_with("tag-"));
    let uuid_part = id.strip_prefix("tag-").unwrap();
    assert_eq!(uuid_part.len(), 36, "UUID should be 36 chars");
    assert_eq!(uuid_part.chars().filter(|c| *c == '-').count(), 4);
}

#[test]
fn new_uuid_id_produces_unique_values() {
    let a = helpers::new_uuid_id("job");
    let b = helpers::new_uuid_id("job");
    assert_ne!(a, b);
}

#[test]
fn gmail_body_text_extracts_plain_text_simple() {
    let msg = load_fixture("simple_text");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert_eq!(body, "Hey, just wanted to check in on the project timeline.");
}

#[test]
fn gmail_body_text_extracts_plain_from_multipart() {
    let msg = load_fixture("multipart_html_text");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert_eq!(body, "Here is the quarterly report with some formatting.");
}

#[test]
fn gmail_body_text_returns_empty_for_attachment_only() {
    let msg = load_fixture("with_attachment");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert_eq!(body, "Please find the attached spreadsheet.");
}

#[test]
fn gmail_body_text_extracts_from_html_only_message() {
    let msg = load_fixture("outlook_reply");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert!(body.is_empty(), "gmail_body_text only extracts text/plain, not text/html");
}

#[test]
fn gmail_body_text_extracts_plain_text_gt_quotes() {
    let msg = load_fixture("plain_text_gt_quotes");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert!(body.contains("Agreed, we should ship it this week."));
    assert!(body.contains("> We are ready to ship."));
}

#[test]
fn gmail_body_text_extracts_cjk_content() {
    let msg = load_fixture("cjk_attribution");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert!(body.contains("提案について確認しました"));
}

#[test]
fn gmail_body_text_extracts_forwarded_message() {
    let msg = load_fixture("forwarded_message");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert!(body.contains("---------- Forwarded message ----------"));
    assert!(body.contains("We should use RESTful for the new API."));
}

#[test]
fn decode_gmail_data_handles_base64url() {
    let encoded = "SGVsbG8gV29ybGQ";
    let decoded = gmail::decode_gmail_data(encoded);
    assert_eq!(decoded, "Hello World");
}

#[test]
fn decode_gmail_data_handles_base64url_with_padding() {
    let encoded = "SGVsbG8gV29ybGQ=";
    let decoded = gmail::decode_gmail_data(encoded);
    assert_eq!(decoded, "Hello World");
}

#[test]
fn decode_gmail_data_returns_empty_for_invalid() {
    let decoded = gmail::decode_gmail_data("!!!not-base64!!!");
    assert_eq!(decoded, "");
}

#[test]
fn parse_address_extracts_name_and_email() {
    let (name, email) = gmail::parse_address("Alice Smith <alice@example.com>");
    assert_eq!(name, "Alice Smith");
    assert_eq!(email, "alice@example.com");
}

#[test]
fn parse_address_handles_email_only() {
    let (name, email) = gmail::parse_address("bob@example.com");
    assert_eq!(name, "bob@example.com");
    assert_eq!(email, "bob@example.com");
}

#[test]
fn parse_address_handles_quoted_name() {
    let (name, email) = gmail::parse_address("\"Carol D.\" <carol@example.com>");
    assert_eq!(name, "Carol D.");
    assert_eq!(email, "carol@example.com");
}

#[test]
fn parse_address_list_splits_multiple() {
    let list = gmail::parse_address_list("alice@example.com, Bob <bob@example.com>");
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].email, "alice@example.com");
    assert_eq!(list[1].name, "Bob");
    assert_eq!(list[1].email, "bob@example.com");
}

#[test]
fn parse_address_list_handles_empty() {
    let list = gmail::parse_address_list("");
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

#[test]
fn gmail_body_text_extracts_gmail_quoted_reply() {
    let msg = load_fixture("gmail_quoted_reply");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
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
    let decoded = gmail::decode_gmail_data(data);
    assert!(decoded.contains("gmail_quote"), "HTML should contain Gmail quote class");
}

#[test]
fn gmail_body_text_extracts_nested_blockquotes() {
    let msg = load_fixture("nested_blockquotes");
    let payload = msg.get("payload").unwrap();
    let body = gmail::gmail_body_text(payload);
    assert!(body.is_empty(), "nested_blockquotes is html-only, plain text extractor returns empty");
}

#[test]
fn fixture_nested_blockquotes_has_nested_structure() {
    let msg = load_fixture("nested_blockquotes");
    let body_data = msg
        .pointer("/payload/body/data")
        .and_then(Value::as_str)
        .unwrap();
    let decoded = gmail::decode_gmail_data(body_data);
    assert!(decoded.contains("<blockquote"), "should contain blockquote elements");
    let bq_count = decoded.matches("<blockquote").count();
    assert!(bq_count >= 2, "should have at least 2 nested blockquotes, got {bq_count}");
}

// ── run_migrations tests ──────────────────────────────────────────────

fn open_test_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().expect("create in-memory db");
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

    conn.execute(
        "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', '', '{}', 0)",
        [],
    )
    .expect("insert global row");

    let result = conn.execute(
        "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', '', '{}', 0)",
        [],
    );
    assert!(result.is_err(), "duplicate (scope, account_id) should violate PRIMARY KEY");

    conn.execute(
        "INSERT INTO email_ai_settings (scope, account_id, settings_json, updated_at) VALUES ('global', 'acct-123', '{}', 0)",
        [],
    )
    .expect("insert account-scoped row should succeed");
}

#[test]
fn invalid_grant_response_is_detected_from_google_body() {
    assert!(gmail::is_invalid_grant_response(
        r#"{ "error": "invalid_grant", "error_description": "Token has been expired or revoked." }"#
    ));
    assert!(!gmail::is_invalid_grant_response(
        r#"{ "error": "temporarily_unavailable" }"#
    ));
    assert!(!gmail::is_invalid_grant_response("not json"));
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

    gmail::disconnect_gmail_account_for_reauth(&conn, "acct-1").expect("disconnect account");

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
fn migrations_v7_adds_email_ai_jobs_tone_column() {
    let conn = open_test_db();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (
            module TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            applied_at TEXT NOT NULL
        );
        INSERT INTO _schema_migrations (module, version, applied_at)
        VALUES ('email', 6, datetime('now'));
        CREATE TABLE email_ai_jobs (
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
        );",
    )
    .expect("legacy v6 schema setup should succeed");

    run_migrations(&conn).expect("v7 migration should succeed");

    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(email_ai_jobs)").unwrap();
        stmt.query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };

    assert!(columns.contains(&"tone".to_string()));
}

#[test]
fn gmail_label_kind_mapping() {
    assert_eq!(gmail::gmail_label_kind("INBOX"), ("inbox", "system", true));
    assert_eq!(gmail::gmail_label_kind("SENT"), ("sent", "system", true));
    assert_eq!(gmail::gmail_label_kind("DRAFTS"), ("drafts", "system", true));
    assert_eq!(gmail::gmail_label_kind("TRASH"), ("trash", "system", true));
    assert_eq!(gmail::gmail_label_kind("SPAM"), ("spam", "system", true));
    assert_eq!(gmail::gmail_label_kind("STARRED"), ("starred", "system", true));
    assert_eq!(gmail::gmail_label_kind("IMPORTANT"), ("important", "system", true));
    assert_eq!(gmail::gmail_label_kind("CATEGORY_PERSONAL"), ("category", "system", true));
    assert_eq!(gmail::gmail_label_kind("CATEGORY_SOCIAL"), ("category", "system", true));
    assert_eq!(gmail::gmail_label_kind("Label_42"), ("custom", "user", true));
    assert_eq!(gmail::gmail_label_kind("UNREAD"), ("unread", "system", false));
    assert_eq!(gmail::gmail_label_kind("CUSTOM_THING"), ("unknown", "user", true));
}

#[test]
fn folder_upsert_creates_and_updates() {
    let conn = open_test_db();
    run_migrations(&conn).unwrap();

    conn.execute(
        "INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('acct-1', 'Test', 'test@example.com', 'gmail', 'connected', 0)",
        [],
    ).unwrap();

    conn.execute(
        "INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at)
         VALUES ('folder-1', 'acct-1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 5, 20, 0, 0)",
        [],
    ).unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM email_folders WHERE account_id = 'acct-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);

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

    conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('acct-1', 'T', 't@e.com', 'gmail', 'connected', 0)", []).unwrap();
    conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f-inbox', 'acct-1', 'INBOX', 'Inbox', 'inbox', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
    conn.execute("INSERT INTO email_folders (id, account_id, provider_id, name, kind, type, is_system, is_visible, unread_count, total_count, created_at, updated_at) VALUES ('f-sent', 'acct-1', 'SENT', 'Sent', 'sent', 'system', 1, 1, 0, 0, 0, 0)", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t-1', 'acct-1', 'Hello', 100, '[\"inbox\"]')", []).unwrap();
    conn.execute("INSERT INTO email_thread_folders (thread_id, folder_id) VALUES ('t-1', 'f-inbox')", []).unwrap();

    let folder_id: String = conn
        .query_row("SELECT folder_id FROM email_thread_folders WHERE thread_id = 't-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(folder_id, "f-inbox");

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

    let ids = query_strings(&conn, "SELECT t.id FROM email_threads t JOIN email_thread_folders tf ON tf.thread_id = t.id WHERE tf.folder_id = 'f1'", []).unwrap();
    assert_eq!(ids, vec!["t1".to_string()]);

    let ids = query_strings(&conn, "SELECT t.id FROM email_threads t JOIN email_thread_folders tf ON tf.thread_id = t.id WHERE tf.folder_id = 'f2'", []).unwrap();
    assert_eq!(ids, vec!["t2".to_string()]);
}

#[test]
fn gmail_attachment_metadata_extracts_parts() {
    let msg = load_fixture("with_attachment");
    let payload = msg.get("payload").unwrap();
    let attachments = gmail::gmail_attachment_metadata(payload);
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].filename, "budget_2024.xlsx");
    assert_eq!(attachments[0].size, 24576);
    assert!(attachments[0].mime_type.contains("spreadsheet"));
}

#[test]
fn gmail_attachment_metadata_empty_for_text_only() {
    let msg = load_fixture("simple_text");
    let payload = msg.get("payload").unwrap();
    let attachments = gmail::gmail_attachment_metadata(payload);
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

    conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')", []).unwrap();
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json) VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')", []).unwrap();

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

    conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, is_archived, labels_json) VALUES ('t1', 'a1', 'Hello', 100, 0, '[]')", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, is_archived, labels_json) VALUES ('t2', 'a1', 'Archived', 50, 1, '[]')", []).unwrap();

    let ids = query_inbox_thread_ids(&conn, "a1").unwrap();
    assert_eq!(ids, vec!["t1".to_string()]);
}

fn setup_attachment_test_data(conn: &rusqlite::Connection) {
    conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')", []).unwrap();
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json) VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')", []).unwrap();
    conn.execute("INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at) VALUES ('att-1', 'a1', 't1', 'm1', 'prov-1', 'report.pdf', 'application/pdf', 1024, 'metadata', 'not_started', 0, 0)", []).unwrap();
    conn.execute("INSERT INTO email_attachments (id, account_id, thread_id, message_id, provider_attachment_id, filename, mime_type, size, download_status, extract_status, created_at, updated_at) VALUES ('att-2', 'a1', 't1', 'm1', 'prov-2', 'notes.txt', 'text/plain', 512, 'downloaded', 'not_started', 0, 0)", []).unwrap();
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

fn setup_ai_test_data(conn: &rusqlite::Connection) {
    conn.execute("INSERT INTO email_accounts (id, name, email, provider, status, created_at) VALUES ('a1', 'A', 'a@e.com', 'gmail', 'connected', 0)", []).unwrap();
    conn.execute("INSERT INTO email_threads (id, account_id, subject, last_message_at, labels_json) VALUES ('t1', 'a1', 'Test', 100, '[]')", []).unwrap();
    conn.execute("INSERT INTO email_messages (id, thread_id, account_id, from_name, from_email, to_json, cc_json, subject, body, snippet, timestamp, labels_json, attachments_json) VALUES ('m1', 't1', 'a1', 'A', 'a@e.com', '[]', '[]', 'Test', 'body', 'snippet', 100, '[]', '[]')", []).unwrap();
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
        tone: None,
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
        task_type: "thread_summary".into(), priority: 3, model_id: None, tone: None,
    }).unwrap();
    let high = enqueue_ai_job(&conn, &EmailAiJobInput {
        account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
        task_type: "thread_summary".into(), priority: 1, model_id: None, tone: None,
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
        task_type: "thread_summary".into(), priority: 2, model_id: None, tone: None,
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
        task_type: "spam_score".into(), priority: 2, model_id: None, tone: None,
    }).unwrap();
    assert_eq!(job.max_attempts, 3);
    claim_next_ai_job(&conn, &["spam_score".into()]).unwrap();

    let retried = fail_ai_job(&conn, &job.id, "model error").unwrap();
    assert_eq!(retried.status, "queued");
    assert_eq!(retried.attempt_count, 1);
    assert_eq!(retried.error.as_deref(), Some("model error"));

    claim_next_ai_job(&conn, &["spam_score".into()]).unwrap();
    let retried2 = fail_ai_job(&conn, &job.id, "model error 2").unwrap();
    assert_eq!(retried2.status, "queued");
    assert_eq!(retried2.attempt_count, 2);

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
        task_type: "urgency_score".into(), priority: 2, model_id: None, tone: None,
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

    let ids = get_unprocessed_thread_ids(&conn, "a1", "thread_summary").unwrap();
    assert_eq!(ids, vec!["t1"]);

    enqueue_ai_job(&conn, &EmailAiJobInput {
        account_id: "a1".into(), thread_id: Some("t1".into()), message_id: None,
        task_type: "thread_summary".into(), priority: 2, model_id: None, tone: None,
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
        task_type: "spam_score".into(), priority: 2, model_id: None, tone: None,
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
        task_type: "thread_summary".into(), priority: 2, model_id: None, tone: None,
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

#[test]
fn schema_v5_creates_tag_tables() {
    let conn = open_test_db();
    run_migrations(&conn).unwrap();
    setup_ai_test_data(&conn);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM email_tags WHERE source = 'system'", [], |row| row.get(0))
        .unwrap();
    assert!(count > 0, "system tags should be seeded");

    let tag_id: String = conn.query_row("SELECT id FROM email_tags LIMIT 1", [], |row| row.get(0)).unwrap();
    conn.execute("INSERT INTO email_message_tags (message_id, tag_id, source, created_at) VALUES ('m1', ?1, 'user', 0)", params![tag_id]).unwrap();
    let mt_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM email_message_tags", [], |row| row.get(0))
        .unwrap();
    assert_eq!(mt_count, 1);
}

#[test]
fn tag_crud_operations() {
    let conn = open_test_db();
    run_migrations(&conn).unwrap();
    setup_ai_test_data(&conn);

    let tag = create_tag(&conn, &EmailCreateTagInput {
        account_id: Some("a1".into()),
        name: "Important".into(),
        color: Some("#ff0000".into()),
        source: "user".into(),
    }).unwrap();
    assert_eq!(tag.name, "Important");
    assert_eq!(tag.slug, "important");
    assert_eq!(tag.source, "user");

    let all_tags = list_tags(&conn, None).unwrap();
    assert!(all_tags.len() > 1);

    let account_tags = list_tags(&conn, Some("a1")).unwrap();
    assert!(account_tags.iter().any(|t| t.id == tag.id));

    let updated = update_tag(&conn, &EmailUpdateTagInput {
        tag_id: tag.id.clone(),
        name: Some("Very Important".into()),
        color: Some("#00ff00".into()),
    }).unwrap();
    assert_eq!(updated.name, "Very Important");
    assert_eq!(updated.color, Some("#00ff00".into()));

    apply_tag_to_message(&conn, &EmailApplyTagInput {
        message_id: "m1".into(),
        tag_id: tag.id.clone(),
        source: "user".into(),
        confidence: None,
        reason: None,
    }).unwrap();

    let msg_tags = list_message_tags(&conn, "m1").unwrap();
    assert_eq!(msg_tags.len(), 1);
    assert_eq!(msg_tags[0].id, tag.id);

    remove_tag_from_message(&conn, &EmailRemoveTagInput {
        message_id: "m1".into(),
        tag_id: tag.id.clone(),
    }).unwrap();
    let msg_tags = list_message_tags(&conn, "m1").unwrap();
    assert!(msg_tags.is_empty());

    delete_tag(&conn, &tag.id).unwrap();
    let all_tags = list_tags(&conn, None).unwrap();
    assert!(!all_tags.iter().any(|t| t.id == tag.id));
}
