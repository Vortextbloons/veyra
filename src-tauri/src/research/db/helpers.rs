use rusqlite::Connection;

pub fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    column_type: &str,
) -> Result<(), String> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&pragma)
        .map_err(|e| format!("prepare pragma failed: {e}"))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| format!("query pragma failed: {e}"))?;
    let mut present = false;
    while let Some(row) = rows.next().map_err(|e| format!("read pragma row: {e}"))? {
        let name: String = row.get(1).map_err(|e| format!("read column name: {e}"))?;
        if name == column {
            present = true;
            break;
        }
    }
    drop(rows);
    drop(stmt);

    if !present {
        let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {column_type}");
        conn.execute_batch(&sql)
            .map_err(|e| format!("add column {table}.{column} failed: {e}"))?;
    }
    Ok(())
}
