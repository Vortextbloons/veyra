use parking_lot::Mutex;
use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub struct ProjectDb(pub Mutex<Connection>);

// ── Row types ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: String,
    pub status: String,
    pub color: String,
    pub icon: String,
    pub system_prompt: String,
    pub settings_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub system_prompt: Option<String>,
    pub settings_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdateInput {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub system_prompt: Option<String>,
    pub settings_json: Option<String>,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

// ── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  color TEXT NOT NULL DEFAULT 'indigo',
  icon TEXT NOT NULL DEFAULT 'folder',
  system_prompt TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);
"#;

// ── Validation ───────────────────────────────────────────────────────────────

fn validate_project_kind(value: &str) -> Result<(), String> {
    match value {
        "app" | "class" | "client" | "codebase" | "creative" | "research" | "general" => Ok(()),
        _ => Err(format!("invalid project kind: {value}")),
    }
}

fn validate_project_status(value: &str) -> Result<(), String> {
    match value {
        "active" | "paused" | "archived" => Ok(()),
        _ => Err(format!("invalid project status: {value}")),
    }
}

fn validate_project_color(value: &str) -> Result<(), String> {
    match value {
        "indigo" | "violet" | "blue" | "cyan" | "teal" | "emerald" | "amber" | "orange"
        | "rose" | "pink" | "slate" => Ok(()),
        _ => Err(format!("invalid project color: {value}")),
    }
}

fn validate_name(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("project name is required".to_string());
    }
    if trimmed.chars().count() > 200 {
        return Err("project name exceeds 200 characters".to_string());
    }
    Ok(())
}

// ── Init ─────────────────────────────────────────────────────────────────────

impl ProjectDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("project schema migration failed: {}", e))?;
        if cfg!(debug_assertions) {
            log::info!(
                "ProjectDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(ProjectDb(Mutex::new(conn)))
    }
}

// ── State wrapper ────────────────────────────────────────────────────────────

pub struct ProjectDbState {
    app: tauri::AppHandle,
    db: crate::db_utils::DbSlot<ProjectDb>,
}

impl Clone for ProjectDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl ProjectDbState {
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
            ProjectDb::init,
            "ProjectDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(ProjectDb::init(&self.app).map(Arc::new));
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

impl crate::db_utils::DbConnectionState for ProjectDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

// ── Row mapper ───────────────────────────────────────────────────────────────

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<ProjectRow> {
    Ok(ProjectRow {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        kind: row.get("kind")?,
        status: row.get("status")?,
        color: row.get("color")?,
        icon: row.get("icon")?,
        system_prompt: row.get("system_prompt")?,
        settings_json: row.get("settings_json")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_opened_at: row.get("last_opened_at")?,
    })
}

const SELECT_COLS: &str = "id, name, description, kind, status, color, icon, system_prompt, settings_json, created_at, updated_at, last_opened_at";

// ── CRUD ─────────────────────────────────────────────────────────────────────

pub fn create_project(conn: &Connection, input_json: String) -> Result<ProjectRow, String> {
    let input: ProjectCreateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_project input: {}", e))?;
    if input.id.is_empty() {
        return Err("create_project requires id".to_string());
    }
    validate_name(&input.name)?;

    let kind = input.kind.unwrap_or_else(|| "general".to_string());
    validate_project_kind(&kind)?;
    let status = input.status.unwrap_or_else(|| "active".to_string());
    validate_project_status(&status)?;
    let color = input.color.unwrap_or_else(|| "indigo".to_string());
    validate_project_color(&color)?;
    let icon = input.icon.unwrap_or_else(|| "folder".to_string());
    let description = input.description.unwrap_or_default();
    let system_prompt = input.system_prompt.unwrap_or_default();
    let settings_json = input.settings_json.unwrap_or_else(|| "{}".to_string());

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_project transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO projects
           (id, name, description, kind, status, color, icon, system_prompt, settings_json, created_at, updated_at, last_opened_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
        rusqlite::params![
            input.id,
            input.name,
            description,
            kind,
            status,
            color,
            icon,
            system_prompt,
            settings_json,
            input.created_at,
            input.updated_at,
        ],
    )
    .map_err(|e| format!("insert project failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM projects WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_project,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_project transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_project(conn: &Connection, id: String) -> Result<ProjectRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM projects WHERE id = ?1", SELECT_COLS),
        [&id],
        row_to_project,
    )
    .map_err(|e| format!("get_project failed: {}", e))
}

pub fn update_project(conn: &Connection, input_json: String) -> Result<ProjectRow, String> {
    let input: ProjectUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_project input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_project requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.name {
        validate_name(&v)?;
        sets.push(format!("name = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.description {
        sets.push(format!("description = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.kind {
        validate_project_kind(&v)?;
        sets.push(format!("kind = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.status {
        validate_project_status(&v)?;
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.color {
        validate_project_color(&v)?;
        sets.push(format!("color = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.icon {
        sets.push(format!("icon = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.system_prompt {
        sets.push(format!("system_prompt = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.settings_json {
        sets.push(format!("settings_json = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.last_opened_at {
        sets.push(format!("last_opened_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    sets.push(format!("updated_at = ?{}", params.len() + 1));
    params.push(Value::Text(input.updated_at.clone()));

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE projects SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update project failed: {}", e))?;

    let updated = conn
        .query_row(
            &format!("SELECT {} FROM projects WHERE id = ?1", SELECT_COLS),
            [&input.id],
            row_to_project,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn list_projects(conn: &Connection, status: Option<String>) -> Result<Vec<ProjectRow>, String> {
    let mut out = Vec::new();

    let (sql, param_values): (String, Vec<Value>) = match status {
        Some(s) => (
            format!(
                "SELECT {} FROM projects WHERE status = ?1 ORDER BY updated_at DESC",
                SELECT_COLS
            ),
            vec![Value::Text(s)],
        ),
        None => (
            format!(
                "SELECT {} FROM projects ORDER BY updated_at DESC",
                SELECT_COLS
            ),
            vec![],
        ),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_projects failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(param_values), row_to_project)
        .map_err(|e| format!("query list_projects failed: {}", e))?;
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_projects: {}", e))?);
    }
    Ok(out)
}

pub fn delete_project(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
        .map_err(|e| format!("delete project failed: {}", e))?;
    Ok(())
}
