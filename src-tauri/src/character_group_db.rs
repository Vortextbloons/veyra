// ── Character group database ─────────────────────────────────────────────────
//
// Groups are a roster of characters that can be bound to a conversation as
// a unit. The schema lives in the same `veyra.sqlite` file; the row mapper
// flattens the JSON member-id array into the typed struct the front-end
// expects.

use parking_lot::Mutex;
use rusqlite::{types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db_utils::parse_json_array;

pub struct CharacterGroupDb(pub Mutex<Connection>);

// ── Row types ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGroupRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub scenario: String,
    /// JSON array of character ids, in user-defined display order.
    pub member_ids: Vec<String>,
    /// "manual" or "auto" — auto means the model picks the speaker each turn.
    pub speaker_mode: String,
    /// JSON array of recent conversation ids bound to this group, for the
    /// "Recent chats" panel.
    pub recent_conversation_ids: Vec<String>,
    /// Persisted starting scenario line shown in the first message slot.
    pub opening_message: String,
    pub is_global: bool,
    pub project_id: String,
    pub created_at: String,
    pub updated_at: String,
    /// Last-picked active speaker id; empty string when unset.
    pub active_speaker_id: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGroupCreateInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub scenario: Option<String>,
    pub member_ids: Option<String>,
    pub speaker_mode: Option<String>,
    pub opening_message: Option<String>,
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGroupUpdateInput {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub scenario: Option<String>,
    pub member_ids: Option<String>,
    pub speaker_mode: Option<String>,
    pub opening_message: Option<String>,
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub recent_conversation_ids: Option<String>,
    pub active_speaker_id: Option<String>,
    pub updated_at: String,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGroupListFilter {
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub member_id: Option<String>,
    pub search: Option<String>,
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS character_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL DEFAULT '',
  member_ids_json TEXT NOT NULL DEFAULT '[]',
  speaker_mode TEXT NOT NULL DEFAULT 'auto',
  opening_message TEXT NOT NULL DEFAULT '',
  recent_conversation_ids_json TEXT NOT NULL DEFAULT '[]',
  is_global INTEGER NOT NULL DEFAULT 1,
  project_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active_speaker_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_character_groups_is_global ON character_groups(is_global);
CREATE INDEX IF NOT EXISTS idx_character_groups_project_id ON character_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_character_groups_updated_at ON character_groups(updated_at);
"#;

const SCHEMA_MIGRATIONS: &[&str] =
    &["ALTER TABLE character_groups ADD COLUMN active_speaker_id TEXT NOT NULL DEFAULT ''"];

// ── Validation ──────────────────────────────────────────────────────────────

const MAX_NAME_CHARS: usize = 200;
const MAX_LONG_FIELD_CHARS: usize = 100_000;

fn validate_name(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("group name is required".to_string());
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err(format!("group name exceeds {} characters", MAX_NAME_CHARS));
    }
    Ok(())
}

fn validate_json_field(name: &str, value: &str) -> Result<(), String> {
    if value.chars().count() > MAX_LONG_FIELD_CHARS {
        return Err(format!("{} exceeds size limit", name));
    }
    serde_json::from_str::<serde_json::Value>(value)
        .map_err(|e| format!("{} must be valid JSON: {}", name, e))?;
    Ok(())
}

fn validate_speaker_mode(value: &str) -> Result<(), String> {
    match value {
        "manual" | "auto" => Ok(()),
        other => Err(format!(
            "speaker_mode must be 'manual' or 'auto', got: {}",
            other
        )),
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────

impl CharacterGroupDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("character_group schema migration failed: {}", e))?;
        for stmt in SCHEMA_MIGRATIONS {
            if let Err(error) = conn.execute_batch(stmt) {
                let msg = error.to_string();
                if !msg.contains("duplicate column") && !msg.contains("already exists") {
                    return Err(format!("character_group migration failed: {}", msg));
                }
            }
        }
        if cfg!(debug_assertions) {
            log::info!(
                "CharacterGroupDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(CharacterGroupDb(Mutex::new(conn)))
    }
}

// ── State wrapper ───────────────────────────────────────────────────────────

pub struct CharacterGroupDbState {
    app: tauri::AppHandle,
    db: crate::db_utils::DbSlot<CharacterGroupDb>,
}

impl Clone for CharacterGroupDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl CharacterGroupDbState {
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
            CharacterGroupDb::init,
            "CharacterGroupDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(CharacterGroupDb::init(&self.app).map(Arc::new));
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

impl crate::db_utils::DbConnectionState for CharacterGroupDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

// ── Row mapper ──────────────────────────────────────────────────────────────

const SELECT_COLS: &str = "id, name, description, scenario, member_ids_json, speaker_mode, opening_message, recent_conversation_ids_json, is_global, project_id, created_at, updated_at, active_speaker_id";

fn row_to_group(row: &rusqlite::Row) -> rusqlite::Result<CharacterGroupRow> {
    let member_ids_json: String = row.get("member_ids_json")?;
    let recent_json: String = row.get("recent_conversation_ids_json")?;
    let active_speaker_id: String = row.get("active_speaker_id")?;
    Ok(CharacterGroupRow {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        scenario: row.get("scenario")?,
        member_ids: parse_json_array(&member_ids_json),
        speaker_mode: row.get("speaker_mode")?,
        opening_message: row.get("opening_message")?,
        recent_conversation_ids: parse_json_array(&recent_json),
        is_global: row.get::<_, i64>("is_global")? != 0,
        project_id: row.get("project_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        active_speaker_id: if active_speaker_id.is_empty() {
            None
        } else {
            Some(active_speaker_id)
        },
    })
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

pub fn create_character_group(
    conn: &Connection,
    input_json: String,
) -> Result<CharacterGroupRow, String> {
    let input: CharacterGroupCreateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_character_group input: {}", e))?;
    if input.id.is_empty() {
        return Err("create_character_group requires id".to_string());
    }
    validate_name(&input.name)?;

    let description = input.description.unwrap_or_default();
    let scenario = input.scenario.unwrap_or_default();
    let member_ids = input.member_ids.unwrap_or_else(|| "[]".to_string());
    let speaker_mode = input.speaker_mode.unwrap_or_else(|| "auto".to_string());
    let opening_message = input.opening_message.unwrap_or_default();
    let is_global = input.is_global.unwrap_or(true);
    let project_id = input.project_id.unwrap_or_default();

    validate_json_field("member_ids", &member_ids)?;
    validate_speaker_mode(&speaker_mode)?;
    if description.chars().count() > MAX_LONG_FIELD_CHARS
        || scenario.chars().count() > MAX_LONG_FIELD_CHARS
        || opening_message.chars().count() > MAX_LONG_FIELD_CHARS
    {
        return Err("field exceeds size limit".to_string());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_character_group transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO character_groups
           (id, name, description, scenario, member_ids_json, speaker_mode, opening_message, recent_conversation_ids_json, is_global, project_id, created_at, updated_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, '[]', ?8, ?9, ?10, ?11)",
        rusqlite::params![
            input.id,
            input.name,
            description,
            scenario,
            member_ids,
            speaker_mode,
            opening_message,
            is_global as i64,
            project_id,
            input.created_at,
            input.updated_at,
        ],
    )
    .map_err(|e| format!("insert character_group failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM character_groups WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_group,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_character_group transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_character_group(conn: &Connection, id: String) -> Result<CharacterGroupRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM character_groups WHERE id = ?1", SELECT_COLS),
        [&id],
        row_to_group,
    )
    .map_err(|e| format!("get_character_group failed: {}", e))
}

pub fn update_character_group(
    conn: &Connection,
    input_json: String,
) -> Result<CharacterGroupRow, String> {
    let input: CharacterGroupUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_character_group input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_character_group requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.name {
        validate_name(&v)?;
        sets.push(format!("name = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.description {
        if v.chars().count() > MAX_LONG_FIELD_CHARS {
            return Err("description exceeds size limit".to_string());
        }
        sets.push(format!("description = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.scenario {
        if v.chars().count() > MAX_LONG_FIELD_CHARS {
            return Err("scenario exceeds size limit".to_string());
        }
        sets.push(format!("scenario = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.member_ids {
        validate_json_field("member_ids", &v)?;
        sets.push(format!("member_ids_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.speaker_mode {
        validate_speaker_mode(&v)?;
        sets.push(format!("speaker_mode = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.opening_message {
        if v.chars().count() > MAX_LONG_FIELD_CHARS {
            return Err("opening_message exceeds size limit".to_string());
        }
        sets.push(format!("opening_message = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.is_global {
        sets.push(format!("is_global = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.project_id {
        sets.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.recent_conversation_ids {
        validate_json_field("recent_conversation_ids", &v)?;
        sets.push(format!(
            "recent_conversation_ids_json = ?{}",
            params.len() + 1
        ));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.active_speaker_id {
        sets.push(format!("active_speaker_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    sets.push(format!("updated_at = ?{}", params.len() + 1));
    params.push(Value::Text(input.updated_at.clone()));

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE character_groups SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, rusqlite::params_from_iter(params))
        .map_err(|e| format!("update character_group failed: {}", e))?;

    let updated = conn
        .query_row(
            &format!("SELECT {} FROM character_groups WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_group,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn list_character_groups(
    conn: &Connection,
    filter_json: String,
) -> Result<Vec<CharacterGroupRow>, String> {
    let filter: CharacterGroupListFilter = if filter_json.trim().is_empty() {
        CharacterGroupListFilter::default()
    } else {
        serde_json::from_str(&filter_json)
            .map_err(|e| format!("invalid list_character_groups filter: {}", e))?
    };

    let mut sql = format!("SELECT {} FROM character_groups WHERE 1=1", SELECT_COLS);
    let mut conds: Vec<String> = Vec::new();
    let mut param_values: Vec<Value> = Vec::new();

    if let Some(g) = filter.is_global {
        conds.push(format!("is_global = ?{}", param_values.len() + 1));
        param_values.push(Value::Integer(if g { 1 } else { 0 }));
    }
    if let Some(p) = filter.project_id {
        if !p.is_empty() {
            conds.push(format!("project_id = ?{}", param_values.len() + 1));
            param_values.push(Value::Text(p));
        }
    }
    if let Some(m) = filter.member_id {
        if !m.is_empty() {
            // member_ids_json is a JSON array of strings; use LIKE for a
            // simple substring match ("character_id").
            conds.push(format!("member_ids_json LIKE ?{}", param_values.len() + 1));
            param_values.push(Value::Text(format!("%\"{}\"%", m)));
        }
    }
    if let Some(s) = filter.search {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            conds.push(format!(
                "(LOWER(name) LIKE ?{} OR LOWER(description) LIKE ?{} OR LOWER(scenario) LIKE ?{})",
                param_values.len() + 1,
                param_values.len() + 2,
                param_values.len() + 3
            ));
            let pattern = format!("%{}%", trimmed.to_lowercase());
            param_values.push(Value::Text(pattern.clone()));
            param_values.push(Value::Text(pattern.clone()));
            param_values.push(Value::Text(pattern));
        }
    }

    if !conds.is_empty() {
        sql.push_str(" AND ");
        sql.push_str(&conds.join(" AND "));
    }
    sql.push_str(" ORDER BY updated_at DESC");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_character_groups failed: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(param_values), row_to_group)
        .map_err(|e| format!("query list_character_groups failed: {}", e))?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_character_groups: {}", e))?);
    }
    Ok(out)
}

pub fn delete_character_group(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM character_groups WHERE id = ?1", [&id])
        .map_err(|e| format!("delete character_group failed: {}", e))?;
    Ok(())
}
