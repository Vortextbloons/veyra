use rusqlite::{params, Connection};

use super::types::{DuplicatePair, EmbeddingStatus};
use crate::memory::embedding;

/// Store an embedding vector for a node.
pub fn store_embedding(conn: &Connection, node_id: &str, embedding: &[f32]) -> Result<(), String> {
    let bytes = embedding::vec_to_bytes(embedding);
    let dim = embedding.len() as i64;
    conn.execute(
        "UPDATE memory_nodes SET embedding = ?1, embedding_dim = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![bytes, dim, node_id],
    )
    .map_err(|e| format!("store_embedding failed: {}", e))?;
    Ok(())
}

/// Batch store embeddings for multiple nodes. Each entry is (node_id, embedding).
pub fn store_embeddings_batch(
    conn: &Connection,
    embeddings: &[(String, Vec<f32>)],
) -> Result<i64, String> {
    let mut updated = 0i64;
    for (node_id, emb) in embeddings {
        let bytes = embedding::vec_to_bytes(emb);
        let dim = emb.len() as i64;
        conn.execute(
            "UPDATE memory_nodes SET embedding = ?1, embedding_dim = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![bytes, dim, node_id],
        )
        .map_err(|e| format!("store_embeddings_batch failed for {}: {}", node_id, e))?;
        updated += 1;
    }
    Ok(updated)
}

/// Get embedding status: total nodes, embedded count, missing IDs.
pub fn get_embedding_status(
    conn: &Connection,
    project_id: Option<String>,
) -> Result<EmbeddingStatus, String> {
    let total;
    let embedded;
    let missing_ids;

    if let Some(pid) = project_id {
        total = conn
            .query_row(
                "SELECT COUNT(*) FROM memory_nodes WHERE status != 'archived' AND (project_id IS NULL OR project_id = ?1)",
                params![pid],
                |row| row.get(0),
            )
            .map_err(|e| format!("get_embedding_status count failed: {}", e))?;

        embedded = conn
            .query_row(
                "SELECT COUNT(*) FROM memory_nodes WHERE status != 'archived' AND embedding IS NOT NULL AND (project_id IS NULL OR project_id = ?1)",
                params![pid],
                |row| row.get(0),
            )
            .map_err(|e| format!("get_embedding_status embedded count failed: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id FROM memory_nodes WHERE status != 'archived' AND embedding IS NULL AND (project_id IS NULL OR project_id = ?1)",
            )
            .map_err(|e| format!("get_embedding_status prepare failed: {}", e))?;
        missing_ids = stmt
            .query_map(params![pid], |row| row.get(0))
            .map_err(|e| format!("get_embedding_status query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
    } else {
        total = conn
            .query_row(
                "SELECT COUNT(*) FROM memory_nodes WHERE status != 'archived'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("get_embedding_status count failed: {}", e))?;

        embedded = conn
            .query_row(
                "SELECT COUNT(*) FROM memory_nodes WHERE status != 'archived' AND embedding IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("get_embedding_status embedded count failed: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id FROM memory_nodes WHERE status != 'archived' AND embedding IS NULL")
            .map_err(|e| format!("get_embedding_status prepare failed: {}", e))?;
        missing_ids = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("get_embedding_status query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
    }

    Ok(EmbeddingStatus {
        total_nodes: total,
        embedded_count: embedded,
        missing_ids,
    })
}

/// Load all node IDs, embeddings, and projects for in-memory vector search.
pub fn load_all_embeddings(
    conn: &Connection,
    project_id: Option<String>,
) -> Result<Vec<(String, Vec<f32>, Option<String>)>, String> {
    let mut result = Vec::new();

    if let Some(pid) = project_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, embedding, embedding_dim, project_id FROM memory_nodes
                 WHERE status != 'archived' AND embedding IS NOT NULL AND (project_id IS NULL OR project_id = ?1)",
            )
            .map_err(|e| format!("load_all_embeddings prepare failed: {}", e))?;
        let rows = stmt
            .query_map(params![pid], |row| {
                let id: String = row.get("id")?;
                let embedding_blob: Vec<u8> = row.get("embedding")?;
                let dim: i64 = row.get("embedding_dim")?;
                let project_id: Option<String> = row.get("project_id")?;
                Ok((id, embedding_blob, dim as usize, project_id))
            })
            .map_err(|e| format!("load_all_embeddings query failed: {}", e))?;

        for row in rows {
            let (id, blob, dim, proj) =
                row.map_err(|e| format!("load_all_embeddings row error: {}", e))?;
            if let Some(vec) = embedding::bytes_to_vec(&blob, dim) {
                result.push((id, vec, proj));
            }
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, embedding, embedding_dim, project_id FROM memory_nodes
                 WHERE status != 'archived' AND embedding IS NOT NULL",
            )
            .map_err(|e| format!("load_all_embeddings prepare failed: {}", e))?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get("id")?;
                let embedding_blob: Vec<u8> = row.get("embedding")?;
                let dim: i64 = row.get("embedding_dim")?;
                let project_id: Option<String> = row.get("project_id")?;
                Ok((id, embedding_blob, dim as usize, project_id))
            })
            .map_err(|e| format!("load_all_embeddings query failed: {}", e))?;

        for row in rows {
            let (id, blob, dim, proj) =
                row.map_err(|e| format!("load_all_embeddings row error: {}", e))?;
            if let Some(vec) = embedding::bytes_to_vec(&blob, dim) {
                result.push((id, vec, proj));
            }
        }
    }

    Ok(result)
}

/// Find nodes with duplicate embeddings (cosine similarity > threshold).
pub fn find_duplicate_embeddings(
    conn: &Connection,
    threshold: f32,
) -> Result<Vec<DuplicatePair>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, embedding, embedding_dim FROM memory_nodes
             WHERE status != 'archived' AND embedding IS NOT NULL
             ORDER BY id",
        )
        .map_err(|e| format!("find_duplicate_embeddings prepare failed: {}", e))?;

    let rows: Vec<(String, Vec<f32>)> = stmt
        .query_map([], |row| {
            let id: String = row.get("id")?;
            let blob: Vec<u8> = row.get("embedding")?;
            let dim: i64 = row.get("embedding_dim")?;
            Ok((id, blob, dim as usize))
        })
        .map_err(|e| format!("find_duplicate_embeddings query failed: {}", e))?
        .filter_map(|r| r.ok())
        .filter_map(|(id, blob, dim)| embedding::bytes_to_vec(&blob, dim).map(|v| (id, v)))
        .collect();

    let mut duplicates = Vec::new();
    for i in 0..rows.len() {
        for j in (i + 1)..rows.len() {
            let sim = crate::memory::vector::cosine_similarity(&rows[i].1, &rows[j].1);
            if sim >= threshold {
                duplicates.push(DuplicatePair {
                    node_a_id: rows[i].0.clone(),
                    node_b_id: rows[j].0.clone(),
                    similarity: sim,
                });
            }
        }
    }
    Ok(duplicates)
}
