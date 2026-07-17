use rusqlite::Connection;
use std::fs;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Manager};

pub type DbSlot<D> = Arc<OnceLock<Result<Arc<D>, String>>>;

pub fn parse_json_array(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

pub fn open_app_sqlite(app: &AppHandle, db_filename: &str) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create app data dir {:?}: {}", dir, e))?;
    let db_path = dir.join(db_filename);
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("failed to open sqlite at {:?}: {}", db_path, e))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA cache_size = -64000;
         PRAGMA mmap_size = 268435456;",
    )
    .map_err(|e| format!("failed to set pragmas: {}", e))?;
    Ok(conn)
}

pub trait DbConnectionState: Clone + Send + Sync + 'static {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>;
}

pub async fn run_db_command<T, S, F>(state: &S, db_label: &str, f: F) -> Result<T, String>
where
    T: Send + 'static,
    S: DbConnectionState + Send + Sync + 'static,
    F: FnOnce(&Connection) -> Result<T, String> + Send + 'static,
{
    let state = state.clone();
    let label = db_label.to_string();
    tauri::async_runtime::spawn_blocking(move || state.with_db_connection(f))
        .await
        .map_err(|error| format!("{label} db task failed: {error}"))?
}

pub fn spawn_lazy_db_init<D, I>(app: AppHandle, db_slot: DbSlot<D>, init: I, db_label: &'static str)
where
    D: Send + Sync + 'static,
    I: FnOnce(&AppHandle) -> Result<D, String> + Send + 'static,
{
    std::thread::spawn(move || {
        let result = db_slot.get_or_init(|| init(&app).map(Arc::new));
        if let Err(error) = &result {
            log::error!("{db_label} background init failed: {error}");
        }
    });
}
