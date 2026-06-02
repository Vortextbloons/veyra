use parking_lot::Mutex;
use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

pub struct MemoryDb(pub Mutex<Connection>);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFolderRow {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub project_id: Option<String>,
    #[serde(rename = "type")]
    pub folder_type: String,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFileRow {
    pub id: String,
    pub folder_id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub purpose: String,
    pub key_points: Vec<String>,
    pub status: String,
    pub tags: Vec<String>,
    pub importance: i64,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
    pub node_count: i64,
    pub chunk_count: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeRow {
    pub id: String,
    pub folder_id: String,
    pub file_id: Option<String>,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub title: String,
    pub content: String,
    pub summary: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub scope: String,
    pub tags: Vec<String>,
    pub importance: i64,
    pub confidence: f64,
    pub origin: String,
    pub status: String,
    pub is_pinned: bool,
    pub user_editable: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub use_count: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeFilter {
    pub status: Option<Vec<String>>,
    pub scope: Option<Vec<String>>,
    #[serde(rename = "type")]
    pub node_type: Option<Vec<String>>,
    pub folder_id: Option<String>,
    pub file_id: Option<String>,
    pub project_id: Option<String>,
    pub is_pinned: Option<bool>,
    pub origin: Option<Vec<String>>,
    pub query: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeCreateInput {
    pub id: String,
    pub folder_id: String,
    pub file_id: Option<String>,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    #[serde(rename = "type")]
    pub node_type: String,
    pub scope: String,
    pub tags: Option<Vec<String>>,
    pub importance: Option<i64>,
    pub confidence: Option<f64>,
    pub origin: String,
    pub status: String,
    pub is_pinned: Option<bool>,
    pub user_editable: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub use_count: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeUpdateInput {
    pub id: String,
    pub folder_id: Option<String>,
    pub file_id: Option<String>,
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    #[serde(rename = "type")]
    pub node_type: Option<String>,
    pub scope: Option<String>,
    pub tags: Option<Vec<String>>,
    pub importance: Option<i64>,
    pub confidence: Option<f64>,
    pub origin: Option<String>,
    pub status: Option<String>,
    pub is_pinned: Option<bool>,
    pub user_editable: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub use_count: Option<i64>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS memory_folders (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  parent_id    TEXT,
  project_id   TEXT,
  folder_type  TEXT NOT NULL,
  description  TEXT,
  summary      TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_files (
  id           TEXT PRIMARY KEY,
  folder_id    TEXT NOT NULL,
  project_id   TEXT,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  purpose      TEXT NOT NULL DEFAULT '',
  key_points   TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  importance   INTEGER NOT NULL DEFAULT 3,
  confidence   REAL NOT NULL DEFAULT 0.5,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  node_count   INTEGER NOT NULL DEFAULT 0,
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (folder_id) REFERENCES memory_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_nodes (
  id               TEXT PRIMARY KEY,
  folder_id        TEXT NOT NULL,
  file_id          TEXT,
  project_id       TEXT,
  conversation_id  TEXT,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  summary          TEXT NOT NULL DEFAULT '',
  node_type        TEXT NOT NULL,
  scope            TEXT NOT NULL,
  tags             TEXT NOT NULL DEFAULT '[]',
  importance       INTEGER NOT NULL DEFAULT 3,
  confidence       REAL NOT NULL DEFAULT 0.5,
  origin           TEXT NOT NULL,
  status           TEXT NOT NULL,
  is_pinned        INTEGER NOT NULL DEFAULT 0,
  user_editable    INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  last_used_at     TEXT,
  use_count        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (folder_id) REFERENCES memory_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_nodes_status ON memory_nodes(status);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_scope  ON memory_nodes(scope);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_folder ON memory_nodes(folder_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_pinned ON memory_nodes(is_pinned);

CREATE TABLE IF NOT EXISTS memory_events (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  node_id     TEXT,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);
"#;

impl MemoryDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
        fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create app data dir {:?}: {}", dir, e))?;
        let db_path = dir.join("veyra.sqlite");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("failed to open sqlite at {:?}: {}", db_path, e))?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("failed to set pragmas: {}", e))?;
        run_migrations(&conn)?;
        Ok(MemoryDb(Mutex::new(conn)))
    }
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("schema migration failed: {}", e))?;

    // Seed a default folder so the first memory node has a valid FK target.
    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM memory_folders", [], |r| r.get(0))
        .map_err(|e| format!("count folders failed: {}", e))?;
    if existing == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO memory_folders (id, name, folder_type, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            rusqlite::params!["default", "General", "manual", &now, &now],
        )
        .map_err(|e| format!("seed default folder failed: {}", e))?;
    }

    Ok(())
}

fn parse_json_array(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

fn row_to_node(row: &rusqlite::Row) -> rusqlite::Result<MemoryNodeRow> {
    let tags_str: String = row.get(10)?;
    let is_pinned: i64 = row.get(15)?;
    let user_editable: i64 = row.get(16)?;
    Ok(MemoryNodeRow {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        file_id: row.get(2)?,
        project_id: row.get(3)?,
        conversation_id: row.get(4)?,
        title: row.get(5)?,
        content: row.get(6)?,
        summary: row.get(7)?,
        node_type: row.get(8)?,
        scope: row.get(9)?,
        tags: parse_json_array(&tags_str),
        importance: row.get(11)?,
        confidence: row.get(12)?,
        origin: row.get(13)?,
        status: row.get(14)?,
        is_pinned: is_pinned != 0,
        user_editable: user_editable != 0,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
        last_used_at: row.get(19)?,
        use_count: row.get(20)?,
    })
}

pub fn list_folders(conn: &Connection) -> Result<Vec<MemoryFolderRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, project_id, folder_type, description, summary, sort_order, created_at, updated_at
             FROM memory_folders
             ORDER BY sort_order ASC, name ASC",
        )
        .map_err(|e| format!("prepare list_folders failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemoryFolderRow {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                project_id: row.get(3)?,
                folder_type: row.get(4)?,
                description: row.get(5)?,
                summary: row.get(6)?,
                sort_order: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("query list_folders failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_folders: {}", e))?);
    }
    Ok(out)
}

pub fn list_files(
    conn: &Connection,
    folder_id: Option<String>,
) -> Result<Vec<MemoryFileRow>, String> {
    let row_mapper = |row: &rusqlite::Row| -> rusqlite::Result<MemoryFileRow> {
        let key_points_str: String = row.get(7)?;
        let tags_str: String = row.get(9)?;
        Ok(MemoryFileRow {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            project_id: row.get(2)?,
            title: row.get(3)?,
            slug: row.get(4)?,
            summary: row.get(5)?,
            purpose: row.get(6)?,
            key_points: parse_json_array(&key_points_str),
            status: row.get(8)?,
            tags: parse_json_array(&tags_str),
            importance: row.get(10)?,
            confidence: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            node_count: row.get(14)?,
            chunk_count: row.get(15)?,
        })
    };

    let mut out = Vec::new();
    if let Some(fid) = folder_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, folder_id, project_id, title, slug, summary, purpose, key_points, status, tags,
                        importance, confidence, created_at, updated_at, node_count, chunk_count
                 FROM memory_files
                 WHERE folder_id = ?1
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("prepare list_files failed: {}", e))?;
        let rows = stmt
            .query_map([fid], row_mapper)
            .map_err(|e| format!("query list_files failed: {}", e))?;
        for r in rows {
            out.push(r.map_err(|e| format!("row error in list_files: {}", e))?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, folder_id, project_id, title, slug, summary, purpose, key_points, status, tags,
                        importance, confidence, created_at, updated_at, node_count, chunk_count
                 FROM memory_files
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("prepare list_files failed: {}", e))?;
        let rows = stmt
            .query_map([], row_mapper)
            .map_err(|e| format!("query list_files failed: {}", e))?;
        for r in rows {
            out.push(r.map_err(|e| format!("row error in list_files: {}", e))?);
        }
    }
    Ok(out)
}

pub fn list_nodes(conn: &Connection, filter_json: String) -> Result<Vec<MemoryNodeRow>, String> {
    let trimmed = filter_json.trim();
    let filter: MemoryNodeFilter = if trimmed.is_empty() || trimmed == "null" {
        MemoryNodeFilter::default()
    } else {
        serde_json::from_str(trimmed)
            .map_err(|e| format!("invalid list_nodes filter: {}", e))?
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(statuses) = &filter.status {
        if !statuses.is_empty() {
            let placeholders: Vec<String> = (1..=statuses.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("status IN ({})", placeholders.join(",")));
            for s in statuses {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(scopes) = &filter.scope {
        if !scopes.is_empty() {
            let placeholders: Vec<String> = (1..=scopes.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("scope IN ({})", placeholders.join(",")));
            for s in scopes {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(types) = &filter.node_type {
        if !types.is_empty() {
            let placeholders: Vec<String> = (1..=types.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("node_type IN ({})", placeholders.join(",")));
            for s in types {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(fid) = &filter.folder_id {
        conditions.push(format!("folder_id = ?{}", params.len() + 1));
        params.push(Value::Text(fid.clone()));
    }
    if let Some(fid) = &filter.file_id {
        conditions.push(format!("file_id = ?{}", params.len() + 1));
        params.push(Value::Text(fid.clone()));
    }
    if let Some(pid) = &filter.project_id {
        conditions.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(pid.clone()));
    }
    if let Some(pinned) = filter.is_pinned {
        conditions.push(format!("is_pinned = ?{}", params.len() + 1));
        params.push(Value::Integer(if pinned { 1 } else { 0 }));
    }
    if let Some(origins) = &filter.origin {
        if !origins.is_empty() {
            let placeholders: Vec<String> = (1..=origins.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("origin IN ({})", placeholders.join(",")));
            for s in origins {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(q) = &filter.query {
        if !q.is_empty() {
            let pattern = format!("%{}%", q.to_lowercase());
            let base = params.len();
            conditions.push(format!(
                "(LOWER(title) LIKE ?{a} OR LOWER(content) LIKE ?{b} OR LOWER(summary) LIKE ?{c} OR LOWER(tags) LIKE ?{d})",
                a = base + 1,
                b = base + 2,
                c = base + 3,
                d = base + 4
            ));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    let limit = filter.limit.unwrap_or(1000);
    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                node_type, scope, tags, importance, confidence, origin, status,
                is_pinned, user_editable, created_at, updated_at, last_used_at, use_count
         FROM memory_nodes{}
         ORDER BY is_pinned DESC, importance DESC, created_at DESC
         LIMIT ?{}",
        where_clause, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_nodes failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), row_to_node)
        .map_err(|e| format!("query list_nodes failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_nodes: {}", e))?);
    }
    Ok(out)
}

pub fn create_node(conn: &Connection, input_json: String) -> Result<MemoryNodeRow, String> {
    let value: serde_json::Value = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_node input: {}", e))?;
    match value.get("id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => {}
        _ => return Err("create_node requires id".to_string()),
    }
    let input: MemoryNodeCreateInput = serde_json::from_value(value)
        .map_err(|e| format!("invalid create_node input: {}", e))?;

    let tags_json = serde_json::to_string(&input.tags.unwrap_or_default())
        .map_err(|e| format!("failed to serialize tags: {}", e))?;
    let is_pinned_val = if input.is_pinned.unwrap_or(false) { 1i64 } else { 0i64 };
    let user_editable_val = if input.user_editable.unwrap_or(true) { 1i64 } else { 0i64 };
    let importance_val = input.importance.unwrap_or(3);
    let confidence_val = input.confidence.unwrap_or(0.5);
    let use_count_val = input.use_count.unwrap_or(0);
    let content_val = input.content.unwrap_or_default();
    let summary_val = input.summary.unwrap_or_default();

    conn.execute(
        "INSERT INTO memory_nodes
           (id, folder_id, file_id, project_id, conversation_id, title, content, summary,
            node_type, scope, tags, importance, confidence, origin, status,
            is_pinned, user_editable, created_at, updated_at, last_used_at, use_count)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        rusqlite::params![
            input.id,
            input.folder_id,
            input.file_id,
            input.project_id,
            input.conversation_id,
            input.title,
            content_val,
            summary_val,
            input.node_type,
            input.scope,
            tags_json,
            importance_val,
            confidence_val,
            input.origin,
            input.status,
            is_pinned_val,
            user_editable_val,
            input.created_at,
            input.updated_at,
            input.last_used_at,
            use_count_val,
        ],
    )
    .map_err(|e| format!("insert memory_node failed: {}", e))?;

    let created = conn
        .query_row(
            "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                    node_type, scope, tags, importance, confidence, origin, status,
                    is_pinned, user_editable, created_at, updated_at, last_used_at, use_count
             FROM memory_nodes WHERE id = ?1",
            [&input.id],
            row_to_node,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    Ok(created)
}

pub fn update_node(conn: &Connection, input_json: String) -> Result<MemoryNodeRow, String> {
    let input: MemoryNodeUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_node input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_node requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.folder_id {
        sets.push(format!("folder_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.file_id {
        sets.push(format!("file_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.project_id {
        sets.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.conversation_id {
        sets.push(format!("conversation_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.title {
        sets.push(format!("title = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.content {
        sets.push(format!("content = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.summary {
        sets.push(format!("summary = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.node_type {
        sets.push(format!("node_type = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.scope {
        sets.push(format!("scope = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tags {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize tags: {}", e))?;
        sets.push(format!("tags = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.importance {
        sets.push(format!("importance = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.confidence {
        sets.push(format!("confidence = ?{}", params.len() + 1));
        params.push(Value::Real(v));
    }
    if let Some(v) = input.origin {
        sets.push(format!("origin = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.is_pinned {
        sets.push(format!("is_pinned = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.user_editable {
        sets.push(format!("user_editable = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.created_at {
        sets.push(format!("created_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.updated_at {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.use_count {
        sets.push(format!("use_count = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }

    if sets.is_empty() {
        return Err("update_node requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE memory_nodes SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update memory_node failed: {}", e))?;

    let updated = conn
        .query_row(
            "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                    node_type, scope, tags, importance, confidence, origin, status,
                    is_pinned, user_editable, created_at, updated_at, last_used_at, use_count
             FROM memory_nodes WHERE id = ?1",
            [&input.id],
            row_to_node,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn delete_node(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM memory_nodes WHERE id = ?1", [&id])
        .map_err(|e| format!("delete memory_node failed: {}", e))?;
    Ok(())
}

pub fn archive_node(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute(
        "UPDATE memory_nodes SET status = 'archived' WHERE id = ?1",
        [&id],
    )
    .map_err(|e| format!("archive memory_node failed: {}", e))?;
    Ok(())
}

pub fn pin_node(conn: &Connection, id: String, pinned: bool) -> Result<(), String> {
    let value = if pinned { 1i64 } else { 0i64 };
    conn.execute(
        "UPDATE memory_nodes SET is_pinned = ?1 WHERE id = ?2",
        rusqlite::params![value, id],
    )
    .map_err(|e| format!("pin memory_node failed: {}", e))?;
    Ok(())
}

pub fn search_nodes(
    conn: &Connection,
    query: String,
    limit: i64,
    project_id: Option<String>,
) -> Result<Vec<MemoryNodeRow>, String> {
    let pattern = format!("%{}%", query.to_lowercase());
    let mut params: Vec<Value> = Vec::new();

    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern.clone()));
    params.push(Value::Text(pattern));

    let project_filter = if let Some(pid) = project_id {
        let placeholder = params.len() + 1;
        params.push(Value::Text(pid));
        format!(" AND project_id = ?{}", placeholder)
    } else {
        String::new()
    };

    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                node_type, scope, tags, importance, confidence, origin, status,
                is_pinned, user_editable, created_at, updated_at, last_used_at, use_count,
                (CASE WHEN LOWER(title) LIKE ?1 THEN 3.0 ELSE 0 END) +
                (CASE WHEN LOWER(tags) LIKE ?2 THEN 2.0 ELSE 0 END) +
                (CASE WHEN LOWER(summary) LIKE ?3 THEN 1.5 ELSE 0 END) +
                (CASE WHEN LOWER(content) LIKE ?4 THEN 1.0 ELSE 0 END) AS score
         FROM memory_nodes
         WHERE status != 'archived'
           AND (LOWER(title) LIKE ?5 OR LOWER(tags) LIKE ?6 OR LOWER(summary) LIKE ?7 OR LOWER(content) LIKE ?8){}
         ORDER BY score DESC, importance DESC, last_used_at DESC NULLS LAST
         LIMIT ?{}",
        project_filter, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare search_nodes failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), row_to_node)
        .map_err(|e| format!("query search_nodes failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in search_nodes: {}", e))?);
    }
    Ok(out)
}
