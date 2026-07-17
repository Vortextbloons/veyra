use rusqlite::{params_from_iter, types::Value, Connection};

use super::helpers::escape_like_pattern;
use super::types::{
    MemoryFileRow, MemoryFolderRow, MemoryNodeCreateInput, MemoryNodeFilter, MemoryNodeRow,
    MemoryNodeUpdateInput,
};
use crate::shared::db_utils::parse_json_array;

pub fn row_to_node(row: &rusqlite::Row) -> rusqlite::Result<MemoryNodeRow> {
    let tags_str: String = row.get("tags")?;
    let source_message_ids_str: String = row.get("source_message_ids")?;
    let is_pinned: i64 = row.get("is_pinned")?;
    let user_editable: i64 = row.get("user_editable")?;
    let embedding_dim: Option<i64> = row.get("embedding_dim").ok();
    Ok(MemoryNodeRow {
        id: row.get("id")?,
        folder_id: row.get("folder_id")?,
        file_id: row.get("file_id")?,
        project_id: row.get("project_id")?,
        conversation_id: row.get("conversation_id")?,
        title: row.get("title")?,
        content: row.get("content")?,
        summary: row.get("summary")?,
        node_type: row.get("node_type")?,
        scope: row.get("scope")?,
        tags: parse_json_array(&tags_str),
        importance: row.get("importance")?,
        confidence: row.get("confidence")?,
        priority: row.get("priority")?,
        expires_at: row.get("expires_at")?,
        source_message_ids: parse_json_array(&source_message_ids_str),
        extraction_batch_id: row.get("extraction_batch_id")?,
        duplicate_of: row.get("duplicate_of")?,
        contradiction_of: row.get("contradiction_of")?,
        origin: row.get("origin")?,
        status: row.get("status")?,
        is_pinned: is_pinned != 0,
        user_editable: user_editable != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_used_at: row.get("last_used_at")?,
        use_count: row.get("use_count")?,
        relevance_score: None,
        vector_score: None,
        bm25_score: None,
        embedding_dim,
    })
}

pub fn list_folders(conn: &Connection) -> Result<Vec<MemoryFolderRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, project_id, folder_type, description, summary, sort_order, created_at, updated_at
             FROM memory_folders
             ORDER BY sort_order ASC, name ASC",
        )
        .map_err(|e| format!("prepare list_folders failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemoryFolderRow {
                id: row.get("id")?,
                name: row.get("name")?,
                parent_id: row.get("parent_id")?,
                project_id: row.get("project_id")?,
                folder_type: row.get("folder_type")?,
                description: row.get("description")?,
                summary: row.get("summary")?,
                sort_order: row.get("sort_order")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .map_err(|e| format!("query list_folders failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_folders: {}", e))?);
    }
    Ok(out)
}

pub fn list_files(
    conn: &Connection,
    folder_id: Option<String>,
) -> Result<Vec<MemoryFileRow>, String> {
    const COLS: &str =
        "id, folder_id, project_id, title, slug, summary, purpose, key_points, status, tags, \
                        importance, confidence, created_at, updated_at, node_count, chunk_count";

    let (sql, params): (String, Vec<Value>) = match folder_id {
        Some(fid) => (
            format!(
                "SELECT {COLS} FROM memory_files WHERE folder_id = ?1 ORDER BY updated_at DESC"
            ),
            vec![Value::Text(fid)],
        ),
        None => (
            format!("SELECT {COLS} FROM memory_files ORDER BY updated_at DESC"),
            vec![],
        ),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_files failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params.iter()), map_memory_file_row)
        .map_err(|e| format!("query list_files failed: {}", e))?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_files: {}", e))?);
    }
    Ok(out)
}

