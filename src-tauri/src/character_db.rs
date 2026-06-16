use parking_lot::Mutex;
use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db_utils::parse_json_array;

pub struct CharacterDb(pub Mutex<Connection>);

// ── Row types ────────────────────────────────────────────────────────────────

/// Usage statistics for a character. Computed on read (not stored), so the
/// row struct can flatten this into the same JSON object the frontend
/// expects without requiring extra columns in the `characters` table.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStats {
    pub total_chats: i64,
    pub total_messages: i64,
    pub last_used_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterExampleMessage {
    pub user: String,
    pub assistant: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRow {
    pub id: String,
    pub name: String,
    pub title: String,
    pub avatar_path: String,
    pub avatar_color: String,
    pub tagline: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_message: String,
    pub alternate_greetings: Vec<String>,
    pub system_prompt: String,
    pub post_history_instructions: String,
    pub example_messages: Vec<CharacterExampleMessage>,
    pub creator_notes: String,
    pub tags: Vec<String>,
    pub category: String,
    pub version: String,
    pub spec: String,
    pub creator: String,
    pub source: String,
    pub is_global: bool,
    pub project_id: String,
    pub created_at: String,
    pub updated_at: String,
    /// Nested in the JSON as `stats: { totalChats, totalMessages, lastUsedAt }`
    /// so the frontend's `character.stats.totalChats` access works without
    /// requiring nullable handling.
    pub stats: CharacterStats,
    /// Lorebook entries, serialized as a JSON array. Defaults to empty.
    pub lorebook_entries: Vec<serde_json::Value>,
    /// Chat runtime defaults (scanDepth, maxLorebookEntries, …).
    pub chat_defaults: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCreateInput {
    pub id: String,
    pub name: String,
    pub title: Option<String>,
    pub avatar_path: Option<String>,
    pub avatar_color: Option<String>,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub personality: Option<String>,
    pub scenario: Option<String>,
    pub first_message: Option<String>,
    pub alternate_greetings: Option<String>,
    pub system_prompt: Option<String>,
    pub post_history_instructions: Option<String>,
    pub example_messages: Option<String>,
    pub creator_notes: Option<String>,
    pub tags: Option<String>,
    pub category: Option<String>,
    pub version: Option<String>,
    pub spec: Option<String>,
    pub creator: Option<String>,
    pub source: Option<String>,
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub lorebook_entries: Option<String>,
    pub chat_defaults: Option<String>,
    #[allow(dead_code)]
    pub creator_metadata: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterUpdateInput {
    pub id: String,
    pub name: Option<String>,
    pub title: Option<String>,
    pub avatar_path: Option<String>,
    pub avatar_color: Option<String>,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub personality: Option<String>,
    pub scenario: Option<String>,
    pub first_message: Option<String>,
    pub alternate_greetings: Option<String>,
    pub system_prompt: Option<String>,
    pub post_history_instructions: Option<String>,
    pub example_messages: Option<String>,
    pub creator_notes: Option<String>,
    pub tags: Option<String>,
    pub category: Option<String>,
    pub version: Option<String>,
    pub spec: Option<String>,
    pub creator: Option<String>,
    pub source: Option<String>,
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub updated_at: String,
    pub lorebook_entries: Option<String>,
    pub chat_defaults: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterListFilter {
    pub is_global: Option<bool>,
    pub project_id: Option<String>,
    pub tag: Option<String>,
    pub category: Option<String>,
    pub search: Option<String>,
}

// ── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  avatar_path TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT 'indigo',
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL DEFAULT '',
  first_message TEXT NOT NULL DEFAULT '',
  alternate_greetings_json TEXT NOT NULL DEFAULT '[]',
  system_prompt TEXT NOT NULL DEFAULT '',
  post_history_instructions TEXT NOT NULL DEFAULT '',
  example_messages_json TEXT NOT NULL DEFAULT '[]',
  creator_notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  spec TEXT NOT NULL DEFAULT 'veyra',
  creator TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'native',
  is_global INTEGER NOT NULL DEFAULT 1,
  project_id TEXT NOT NULL DEFAULT '',
  lorebook_entries_json TEXT NOT NULL DEFAULT '[]',
  chat_defaults_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  creator_metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_characters_is_global ON characters(is_global);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters(updated_at);
"#;

const SCHEMA_MIGRATIONS: &[&str] = &[
    "ALTER TABLE characters ADD COLUMN lorebook_entries_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN chat_defaults_json TEXT",
    "ALTER TABLE characters ADD COLUMN creator_metadata TEXT NOT NULL DEFAULT '{}'",
];

// ── Validation ───────────────────────────────────────────────────────────────

const MAX_NAME_CHARS: usize = 200;
const MAX_LONG_FIELD_CHARS: usize = 200_000;

fn validate_name(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("character name is required".to_string());
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err(format!(
            "character name exceeds {} characters",
            MAX_NAME_CHARS
        ));
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

/// Optional JSON field validator. Treats empty/blank strings and the literal
/// `null` as "not provided" so callers can omit the field or send null
/// without triggering a parse error.
fn validate_optional_json_field(name: &str, value: Option<&str>) -> Result<(), String> {
    let Some(raw) = value else {
        return Ok(());
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(());
    }
    validate_json_field(name, trimmed)
}

// ── Init ─────────────────────────────────────────────────────────────────────

impl CharacterDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("character schema migration failed: {}", e))?;
        for stmt in SCHEMA_MIGRATIONS {
            // Tolerate "duplicate column" errors from already-applied migrations.
            if let Err(error) = conn.execute_batch(stmt) {
                let msg = error.to_string();
                if !msg.contains("duplicate column") && !msg.contains("already exists") {
                    return Err(format!("character migration failed: {}", msg));
                }
            }
        }
        if cfg!(debug_assertions) {
            log::info!(
                "CharacterDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(CharacterDb(Mutex::new(conn)))
    }
}

// ── State wrapper ────────────────────────────────────────────────────────────

pub struct CharacterDbState {
    app: tauri::AppHandle,
    db: crate::db_utils::DbSlot<CharacterDb>,
}

impl Clone for CharacterDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl CharacterDbState {
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
            CharacterDb::init,
            "CharacterDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(CharacterDb::init(&self.app).map(Arc::new));
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

impl crate::db_utils::DbConnectionState for CharacterDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

// ── Row mapper ───────────────────────────────────────────────────────────────

const SELECT_COLS: &str = "id, name, title, avatar_path, avatar_color, tagline, description, personality, scenario, first_message, alternate_greetings_json, system_prompt, post_history_instructions, example_messages_json, creator_notes, tags_json, category, version, spec, creator, source, is_global, project_id, created_at, updated_at, lorebook_entries_json, chat_defaults_json";

fn parse_example_messages(s: &str) -> Vec<CharacterExampleMessage> {
    serde_json::from_str(s).unwrap_or_default()
}

fn parse_lorebook_entries(s: &str) -> Vec<serde_json::Value> {
    serde_json::from_str(s).unwrap_or_default()
}

fn parse_chat_defaults(s: Option<String>) -> Option<serde_json::Value> {
    s.and_then(|raw| serde_json::from_str(&raw).ok())
}

fn row_to_character(row: &rusqlite::Row) -> rusqlite::Result<CharacterRow> {
    let alternate_greetings_json: String = row.get("alternate_greetings_json")?;
    let example_messages_json: String = row.get("example_messages_json")?;
    let tags_json: String = row.get("tags_json")?;
    let lorebook_entries_json: String = row.get("lorebook_entries_json")?;
    let chat_defaults_json: Option<String> = row.get("chat_defaults_json")?;
    Ok(CharacterRow {
        id: row.get("id")?,
        name: row.get("name")?,
        title: row.get("title")?,
        avatar_path: row.get("avatar_path")?,
        avatar_color: row.get("avatar_color")?,
        tagline: row.get("tagline")?,
        description: row.get("description")?,
        personality: row.get("personality")?,
        scenario: row.get("scenario")?,
        first_message: row.get("first_message")?,
        alternate_greetings: parse_json_array(&alternate_greetings_json),
        system_prompt: row.get("system_prompt")?,
        post_history_instructions: row.get("post_history_instructions")?,
        example_messages: parse_example_messages(&example_messages_json),
        creator_notes: row.get("creator_notes")?,
        tags: parse_json_array(&tags_json),
        category: row.get("category")?,
        version: row.get("version")?,
        spec: row.get("spec")?,
        creator: row.get("creator")?,
        source: row.get("source")?,
        is_global: row.get::<_, i64>("is_global")? != 0,
        project_id: row.get("project_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        stats: CharacterStats::default(),
        lorebook_entries: parse_lorebook_entries(&lorebook_entries_json),
        chat_defaults: parse_chat_defaults(chat_defaults_json),
    })
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

pub fn create_character(conn: &Connection, input_json: String) -> Result<CharacterRow, String> {
    let input: CharacterCreateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_character input: {}", e))?;
    if input.id.is_empty() {
        return Err("create_character requires id".to_string());
    }
    validate_name(&input.name)?;

    let title = input.title.unwrap_or_default();
    let avatar_path = input.avatar_path.unwrap_or_default();
    let avatar_color = input.avatar_color.unwrap_or_else(|| "indigo".to_string());
    let tagline = input.tagline.unwrap_or_default();
    let description = input.description.unwrap_or_default();
    let personality = input.personality.unwrap_or_default();
    let scenario = input.scenario.unwrap_or_default();
    let first_message = input.first_message.unwrap_or_default();
    let alternate_greetings = input
        .alternate_greetings
        .unwrap_or_else(|| "[]".to_string());
    let system_prompt = input.system_prompt.unwrap_or_default();
    let post_history_instructions = input.post_history_instructions.unwrap_or_default();
    let example_messages = input.example_messages.unwrap_or_else(|| "[]".to_string());
    let creator_notes = input.creator_notes.unwrap_or_default();
    let tags = input.tags.unwrap_or_else(|| "[]".to_string());
    let category = input.category.unwrap_or_default();
    let version = input.version.unwrap_or_else(|| "1.0.0".to_string());
    let spec = input.spec.unwrap_or_else(|| "veyra".to_string());
    let creator = input.creator.unwrap_or_default();
    let source = input.source.unwrap_or_else(|| "native".to_string());
    let is_global = input.is_global.unwrap_or(true);
    let project_id = input.project_id.unwrap_or_default();
    let lorebook_entries = input.lorebook_entries.unwrap_or_else(|| "[]".to_string());
    let chat_defaults = input.chat_defaults.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed == "null" {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    validate_json_field("alternate_greetings", &alternate_greetings)?;
    validate_json_field("example_messages", &example_messages)?;
    validate_json_field("tags", &tags)?;
    validate_json_field("lorebook_entries", &lorebook_entries)?;
    validate_optional_json_field("chat_defaults", chat_defaults.as_deref())?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_character transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO characters
           (id, name, title, avatar_path, avatar_color, tagline, description, personality, scenario, first_message, alternate_greetings_json, system_prompt, post_history_instructions, example_messages_json, creator_notes, tags_json, category, version, spec, creator, source, is_global, project_id, lorebook_entries_json, chat_defaults_json, created_at, updated_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
        rusqlite::params![
            input.id,
            input.name,
            title,
            avatar_path,
            avatar_color,
            tagline,
            description,
            personality,
            scenario,
            first_message,
            alternate_greetings,
            system_prompt,
            post_history_instructions,
            example_messages,
            creator_notes,
            tags,
            category,
            version,
            spec,
            creator,
            source,
            is_global as i64,
            project_id,
            lorebook_entries,
            chat_defaults,
            input.created_at,
            input.updated_at,
        ],
    )
    .map_err(|e| format!("insert character failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM characters WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_character,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_character transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_character(conn: &Connection, id: String) -> Result<CharacterRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM characters WHERE id = ?1", SELECT_COLS),
        [&id],
        row_to_character,
    )
    .map_err(|e| format!("get_character failed: {}", e))
}

pub fn update_character(conn: &Connection, input_json: String) -> Result<CharacterRow, String> {
    let input: CharacterUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_character input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_character requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.name {
        validate_name(&v)?;
        sets.push(format!("name = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.title {
        sets.push(format!("title = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.avatar_path {
        sets.push(format!("avatar_path = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.avatar_color {
        sets.push(format!("avatar_color = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tagline {
        sets.push(format!("tagline = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.description {
        sets.push(format!("description = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.personality {
        sets.push(format!("personality = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.scenario {
        sets.push(format!("scenario = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.first_message {
        sets.push(format!("first_message = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.alternate_greetings {
        validate_json_field("alternate_greetings", &v)?;
        sets.push(format!("alternate_greetings_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.system_prompt {
        sets.push(format!("system_prompt = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.post_history_instructions {
        sets.push(format!("post_history_instructions = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.example_messages {
        validate_json_field("example_messages", &v)?;
        sets.push(format!("example_messages_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.creator_notes {
        sets.push(format!("creator_notes = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tags {
        validate_json_field("tags", &v)?;
        sets.push(format!("tags_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.category {
        sets.push(format!("category = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.version {
        sets.push(format!("version = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.spec {
        sets.push(format!("spec = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.creator {
        sets.push(format!("creator = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.source {
        sets.push(format!("source = ?{}", params.len() + 1));
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
    if let Some(v) = input.lorebook_entries {
        validate_json_field("lorebook_entries", &v)?;
        sets.push(format!("lorebook_entries_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.chat_defaults {
        let trimmed = v.trim();
        if trimmed.is_empty() || trimmed == "null" {
            sets.push(format!("chat_defaults_json = ?{}", params.len() + 1));
            params.push(Value::Null);
        } else {
            validate_json_field("chat_defaults", trimmed)?;
            sets.push(format!("chat_defaults_json = ?{}", params.len() + 1));
            params.push(Value::Text(trimmed.to_string()));
        }
    }

    if sets.is_empty() {
        // Nothing to update beyond timestamp; still bump updated_at.
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(input.updated_at.clone()));
    } else {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(input.updated_at.clone()));
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE characters SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update character failed: {}", e))?;

    let updated = conn
        .query_row(
            &format!("SELECT {} FROM characters WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_character,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn list_characters(
    conn: &Connection,
    filter_json: String,
) -> Result<Vec<CharacterRow>, String> {
    let filter: CharacterListFilter = if filter_json.trim().is_empty() {
        CharacterListFilter::default()
    } else {
        serde_json::from_str(&filter_json)
            .map_err(|e| format!("invalid list_characters filter: {}", e))?
    };

    let mut sql = format!("SELECT {} FROM characters WHERE 1=1", SELECT_COLS);
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
    if let Some(c) = filter.category {
        if !c.is_empty() {
            conds.push(format!("category = ?{}", param_values.len() + 1));
            param_values.push(Value::Text(c));
        }
    }
    if let Some(t) = filter.tag {
        if !t.is_empty() {
            // tags_json is a JSON array; use LIKE for a simple substring match
            conds.push(format!("tags_json LIKE ?{}", param_values.len() + 1));
            param_values.push(Value::Text(format!("%\"{}\"%", t)));
        }
    }
    if let Some(s) = filter.search {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            conds.push(format!(
                "(LOWER(name) LIKE ?{} OR LOWER(tagline) LIKE ?{} OR LOWER(title) LIKE ?{})",
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
        .map_err(|e| format!("prepare list_characters failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(param_values), row_to_character)
        .map_err(|e| format!("query list_characters failed: {}", e))?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_characters: {}", e))?);
    }
    Ok(out)
}

pub fn delete_character(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM characters WHERE id = ?1", [&id])
        .map_err(|e| format!("delete character failed: {}", e))?;
    Ok(())
}
