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
    /// `none` for ordinary projects, `locked` when the project owns an
    /// encrypted vault. A lock-enabled project's row is an opaque index: every
    /// content column is redacted and the real values live in the vault.
    pub lock_state: String,
}

impl ProjectRow {
    pub fn is_lock_enabled(&self) -> bool {
        self.lock_state == LOCK_STATE_LOCKED
    }
}

pub const LOCK_STATE_NONE: &str = "none";
pub const LOCK_STATE_LOCKED: &str = "locked";

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

-- Bookkeeping for the lock migration, kept separate from the projects table so
-- a crash between "vault is durable" and "plaintext is redacted" is visible and
-- resumable instead of silent.
CREATE TABLE IF NOT EXISTS project_vault_state (
  project_id TEXT PRIMARY KEY,
  migration_state TEXT NOT NULL DEFAULT 'staged',
  updated_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
"#;

/// Migration states for `project_vault_state.migration_state`.
pub const MIGRATION_STAGED: &str = "staged";
pub const MIGRATION_CLEANUP_PENDING: &str = "cleanup_pending";
pub const MIGRATION_DONE: &str = "done";

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| format!("could not inspect {table} schema: {e}"))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| format!("could not inspect {table} schema: {e}"))?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let name: String = row.get(1).map_err(|e| e.to_string())?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Adds the lock columns to databases created before locked projects existed.
fn migrate_schema(conn: &Connection) -> Result<(), String> {
    if !column_exists(conn, "projects", "lock_state")? {
        conn.execute(
            &format!(
                "ALTER TABLE projects ADD COLUMN lock_state TEXT NOT NULL DEFAULT '{LOCK_STATE_NONE}'"
            ),
            [],
        )
        .map_err(|e| format!("could not add projects.lock_state: {e}"))?;
    }
    Ok(())
}

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
        let conn = crate::shared::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("project schema migration failed: {}", e))?;
        migrate_schema(&conn)?;
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
    db: crate::shared::db_utils::DbSlot<ProjectDb>,
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
            db: Arc::default(),
        }
    }

    pub fn spawn_background_init(&self) {
        crate::shared::db_utils::spawn_lazy_db_init(
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
        let db = match self
            .db
            .get_or_init(|| ProjectDb::init(&self.app).map(Arc::new))
        {
            Ok(db) => Arc::clone(db),
            Err(error) => return Err(error.clone()),
        };
        let guard = db.0.lock();
        f(&guard)
    }
}

impl crate::shared::db_utils::DbConnectionState for ProjectDbState {
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
        lock_state: row.get("lock_state")?,
    })
}

const SELECT_COLS: &str = "id, name, description, kind, status, color, icon, system_prompt, settings_json, created_at, updated_at, last_opened_at, lock_state";

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
           (id, name, description, kind, status, color, icon, system_prompt, settings_json, created_at, updated_at, last_opened_at, lock_state)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12)",
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
            LOCK_STATE_NONE,
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

pub fn try_get_project(conn: &Connection, id: &str) -> Result<Option<ProjectRow>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM projects WHERE id = ?1", SELECT_COLS))
        .map_err(|e| format!("prepare get_project failed: {}", e))?;
    let mut rows = stmt
        .query([id])
        .map_err(|e| format!("query get_project failed: {}", e))?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row_to_project(row).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

pub fn update_project(conn: &Connection, input_json: String) -> Result<ProjectRow, String> {
    let input: ProjectUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_project input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_project requires id".to_string());
    }

    let existing = try_get_project(conn, &input.id)?
        .ok_or_else(|| format!("update_project: project {} not found", input.id))?;
    if existing.is_lock_enabled() {
        // A lock-enabled project's content columns are redacted and owned by
        // the vault. Only opaque index fields may change here.
        let only_index_fields = input.name.is_none()
            && input.description.is_none()
            && input.kind.is_none()
            && input.color.is_none()
            && input.icon.is_none()
            && input.system_prompt.is_none()
            && input.settings_json.is_none();
        if !only_index_fields {
            return Err(
                "This project is password-locked. Unlock it to change its details.".to_string(),
            );
        }
        if let Some(status) = &input.status {
            validate_project_status(status)?;
        }
        let mut sets: Vec<String> = Vec::new();
        let mut params: Vec<Value> = Vec::new();
        if let Some(v) = input.status {
            sets.push(format!("status = ?{}", params.len() + 1));
            params.push(Value::Text(v));
        }
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(input.updated_at));
        if let Some(v) = input.last_opened_at {
            sets.push(format!("last_opened_at = ?{}", params.len() + 1));
            params.push(Value::Text(v));
        }
        let where_placeholder = params.len() + 1;
        params.push(Value::Text(input.id.clone()));
        conn.execute(
            &format!(
                "UPDATE projects SET {} WHERE id = ?{}",
                sets.join(", "),
                where_placeholder
            ),
            params_from_iter(params),
        )
        .map_err(|e| format!("update project failed: {}", e))?;
        return get_project(conn, input.id);
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

/// Opaque index used by the frontend before any project content is allowed to
/// load: which projects are lock-enabled, and which have vault data on disk.
pub fn list_lock_states(conn: &Connection) -> Result<Vec<(String, bool)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, lock_state FROM projects")
        .map_err(|e| format!("prepare list_lock_states failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let state: String = row.get(1)?;
            Ok((id, state == LOCK_STATE_LOCKED))
        })
        .map_err(|e| format!("query list_lock_states failed: {}", e))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("row error in list_lock_states: {e}"))?);
    }
    Ok(out)
}