pub fn map_memory_file_row(row: &rusqlite::Row) -> rusqlite::Result<MemoryFileRow> {
    let key_points_str: String = row.get("key_points")?;
    let tags_str: String = row.get("tags")?;
    Ok(MemoryFileRow {
        id: row.get("id")?,
        folder_id: row.get("folder_id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        slug: row.get("slug")?,
        summary: row.get("summary")?,
        purpose: row.get("purpose")?,
        key_points: parse_json_array(&key_points_str),
        status: row.get("status")?,
        tags: parse_json_array(&tags_str),
        importance: row.get("importance")?,
        confidence: row.get("confidence")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        node_count: row.get("node_count")?,
        chunk_count: row.get("chunk_count")?,
    })
}

pub fn list_nodes(conn: &Connection, filter_json: String) -> Result<Vec<MemoryNodeRow>, String> {
    let trimmed = filter_json.trim();
    let filter: MemoryNodeFilter = if trimmed.is_empty() || trimmed == "null" {
        MemoryNodeFilter::default()
    } else {
        serde_json::from_str(trimmed).map_err(|e| format!("invalid list_nodes filter: {}", e))?
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(statuses) = &filter.status {
        if !statuses.is_empty() {
            let placeholders: Vec<String> = (1..=statuses.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("status IN ({})", placeholders.join(",")));
            for s in statuses {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(scopes) = &filter.scope {
        if !scopes.is_empty() {
            let placeholders: Vec<String> = (1..=scopes.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("scope IN ({})", placeholders.join(",")));
            for s in scopes {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(types) = &filter.node_type {
        if !types.is_empty() {
            let placeholders: Vec<String> = (1..=types.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("node_type IN ({})", placeholders.join(",")));
            for s in types {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(fid) = &filter.folder_id {
        conditions.push(format!("folder_id = ?{}", params.len() + 1));
        params.push(Value::Text(fid.clone()));
    }
    if let Some(fid) = &filter.file_id {
        conditions.push(format!("file_id = ?{}", params.len() + 1));
        params.push(Value::Text(fid.clone()));
    }
    if let Some(pid) = &filter.project_id {
        conditions.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(pid.clone()));
    }
    if let Some(pinned) = filter.is_pinned {
        conditions.push(format!("is_pinned = ?{}", params.len() + 1));
        params.push(Value::Integer(if pinned { 1 } else { 0 }));
    }
    if let Some(origins) = &filter.origin {
        if !origins.is_empty() {
            let placeholders: Vec<String> = (1..=origins.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("origin IN ({})", placeholders.join(",")));
            for s in origins {
                params.push(Value::Text(s.clone()));
            }
        }
    }
    if let Some(q) = &filter.query {
        if !q.is_empty() {
            let pattern = format!("%{}%", escape_like_pattern(&q.to_lowercase()));
            let base = params.len();
            conditions.push(format!(
                "(LOWER(title) LIKE ?{a} ESCAPE '\\' OR LOWER(content) LIKE ?{b} ESCAPE '\\' OR LOWER(summary) LIKE ?{c} ESCAPE '\\' OR LOWER(tags) LIKE ?{d} ESCAPE '\\')",
                a = base + 1,
                b = base + 2,
                c = base + 3,
                d = base + 4
            ));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern.clone()));
            params.push(Value::Text(pattern));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    let limit = filter.limit.unwrap_or(1000).clamp(1, 500);
    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                node_type, scope, tags, importance, confidence, priority, expires_at,
                source_message_ids, extraction_batch_id, duplicate_of, contradiction_of,
                origin, status,
                is_pinned, user_editable, created_at, updated_at, last_used_at, use_count,
                embedding_dim
         FROM memory_nodes{}
         ORDER BY is_pinned DESC, importance DESC, created_at DESC
         LIMIT ?{}",
        where_clause, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_nodes failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), row_to_node)
        .map_err(|e| format!("query list_nodes failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_nodes: {}", e))?);
    }
    Ok(out)
}

pub fn create_node(conn: &Connection, input_json: String) -> Result<MemoryNodeRow, String> {
    let value: serde_json::Value = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_node input: {}", e))?;
    match value.get("id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => {}
        _ => return Err("create_node requires id".to_string()),
    }
    let input: MemoryNodeCreateInput =
        serde_json::from_value(value).map_err(|e| format!("invalid create_node input: {}", e))?;

    let tags_json = serde_json::to_string(&input.tags.unwrap_or_default())
        .map_err(|e| format!("failed to serialize tags: {}", e))?;
    let is_pinned_val = if input.is_pinned.unwrap_or(false) {
        1i64
    } else {
        0i64
    };
    let user_editable_val = if input.user_editable.unwrap_or(true) {
        1i64
    } else {
        0i64
    };
    let importance_val = input.importance.unwrap_or(3);
    let confidence_val = input.confidence.unwrap_or(0.5);
    let priority_val = input.priority.unwrap_or_else(|| {
        if input.is_pinned.unwrap_or(false) || importance_val >= 5 {
            "permanent".to_string()
        } else {
            "medium".to_string()
        }
    });
    let source_message_ids_json =
        serde_json::to_string(&input.source_message_ids.unwrap_or_default())
            .map_err(|e| format!("failed to serialize source_message_ids: {}", e))?;
    let use_count_val = input.use_count.unwrap_or(0);
    let content_val = input.content.unwrap_or_default();
    let summary_val = input.summary.unwrap_or_default();

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_node transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO memory_nodes
           (id, folder_id, file_id, project_id, conversation_id, title, content, summary,
            node_type, scope, tags, importance, confidence, priority, expires_at,
            source_message_ids, extraction_batch_id, duplicate_of, contradiction_of,
            origin, status,
            is_pinned, user_editable, created_at, updated_at, last_used_at, use_count)
         VALUES
            (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
        rusqlite::params![
            input.id,
            input.folder_id,
            input.file_id,
            input.project_id,
            input.conversation_id,
            input.title,
            content_val,
            summary_val,
            input.node_type,
            input.scope,
            tags_json,
            importance_val,
            confidence_val,
            priority_val,
            input.expires_at,
            source_message_ids_json,
            input.extraction_batch_id,
            input.duplicate_of,
            input.contradiction_of,
            input.origin,
            input.status,
            is_pinned_val,
            user_editable_val,
            input.created_at,
            input.updated_at,
            input.last_used_at,
            use_count_val,
        ],
    )
    .map_err(|e| format!("insert memory_node failed: {}", e))?;

    let created = tx
        .query_row(
            "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                    node_type, scope, tags, importance, confidence, priority, expires_at,
                    source_message_ids, extraction_batch_id, duplicate_of, contradiction_of,
                    origin, status,
                    is_pinned, user_editable, created_at, updated_at, last_used_at, use_count,
                    embedding_dim
             FROM memory_nodes WHERE id = ?1",
            [&input.id],
            row_to_node,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_node transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_node(conn: &Connection, input_json: String) -> Result<MemoryNodeRow, String> {
    let input: MemoryNodeUpdateInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_node input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_node requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.folder_id {
        sets.push(format!("folder_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.file_id {
        sets.push(format!("file_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.project_id {
        sets.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.conversation_id {
        sets.push(format!("conversation_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.title {
        sets.push(format!("title = ?{}", params.len() + 1));
        params.push(Value::Text(v));
        sets.push("embedding = NULL".to_string());
        sets.push("embedding_dim = NULL".to_string());
    }
    if let Some(v) = input.content {
        sets.push(format!("content = ?{}", params.len() + 1));
        params.push(Value::Text(v));
        // Content changed — clear stale embedding
        sets.push("embedding = NULL".to_string());
        sets.push("embedding_dim = NULL".to_string());
    }
    if let Some(v) = input.summary {
        sets.push(format!("summary = ?{}", params.len() + 1));
        params.push(Value::Text(v));
        sets.push("embedding = NULL".to_string());
        sets.push("embedding_dim = NULL".to_string());
    }
    if let Some(v) = input.node_type {
        sets.push(format!("node_type = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.scope {
        sets.push(format!("scope = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tags {
        let json =
            serde_json::to_string(&v).map_err(|e| format!("failed to serialize tags: {}", e))?;
        sets.push(format!("tags = ?{}", params.len() + 1));
        params.push(Value::Text(json));
        sets.push("embedding = NULL".to_string());
        sets.push("embedding_dim = NULL".to_string());
    }
    if let Some(v) = input.importance {
        sets.push(format!("importance = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.confidence {
        sets.push(format!("confidence = ?{}", params.len() + 1));
        params.push(Value::Real(v));
    }
    if let Some(v) = input.priority {
        sets.push(format!("priority = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.expires_at {
        sets.push(format!("expires_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.source_message_ids {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize source_message_ids: {}", e))?;
        sets.push(format!("source_message_ids = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.extraction_batch_id {
        sets.push(format!("extraction_batch_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.duplicate_of {
        sets.push(format!("duplicate_of = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.contradiction_of {
        sets.push(format!("contradiction_of = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.origin {
        sets.push(format!("origin = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.is_pinned {
        sets.push(format!("is_pinned = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.user_editable {
        sets.push(format!("user_editable = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.created_at {
        sets.push(format!("created_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.updated_at {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.last_used_at {
        sets.push(format!("last_used_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.use_count {
        sets.push(format!("use_count = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }

    if sets.is_empty() {
        return Err("update_node requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE memory_nodes SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update memory_node failed: {}", e))?;

    let updated = conn
        .query_row(
            "SELECT id, folder_id, file_id, project_id, conversation_id, title, content, summary,
                    node_type, scope, tags, importance, confidence, priority, expires_at,
                    source_message_ids, extraction_batch_id, duplicate_of, contradiction_of,
                    origin, status,
                    is_pinned, user_editable, created_at, updated_at, last_used_at, use_count,
                    embedding_dim
             FROM memory_nodes WHERE id = ?1",
            [&input.id],
            row_to_node,
        )
        .map_err(|e| format!("query after update failed: {}", e))?;

    Ok(updated)
}

pub fn delete_node(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM memory_nodes WHERE id = ?1", [&id])
        .map_err(|e| format!("delete memory_node failed: {}", e))?;
    Ok(())
}

pub fn archive_node(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute(
        "UPDATE memory_nodes SET status = 'archived' WHERE id = ?1",
        [&id],
    )
    .map_err(|e| format!("archive memory_node failed: {}", e))?;
    Ok(())
}

pub fn pin_node(conn: &Connection, id: String, pinned: bool) -> Result<(), String> {
    let value = if pinned { 1i64 } else { 0i64 };
    conn.execute(
        "UPDATE memory_nodes SET is_pinned = ?1 WHERE id = ?2",
        rusqlite::params![value, id],
    )
    .map_err(|e| format!("pin memory_node failed: {}", e))?;
    Ok(())
}
