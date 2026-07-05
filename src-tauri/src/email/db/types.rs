use serde::{Deserialize, Serialize};

pub struct EmailDb(pub parking_lot::Mutex<rusqlite::Connection>);

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_metadata: Option<EmailThreadAiMetadata>,
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
    pub tone: Option<String>,
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
    pub tone: Option<String>,
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

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiDraftRow {
    pub id: String,
    pub account_id: String,
    pub thread_id: String,
    pub message_id: Option<String>,
    pub model_id: String,
    pub tone: String,
    pub to_json: String,
    pub cc_json: String,
    pub bcc_json: String,
    pub subject: String,
    pub body: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailAiDraftGenerateInput {
    pub account_id: String,
    pub thread_id: String,
    pub tone: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailSaveAiDraftInput {
    pub job_id: String,
    pub account_id: String,
    pub thread_id: String,
    pub message_id: Option<String>,
    pub model_id: String,
    pub tone: String,
    pub to_json: String,
    pub cc_json: String,
    pub bcc_json: String,
    pub subject: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailTagRow {
    pub id: String,
    pub account_id: Option<String>,
    pub name: String,
    pub slug: String,
    pub color: Option<String>,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailCreateTagInput {
    pub account_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub source: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailUpdateTagInput {
    pub tag_id: String,
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailApplyTagInput {
    pub message_id: String,
    pub tag_id: String,
    pub source: String,
    pub confidence: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmailRemoveTagInput {
    pub message_id: String,
    pub tag_id: String,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EmailThreadAiMetadata {
    pub summary: Option<String>,
    pub urgency: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub needs_reply: Option<bool>,
    pub spam_score: Option<f64>,
    pub marketing_score: Option<f64>,
    pub newsletter: Option<bool>,
}

pub const SCHEMA_VERSION: i64 = 7;

pub const SCHEMA: &str = r#"
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
