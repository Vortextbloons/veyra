use rusqlite::{params_from_iter, types::Value, Connection};

use crate::memory::vector;
use super::helpers::fts_query;
use super::nodes::row_to_node;
use super::types::MemoryNodeRow;

pub fn search_nodes(
    conn: &Connection,
    query: String,
    limit: i64,
    project_id: Option<String>,
) -> Result<Vec<MemoryNodeRow>, String> {
    if let Some(match_query) = fts_query(&query) {
        return search_nodes_fts(conn, match_query, limit, project_id);
    }

    let pattern = format!("%{}%", query.to_lowercase());
    let mut params: Vec<Value> = vec![
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern.clone()),
        Value::Text(pattern),
    ];

    let project_filter = if let Some(pid) = project_id {
        let placeholder = params.len() + 1;
        params.push(Value::Text(pid));
        format!(" AND (project_id IS NULL OR project_id = ?{})", placeholder)
    } else {
        String::new()
    };

    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                node_type, scope, tags, importance, confidence, priority, expires_at,
                source_message_ids, extraction_batch_id, duplicate_of, contradiction_of,
                origin, status,
                is_pinned, user_editable, created_at, updated_at, last_used_at, use_count,
                embedding_dim,
                (CASE WHEN LOWER(title) LIKE ?1 THEN 3.0 ELSE 0 END) +
                (CASE WHEN LOWER(tags) LIKE ?2 THEN 2.0 ELSE 0 END) +
                (CASE WHEN LOWER(summary) LIKE ?3 THEN 1.5 ELSE 0 END) +
                (CASE WHEN LOWER(content) LIKE ?4 THEN 1.0 ELSE 0 END) AS score
         FROM memory_nodes
         WHERE status != 'archived'
           AND (LOWER(title) LIKE ?5 OR LOWER(tags) LIKE ?6 OR LOWER(summary) LIKE ?7 OR LOWER(content) LIKE ?8){}
         ORDER BY score DESC, importance DESC, last_used_at DESC NULLS LAST
         LIMIT ?{}",
        project_filter, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare search_nodes failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), |row| {
            let base = row_to_node(row)?;
            let raw_score: f64 = row.get("score")?;
            // Normalize LIKE score: max raw score is 7.5 (3+2+1.5+1), map to 0-1
            let normalized = (raw_score / 7.5).min(1.0);
            Ok(MemoryNodeRow {
                relevance_score: Some(normalized),
                ..base
            })
        })
        .map_err(|e| format!("query search_nodes failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in search_nodes: {}", e))?);
    }
    Ok(out)
}

fn search_nodes_fts(
    conn: &Connection,
    match_query: String,
    limit: i64,
    project_id: Option<String>,
) -> Result<Vec<MemoryNodeRow>, String> {
    let mut params: Vec<Value> = vec![Value::Text(match_query)];

    let project_filter = if let Some(pid) = project_id {
        let placeholder = params.len() + 1;
        params.push(Value::Text(pid));
        format!(
            " AND (n.project_id IS NULL OR n.project_id = ?{})",
            placeholder
        )
    } else {
        String::new()
    };

    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT n.id, n.folder_id, n.file_id, n.project_id, n.conversation_id, n.title, n.content, n.summary,
                n.node_type, n.scope, n.tags, n.importance, n.confidence, n.priority, n.expires_at,
                n.source_message_ids, n.extraction_batch_id, n.duplicate_of, n.contradiction_of,
                n.origin, n.status,
                n.is_pinned, n.user_editable, n.created_at, n.updated_at, n.last_used_at, n.use_count,
                n.embedding_dim,
                bm25(memory_nodes_fts) AS bm25_score
         FROM memory_nodes_fts f
         JOIN memory_nodes n ON n.rowid = f.rowid
         WHERE memory_nodes_fts MATCH ?1
           AND n.status != 'archived'{}
         ORDER BY bm25(memory_nodes_fts), n.importance DESC, n.last_used_at DESC NULLS LAST
         LIMIT ?{}",
        project_filter, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare search_nodes_fts failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), |row| {
            let base = row_to_node(row)?;
            let bm25_raw: f64 = row.get("bm25_score")?;
            Ok(MemoryNodeRow {
                relevance_score: Some(vector::normalize_bm25(bm25_raw)),
                ..base
            })
        })
        .map_err(|e| format!("query search_nodes_fts failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in search_nodes_fts: {}", e))?);
    }
    Ok(out)
}
