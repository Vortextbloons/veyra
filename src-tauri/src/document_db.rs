use parking_lot::Mutex;
use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db_utils::parse_json_array;

pub struct DocumentDb(pub Mutex<Connection>);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRow {
    pub id: String,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub is_global: bool,
    pub title: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub status: String,
    pub editor_format: String,
    pub content_markdown: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_exported_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionRow {
    pub id: String,
    pub document_id: String,
    pub version_number: i64,
    pub content_markdown: String,
    pub change_source: String,
    pub change_summary: Option<String>,
    pub source_conversation_id: Option<String>,
    pub source_message_id: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCreateInput {
    pub id: String,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub is_global: Option<bool>,
    pub title: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub status: String,
    pub editor_format: Option<String>,
    pub content_markdown: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
    pub last_exported_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUpdateInput {
    pub id: String,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub is_global: Option<bool>,
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub doc_type: Option<String>,
    pub status: Option<String>,
    pub editor_format: Option<String>,
    pub content_markdown: Option<String>,
    pub tags: Option<Vec<String>>,
    pub updated_at: Option<String>,
    pub last_exported_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionCreateInput {
    pub id: String,
    pub document_id: String,
    pub content_markdown: String,
    pub change_source: String,
    pub change_summary: Option<String>,
    pub source_conversation_id: Option<String>,
    pub source_message_id: Option<String>,
    pub created_at: String,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  conversation_id TEXT,
  is_global INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  editor_format TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_exported_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_conversation ON documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  change_source TEXT NOT NULL,
  change_summary TEXT,
  source_conversation_id TEXT,
  source_message_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_number ON document_versions(document_id, version_number);
CREATE INDEX IF NOT EXISTS idx_document_versions_created ON document_versions(created_at);
"#;

const MAX_DOCUMENT_BYTES: usize = 5 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 240;
const MAX_TAGS: usize = 50;

fn validate_document_type(value: &str) -> Result<(), String> {
    match value {
        "document" | "technical_spec" | "essay" | "report" | "proposal" | "readme" | "notes"
        | "prompt" | "project_plan" | "meeting_notes" | "research_brief" | "agent_instruction" => {
            Ok(())
        }
        _ => Err(format!("invalid document type: {value}")),
    }
}

fn validate_status(value: &str) -> Result<(), String> {
    match value {
        "draft" | "review" | "final" | "archived" => Ok(()),
        _ => Err(format!("invalid document status: {value}")),
    }
}

fn validate_editor_format(value: &str) -> Result<(), String> {
    if value == "markdown" {
        Ok(())
    } else {
        Err(format!("invalid editor format: {value}"))
    }
}

fn validate_title(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("document title is required".to_string());
    }
    if trimmed.chars().count() > MAX_TITLE_CHARS {
        return Err(format!(
            "document title exceeds {MAX_TITLE_CHARS} characters"
        ));
    }
    Ok(())
}

fn validate_content(value: &str) -> Result<(), String> {
    if value.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "document content exceeds {} MB limit",
            MAX_DOCUMENT_BYTES / (1024 * 1024)
        ));
    }
    Ok(())
}

fn validate_tags(tags: &[String]) -> Result<(), String> {
    if tags.len() > MAX_TAGS {
        return Err(format!("document has more than {MAX_TAGS} tags"));
    }
    Ok(())
}

impl DocumentDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("document schema migration failed: {}", e))?;
        // Migration: add is_global column if missing (existing databases), then index it.
        let _ = conn.execute_batch(
            "ALTER TABLE documents ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0;",
        );
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_documents_global ON documents(is_global);",
        )
        .map_err(|e| format!("document is_global index migration failed: {}", e))?;
        if cfg!(debug_assertions) {
            log::info!(
                "DocumentDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(DocumentDb(Mutex::new(conn)))
    }
}

pub struct DocumentDbState {
    app: tauri::AppHandle,
    db: crate::db_utils::DbSlot<DocumentDb>,
}