/// Atomically redacts a project's plaintext columns and marks it lock-enabled.
/// Run only after the vault has been staged and verified.
pub fn mark_project_locked(conn: &Connection, id: &str, updated_at: &str) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE projects SET
                name = '',
                description = '',
                system_prompt = '',
                settings_json = '{}',
                updated_at = ?2,
                lock_state = ?3
             WHERE id = ?1",
            rusqlite::params![id, updated_at, LOCK_STATE_LOCKED],
        )
        .map_err(|e| format!("could not mark the project as locked: {e}"))?;
    if changed == 0 {
        return Err("The project no longer exists.".into());
    }
    Ok(())
}

pub fn delete_project(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
        .map_err(|e| format!("delete project failed: {}", e))?;
    Ok(())
}

// ── Vault migration bookkeeping ──────────────────────────────────────────────

pub fn set_migration_state(
    conn: &Connection,
    project_id: &str,
    state: &str,
    detail: &str,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO project_vault_state (project_id, migration_state, updated_at, detail)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(project_id) DO UPDATE SET
           migration_state = excluded.migration_state,
           updated_at = excluded.updated_at,
           detail = excluded.detail",
        rusqlite::params![project_id, state, updated_at, detail],
    )
    .map_err(|e| format!("could not record vault migration state: {e}"))?;
    Ok(())
}

pub fn get_migration_state(conn: &Connection, project_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT migration_state FROM project_vault_state WHERE project_id = ?1",
        [project_id],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(format!("could not read vault migration state: {other}")),
    })
}

pub fn clear_migration_state(conn: &Connection, project_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM project_vault_state WHERE project_id = ?1",
        [project_id],
    )
    .map_err(|e| format!("could not clear vault migration state: {e}"))?;
    Ok(())
}

/// Projects whose migration was interrupted between staging and cleanup. They
/// must be finished (or rolled back) before the project behaves normally.
pub fn list_incomplete_migrations(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT project_id, migration_state FROM project_vault_state
             WHERE migration_state <> ?1",
        )
        .map_err(|e| format!("prepare list_incomplete_migrations failed: {e}"))?;
    let rows = stmt
        .query_map([MIGRATION_DONE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("query list_incomplete_migrations failed: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("row error in list_incomplete_migrations: {e}"))?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        migrate_schema(&conn).unwrap();
        conn
    }

    fn seed(conn: &Connection, id: &str) {
        create_project(
            conn,
            serde_json::json!({
                "id": id,
                "name": "Secret project",
                "description": "confidential",
                "systemPrompt": "private instructions",
                "settingsJson": "{\"resources\":[{\"path\":\"C:\\\\secrets\",\"directory\":true}]}",
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            })
            .to_string(),
        )
        .unwrap();
    }

    #[test]
    fn new_projects_are_not_lock_enabled() {
        let conn = memory_db();
        seed(&conn, "p1");
        let row = get_project(&conn, "p1".into()).unwrap();
        assert_eq!(row.lock_state, LOCK_STATE_NONE);
        assert!(!row.is_lock_enabled());
    }

    #[test]
    fn marking_locked_redacts_every_content_column() {
        let conn = memory_db();
        seed(&conn, "p1");
        mark_project_locked(&conn, "p1", "2026-02-02T00:00:00Z").unwrap();
        let row = get_project(&conn, "p1".into()).unwrap();
        assert!(row.is_lock_enabled());
        assert_eq!(row.name, "");
        assert_eq!(row.description, "");
        assert_eq!(row.system_prompt, "");
        assert_eq!(row.settings_json, "{}");
        assert_eq!(row.updated_at, "2026-02-02T00:00:00Z");
        // The opaque index fields survive so the project can still be listed.
        assert_eq!(row.id, "p1");
        assert_eq!(row.created_at, "2026-01-01T00:00:00Z");
        assert_eq!(row.status, "active");
    }

    #[test]
    fn locked_projects_refuse_content_updates_but_accept_index_updates() {
        let conn = memory_db();
        seed(&conn, "p1");
        mark_project_locked(&conn, "p1", "2026-02-02T00:00:00Z").unwrap();

        let rename = update_project(
            &conn,
            serde_json::json!({ "id": "p1", "name": "Leaked name", "updatedAt": "2026-03-01T00:00:00Z" })
                .to_string(),
        );
        assert!(rename.unwrap_err().contains("password-locked"));

        let touch = update_project(
            &conn,
            serde_json::json!({
                "id": "p1",
                "lastOpenedAt": "2026-03-01T00:00:00Z",
                "updatedAt": "2026-03-01T00:00:00Z",
            })
            .to_string(),
        )
        .unwrap();
        assert_eq!(touch.last_opened_at.as_deref(), Some("2026-03-01T00:00:00Z"));
        assert_eq!(touch.name, "");
    }

    #[test]
    fn lock_states_expose_only_ids_and_flags() {
        let conn = memory_db();
        seed(&conn, "p1");
        seed(&conn, "p2");
        mark_project_locked(&conn, "p2", "2026-02-02T00:00:00Z").unwrap();
        let mut states = list_lock_states(&conn).unwrap();
        states.sort();
        assert_eq!(
            states,
            vec![("p1".to_string(), false), ("p2".to_string(), true)]
        );
    }

    #[test]
    fn schema_migration_is_idempotent_for_older_databases() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        migrate_schema(&conn).unwrap();
        migrate_schema(&conn).unwrap();
        assert!(column_exists(&conn, "projects", "lock_state").unwrap());
    }
}
