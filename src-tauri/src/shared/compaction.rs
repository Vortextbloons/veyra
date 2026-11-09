//! SQLite post-deletion compaction.
//!
//! When a project's plaintext columns are redacted, or a locked project's row is
//! deleted, the old bytes can survive in SQLite free pages and in the WAL file
//! until the database is rebuilt. A `VACUUM` after a WAL checkpoint rewrites the
//! database from live data only.
//!
//! This is honest best-effort hygiene, not a secure erase:
//! * SSD wear levelling, filesystem journals, pagefiles, and any file-level
//!   backup or shadow copy may still hold earlier revisions.
//! * An attacker who imaged the disk before the redaction keeps that image.
//!
//! Documented in `docs/projects/05-locked-projects.md`.

use rusqlite::Connection;

/// Checkpoints the WAL and rebuilds the database file.
pub fn compact_database(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("WAL checkpoint failed: {e}"))?;
    conn.execute_batch("VACUUM;")
        .map_err(|e| format!("database compaction failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compaction_runs_on_a_live_database() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT);")
            .unwrap();
        conn.execute("INSERT INTO t (value) VALUES ('secret')", [])
            .unwrap();
        conn.execute("DELETE FROM t", []).unwrap();
        compact_database(&conn).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM t", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