impl Clone for DocumentDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl DocumentDbState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            db: Arc::new(Mutex::new(None)),
        }
    }

    pub fn spawn_background_init(&self) {
        crate::db_utils::spawn_lazy_db_init(
            self.app.clone(),
            Arc::clone(&self.db),
            DocumentDb::init,
            "DocumentDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(DocumentDb::init(&self.app).map(Arc::new));
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

impl crate::db_utils::DbConnectionState for DocumentDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

fn row_to_document(row: &rusqlite::Row) -> rusqlite::Result<DocumentRow> {
    let tags_str: String = row.get("tags")?;
    Ok(DocumentRow {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        conversation_id: row.get("conversation_id")?,
        is_global: row.get::<_, i64>("is_global")? != 0,
        title: row.get("title")?,
        doc_type: row.get("type")?,
        status: row.get("status")?,
        editor_format: row.get("editor_format")?,
        content_markdown: row.get("content_markdown")?,
        tags: parse_json_array(&tags_str),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_exported_at: row.get("last_exported_at")?,
    })
}

fn row_to_version(row: &rusqlite::Row) -> rusqlite::Result<DocumentVersionRow> {
    Ok(DocumentVersionRow {
        id: row.get("id")?,
        document_id: row.get("document_id")?,
        version_number: row.get("version_number")?,
        content_markdown: row.get("content_markdown")?,
        change_source: row.get("change_source")?,
        change_summary: row.get("change_summary")?,
        source_conversation_id: row.get("source_conversation_id")?,
        source_message_id: row.get("source_message_id")?,
        created_at: row.get("created_at")?,
    })
}

pub fn create_document(conn: &Connection, input_json: String) -> Result<DocumentRow, String> {
    let input: DocumentCreateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_document input: {}", e))?;
    if input.id.is_empty() {
        return Err("create_document requires id".to_string());
    }
    validate_title(&input.title)?;
    validate_document_type(&input.doc_type)?;
    validate_status(&input.status)?;

    let tags = input.tags.unwrap_or_default();
    validate_tags(&tags)?;
    let tags_json =
        serde_json::to_string(&tags).map_err(|e| format!("failed to serialize tags: {}", e))?;
    let editor_format_val = input
        .editor_format
        .unwrap_or_else(|| "markdown".to_string());
    validate_editor_format(&editor_format_val)?;
    let content_val = input.content_markdown.unwrap_or_default();
    validate_content(&content_val)?;

    let is_global_val = input.is_global.unwrap_or(false) as i64;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_document transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO documents
           (id, project_id, conversation_id, is_global, title, type, status, editor_format, content_markdown, tags, created_at, updated_at, last_exported_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            input.id,
            input.project_id,
            input.conversation_id,
            is_global_val,
            input.title,
            input.doc_type,
            input.status,
            editor_format_val,
            content_val,
            tags_json,
            input.created_at,
            input.updated_at,
            input.last_exported_at,
        ],
    )
    .map_err(|e| format!("insert document failed: {}", e))?;

    let created = tx
        .query_row(
            "SELECT id, project_id, conversation_id, is_global, title, type, status, editor_format, content_markdown, tags, created_at, updated_at, last_exported_at
             FROM documents WHERE id = ?1",
            [&input.id],
            row_to_document,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_document transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_document(conn: &Connection, id: String) -> Result<DocumentRow, String> {
    conn.query_row(
        "SELECT id, project_id, conversation_id, is_global, title, type, status, editor_format, content_markdown, tags, created_at, updated_at, last_exported_at
         FROM documents WHERE id = ?1",
        [&id],
        row_to_document,
    )
    .map_err(|e| format!("get_document failed: {}", e))
}

pub fn update_document(conn: &Connection, input_json: String) -> Result<DocumentRow, String> {
    let input: DocumentUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_document input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_document requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.project_id {
        sets.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.conversation_id {
        sets.push(format!("conversation_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.is_global {
        sets.push(format!("is_global = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.title {
        validate_title(&v)?;
        sets.push(format!("title = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.doc_type {
        validate_document_type(&v)?;
        sets.push(format!("type = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.status {
        validate_status(&v)?;
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.editor_format {
        validate_editor_format(&v)?;
        sets.push(format!("editor_format = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.content_markdown {
        validate_content(&v)?;
        sets.push(format!("content_markdown = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tags {
        validate_tags(&v)?;
        let json =
            serde_json::to_string(&v).map_err(|e| format!("failed to serialize tags: {}", e))?;
        sets.push(format!("tags = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.updated_at {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.last_exported_at {
        sets.push(format!("last_exported_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_document requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE documents SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update document failed: {}", e))?;

    let updated = conn
        .query_row(
            "SELECT id, project_id, conversation_id, is_global, title, type, status, editor_format, content_markdown, tags, created_at, updated_at, last_exported_at
             FROM documents WHERE id = ?1",
            [&input.id],
            row_to_document,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn list_documents(
    conn: &Connection,
    project_id: Option<String>,
    conversation_id: Option<String>,
) -> Result<Vec<DocumentRow>, String> {
    let mut out = Vec::new();

    let base_cols = "id, project_id, conversation_id, is_global, title, type, status, editor_format, content_markdown, tags, created_at, updated_at, last_exported_at";

    let (sql, param_values): (String, Vec<Value>) = match (project_id, conversation_id) {
        (Some(pid), Some(cid)) => (
            format!(
                "SELECT {} FROM documents WHERE (project_id = ?1 OR is_global = 1) AND (conversation_id = ?2 OR is_global = 1) ORDER BY updated_at DESC",
                base_cols
            ),
            vec![Value::Text(pid), Value::Text(cid)],
        ),
        (Some(pid), None) => (
            format!(
                "SELECT {} FROM documents WHERE project_id = ?1 ORDER BY updated_at DESC",
                base_cols
            ),
            vec![Value::Text(pid)],
        ),
        (None, Some(cid)) => (
            format!(
                "SELECT {} FROM documents WHERE conversation_id = ?1 OR is_global = 1 ORDER BY updated_at DESC",
                base_cols
            ),
            vec![Value::Text(cid)],
        ),
        (None, None) => (
            format!(
                "SELECT {} FROM documents ORDER BY updated_at DESC",
                base_cols
            ),
            vec![],
        ),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_documents failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(param_values), row_to_document)
        .map_err(|e| format!("query list_documents failed: {}", e))?;
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_documents: {}", e))?);
    }
    Ok(out)
}

pub fn delete_document(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM documents WHERE id = ?1", [&id])
        .map_err(|e| format!("delete document failed: {}", e))?;
    Ok(())
}

pub fn create_version(conn: &Connection, input_json: String) -> Result<DocumentVersionRow, String> {
    let input: DocumentVersionCreateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_version input: {}", e))?;
    if input.id.is_empty() {
        return Err("create_version requires id".to_string());
    }
    validate_content(&input.content_markdown)?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_version transaction failed: {}", e))?;

    let version_number = tx
        .query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM document_versions WHERE document_id = ?1",
            [&input.document_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format!("next version lookup failed: {}", e))?;

    tx.execute(
        "INSERT INTO document_versions
           (id, document_id, version_number, content_markdown, change_source, change_summary, source_conversation_id, source_message_id, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            input.id,
            input.document_id,
            version_number,
            input.content_markdown,
            input.change_source,
            input.change_summary,
            input.source_conversation_id,
            input.source_message_id,
            input.created_at,
        ],
    )
    .map_err(|e| format!("insert document_version failed: {}", e))?;

    let created = tx
        .query_row(
            "SELECT id, document_id, version_number, content_markdown, change_source, change_summary, source_conversation_id, source_message_id, created_at
             FROM document_versions WHERE id = ?1",
            [&input.id],
            row_to_version,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_version transaction failed: {}", e))?;

    Ok(created)
}

pub fn list_versions(
    conn: &Connection,
    document_id: String,
) -> Result<Vec<DocumentVersionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, version_number, content_markdown, change_source, change_summary, source_conversation_id, source_message_id, created_at
             FROM document_versions
             WHERE document_id = ?1
             ORDER BY version_number DESC",
        )
        .map_err(|e| format!("prepare list_versions failed: {}", e))?;
    let rows = stmt
        .query_map([&document_id], row_to_version)
        .map_err(|e| format!("query list_versions failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_versions: {}", e))?);
    }
    Ok(out)
}

pub fn get_version(conn: &Connection, id: String) -> Result<DocumentVersionRow, String> {
    conn.query_row(
        "SELECT id, document_id, version_number, content_markdown, change_source, change_summary, source_conversation_id, source_message_id, created_at
         FROM document_versions WHERE id = ?1",
        [&id],
        row_to_version,
    )
    .map_err(|e| format!("get_version failed: {}", e))
}

pub fn restore_version(conn: &Connection, version_id: String) -> Result<DocumentRow, String> {
    let version = get_version(conn, version_id.clone())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE documents SET content_markdown = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![version.content_markdown, now, version.document_id],
    )
    .map_err(|e| format!("restore_version update failed: {}", e))?;

    get_document(conn, version.document_id)
}

pub fn update_document_exported_at(
    conn: &Connection,
    id: String,
    exported_at: String,
) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET last_exported_at = ?1 WHERE id = ?2",
        rusqlite::params![exported_at, id],
    )
    .map_err(|e| format!("update_document_exported_at failed: {}", e))?;
    Ok(())
}
