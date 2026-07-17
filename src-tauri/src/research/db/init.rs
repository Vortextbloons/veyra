use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;

use super::helpers::add_column_if_missing;
use super::types::{ResearchDb, SCHEMA, SCHEMA_VERSION};

impl ResearchDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::shared::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        run_migrations(&conn)?;
        reconcile_interrupted_runs(&conn)?;
        if cfg!(debug_assertions) {
            log::info!(
                "ResearchDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(ResearchDb(Mutex::new(conn)))
    }
}

// ── State wrapper ──────────────────────────────────────────────────────────────

pub struct ResearchDbState {
    app: tauri::AppHandle,
    db: crate::shared::db_utils::DbSlot<ResearchDb>,
}

impl Clone for ResearchDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl ResearchDbState {
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
            ResearchDb::init,
            "ResearchDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = match self
            .db
            .get_or_init(|| ResearchDb::init(&self.app).map(Arc::new))
        {
            Ok(db) => Arc::clone(db),
            Err(error) => return Err(error.clone()),
        };
        let guard = db.0.lock();
        f(&guard)
    }
}

impl crate::shared::db_utils::DbConnectionState for ResearchDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

// ── Migrations ─────────────────────────────────────────────────────────────────

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (
            module TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("create _schema_migrations table failed: {}", e))?;

    let schema_version: i64 = conn
        .query_row(
            "SELECT version FROM _schema_migrations WHERE module = 'research'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if schema_version < SCHEMA_VERSION {
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("research schema migration failed: {}", e))?;

        if schema_version < 4 {
            add_column_if_missing(conn, "research_sources", "fetch_status", "TEXT")?;
        }
        if schema_version < 5 {
            add_column_if_missing(conn, "research_sources", "source_quality_json", "TEXT")?;
        }
        if schema_version < 6 {
            add_column_if_missing(
                conn,
                "research_claims",
                "disputed_by",
                "TEXT NOT NULL DEFAULT '[]'",
            )?;
            add_column_if_missing(
                conn,
                "research_claims",
                "needs_semantic_review",
                "INTEGER NOT NULL DEFAULT 0",
            )?;
            add_column_if_missing(conn, "research_runs", "search_provider", "TEXT")?;
        }

        conn.execute(
            "INSERT INTO _schema_migrations (module, version, applied_at) VALUES ('research', ?1, datetime('now'))
             ON CONFLICT(module) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at",
            [SCHEMA_VERSION],
        )
        .map_err(|e| format!("set schema version failed: {}", e))?;
    }

    Ok(())
}

/// Pause runs left in an active status after an unclean app exit (no in-memory worker).
fn reconcile_interrupted_runs(conn: &Connection) -> Result<(), String> {
    const INTERRUPTED_RUN_ERROR: &str =
        "Research was interrupted when the app closed. Resume to continue.";
    const INTERRUPTED_STEP_ERROR: &str = "Interrupted when the app closed";
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE research_steps
         SET status = 'failed', error = ?1, completed_at = ?2
         WHERE status = 'running'
           AND run_id IN (
             SELECT id FROM research_runs
             WHERE status IN ('planning', 'searching', 'reading', 'extracting', 'verifying', 'synthesizing')
           )",
        rusqlite::params![INTERRUPTED_STEP_ERROR, now],
    )
    .map_err(|e| format!("reconcile research steps failed: {e}"))?;

    conn.execute(
        "UPDATE research_runs
         SET status = 'paused', error = ?1, updated_at = ?2
         WHERE status IN ('planning', 'searching', 'reading', 'extracting', 'verifying', 'synthesizing')",
        rusqlite::params![INTERRUPTED_RUN_ERROR, now],
    )
    .map_err(|e| format!("reconcile research runs failed: {e}"))?;

    Ok(())
}
