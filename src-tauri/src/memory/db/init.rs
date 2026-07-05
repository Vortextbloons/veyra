use parking_lot::Mutex;
use rusqlite::Connection;
use std::sync::Arc;

use super::helpers::add_column_if_missing;
use super::types::{MemoryDb, SCHEMA, SCHEMA_VERSION};

impl MemoryDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::shared::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        run_migrations(&conn)?;
        if cfg!(debug_assertions) {
            log::info!(
                "MemoryDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(MemoryDb(Mutex::new(conn)))
    }
}

pub struct MemoryDbState {
    app: tauri::AppHandle,
    db: crate::shared::db_utils::DbSlot<MemoryDb>,
}

impl Clone for MemoryDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl MemoryDbState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            db: Arc::new(Mutex::new(None)),
        }
    }

    pub fn spawn_background_init(&self) {
        crate::shared::db_utils::spawn_lazy_db_init(
            self.app.clone(),
            Arc::clone(&self.db),
            MemoryDb::init,
            "MemoryDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(MemoryDb::init(&self.app).map(Arc::new));
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

impl crate::shared::db_utils::DbConnectionState for MemoryDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

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
            "SELECT version FROM _schema_migrations WHERE module = 'memory'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if schema_version < SCHEMA_VERSION {
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("schema migration failed: {}", e))?;

        add_column_if_missing(
            conn,
            "memory_nodes",
            "priority",
            "TEXT NOT NULL DEFAULT 'medium'",
        )?;
        add_column_if_missing(conn, "memory_nodes", "expires_at", "TEXT")?;
        add_column_if_missing(
            conn,
            "memory_nodes",
            "source_message_ids",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        add_column_if_missing(conn, "memory_nodes", "extraction_batch_id", "TEXT")?;
        add_column_if_missing(conn, "memory_nodes", "duplicate_of", "TEXT")?;
        add_column_if_missing(conn, "memory_nodes", "contradiction_of", "TEXT")?;
        add_column_if_missing(conn, "memory_nodes", "embedding", "BLOB")?;
        add_column_if_missing(conn, "memory_nodes", "embedding_dim", "INTEGER")?;

        if schema_version < 1 {
            conn.execute_batch("INSERT INTO memory_nodes_fts(memory_nodes_fts) VALUES('rebuild');")
                .map_err(|e| format!("fts rebuild failed: {}", e))?;
        }

        if schema_version < 2 {
            migrate_fts_tag_triggers(conn)?;
            conn.execute_batch("INSERT INTO memory_nodes_fts(memory_nodes_fts) VALUES('rebuild');")
                .map_err(|e| format!("fts rebuild after tag migration failed: {}", e))?;
        }

        conn.execute(
            "INSERT INTO _schema_migrations (module, version, applied_at) VALUES ('memory', ?1, datetime('now'))
             ON CONFLICT(module) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at",
            [SCHEMA_VERSION],
        )
        .map_err(|e| format!("set schema version failed: {}", e))?;
    }

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

fn migrate_fts_tag_triggers(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        DROP TRIGGER IF EXISTS memory_nodes_ai;
        DROP TRIGGER IF EXISTS memory_nodes_ad;
        DROP TRIGGER IF EXISTS memory_nodes_au;

        CREATE TRIGGER memory_nodes_ai AFTER INSERT ON memory_nodes BEGIN
          INSERT INTO memory_nodes_fts(rowid, title, content, summary, tags)
          VALUES (new.rowid, new.title, new.content, new.summary,
            COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) je), ''));
        END;

        CREATE TRIGGER memory_nodes_ad AFTER DELETE ON memory_nodes BEGIN
          INSERT INTO memory_nodes_fts(memory_nodes_fts, rowid, title, content, summary, tags)
          VALUES('delete', old.rowid, old.title, old.content, old.summary,
            COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(old.tags) THEN old.tags ELSE '[]' END) je), ''));
        END;

        CREATE TRIGGER memory_nodes_au AFTER UPDATE ON memory_nodes BEGIN
          INSERT INTO memory_nodes_fts(memory_nodes_fts, rowid, title, content, summary, tags)
          VALUES('delete', old.rowid, old.title, old.content, old.summary,
            COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(old.tags) THEN old.tags ELSE '[]' END) je), ''));
          INSERT INTO memory_nodes_fts(rowid, title, content, summary, tags)
          VALUES (new.rowid, new.title, new.content, new.summary,
            COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) je), ''));
        END;
        ",
    )
    .map_err(|e| format!("migrate fts tag triggers failed: {}", e))
}
