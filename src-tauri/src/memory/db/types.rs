use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

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
    pub priority: String,
    pub expires_at: Option<String>,
    pub source_message_ids: Vec<String>,
    pub extraction_batch_id: Option<String>,
    pub duplicate_of: Option<String>,
    pub contradiction_of: Option<String>,
    pub origin: String,
    pub status: String,
    pub is_pinned: bool,
    pub user_editable: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub use_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relevance_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vector_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bm25_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_dim: Option<i64>,
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
    pub priority: Option<String>,
    pub expires_at: Option<String>,
    pub source_message_ids: Option<Vec<String>>,
    pub extraction_batch_id: Option<String>,
    pub duplicate_of: Option<String>,
    pub contradiction_of: Option<String>,
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
    pub priority: Option<String>,
    pub expires_at: Option<String>,
    pub source_message_ids: Option<Vec<String>>,
    pub extraction_batch_id: Option<String>,
    pub duplicate_of: Option<String>,
    pub contradiction_of: Option<String>,
    pub origin: Option<String>,
    pub status: Option<String>,
    pub is_pinned: Option<bool>,
    pub user_editable: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub last_used_at: Option<String>,
    pub use_count: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStatus {
    pub total_nodes: i64,
    pub embedded_count: i64,
    pub missing_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePair {
    pub node_a_id: String,
    pub node_b_id: String,
    pub similarity: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VectorSearchResult {
    pub nodes: Vec<MemoryNodeRow>,
    pub query_vector_available: bool,
}

pub const SCHEMA: &str = r#"
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
  priority         TEXT NOT NULL DEFAULT 'medium',
  expires_at       TEXT,
  source_message_ids TEXT NOT NULL DEFAULT '[]',
  extraction_batch_id TEXT,
  duplicate_of     TEXT,
  contradiction_of TEXT,
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
CREATE INDEX IF NOT EXISTS idx_memory_nodes_project ON memory_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_file ON memory_nodes(file_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_updated ON memory_nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_search_order ON memory_nodes(status, is_pinned, importance, updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_files_folder_updated ON memory_files(folder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_folders_sort ON memory_folders(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_list_order ON memory_nodes(status, folder_id, file_id, project_id, is_pinned, importance, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_nodes_fts USING fts5(
  title,
  content,
  summary,
  tags,
  content='memory_nodes',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memory_nodes_ai AFTER INSERT ON memory_nodes BEGIN
  INSERT INTO memory_nodes_fts(rowid, title, content, summary, tags)
  VALUES (new.rowid, new.title, new.content, new.summary,
    COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) je), ''));
END;

CREATE TRIGGER IF NOT EXISTS memory_nodes_ad AFTER DELETE ON memory_nodes BEGIN
  INSERT INTO memory_nodes_fts(memory_nodes_fts, rowid, title, content, summary, tags)
  VALUES('delete', old.rowid, old.title, old.content, old.summary,
    COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(old.tags) THEN old.tags ELSE '[]' END) je), ''));
END;

CREATE TRIGGER IF NOT EXISTS memory_nodes_au AFTER UPDATE ON memory_nodes BEGIN
  INSERT INTO memory_nodes_fts(memory_nodes_fts, rowid, title, content, summary, tags)
  VALUES('delete', old.rowid, old.title, old.content, old.summary,
    COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(old.tags) THEN old.tags ELSE '[]' END) je), ''));
  INSERT INTO memory_nodes_fts(rowid, title, content, summary, tags)
  VALUES (new.rowid, new.title, new.content, new.summary,
    COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) je), ''));
END;

-- Reserved for future event sourcing / extraction batch tracking (not yet used):
-- CREATE TABLE IF NOT EXISTS memory_events (
--   id          TEXT PRIMARY KEY,
--   event_type  TEXT NOT NULL,
--   node_id     TEXT,
--   payload     TEXT NOT NULL DEFAULT '{}',
--   created_at  TEXT NOT NULL
-- );
--
-- CREATE TABLE IF NOT EXISTS memory_extraction_batches (
--   id                  TEXT PRIMARY KEY,
--   conversation_id     TEXT NOT NULL,
--   start_message_index INTEGER NOT NULL,
--   end_message_index   INTEGER NOT NULL,
--   status              TEXT NOT NULL,
--   created_at          TEXT NOT NULL,
--   completed_at        TEXT,
--   model               TEXT,
--   error               TEXT
-- );
"#;

pub const SCHEMA_VERSION: i64 = 3;
