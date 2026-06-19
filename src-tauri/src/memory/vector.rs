/// Cosine similarity between two vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

/// Normalize BM25 score (negative, lower = more relevant) to a 0-1 range.
/// BM25 scores from FTS5 are typically in the range -12 to 0.
pub fn normalize_bm25(bm25_raw: f64) -> f64 {
    // BM25 is negative; use sigmoid-like mapping to squeeze into 0-1.
    // -12 -> ~0.0, -6 -> ~0.002, -3 -> ~0.047, -1 -> ~0.19, 0 -> ~0.5
    let x = bm25_raw.min(0.0);
    1.0 / (1.0 + (-x).exp())
}

/// A scored node result from vector or hybrid search.
#[derive(Debug, Clone)]
pub struct ScoredNodeResult {
    pub id: String,
    pub vector_score: f32,
}

/// Find the top-k most similar nodes by cosine similarity.
/// `node_embeddings`: slice of (node_id, embedding_vector) pairs.
/// `query_embedding`: the query vector.
/// `project_filter`: optional project ID to filter by.
/// `node_projects`: slice of (node_id, project_id) pairs for filtering.
pub fn top_k_by_cosine(
    node_embeddings: &[(String, Vec<f32>)],
    query_embedding: &[f32],
    node_projects: &[(String, Option<String>)],
    project_filter: Option<&str>,
    k: usize,
) -> Vec<ScoredNodeResult> {
    let project_map: std::collections::HashMap<&str, Option<&str>> = node_projects
        .iter()
        .map(|(id, proj)| (id.as_str(), proj.as_deref()))
        .collect();

    let mut scored: Vec<ScoredNodeResult> = node_embeddings
        .iter()
        .filter(|(id, _)| {
            if let Some(pid) = project_filter {
                match project_map.get(id.as_str()) {
                    Some(Some(np)) => *np == pid,
                    Some(None) => true, // NULL project = global, always included
                    None => false,
                }
            } else {
                true
            }
        })
        .filter_map(|(id, emb)| {
            let sim = cosine_similarity(query_embedding, emb);
            if sim > 0.01 {
                Some(ScoredNodeResult {
                    id: id.clone(),
                    vector_score: sim,
                })
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| b.vector_score.partial_cmp(&a.vector_score).unwrap());
    scored.truncate(k);
    scored
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 0.001);

        let c = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &c)).abs() < 0.001);

        let d = vec![1.0, 1.0, 0.0];
        let expected = 1.0 / 2.0_f32.sqrt();
        assert!((cosine_similarity(&a, &d) - expected).abs() < 0.001);
    }

    #[test]
    fn test_normalize_bm25() {
        // BM25 = 0 (best match) -> ~0.5
        let s = normalize_bm25(0.0);
        assert!((s - 0.5).abs() < 0.01);

        // BM25 = -12 (poor match) -> close to 0
        let s = normalize_bm25(-12.0);
        assert!(s < 0.01);

        // BM25 = -3 (decent match) -> ~0.047
        let s = normalize_bm25(-3.0);
        assert!(s > 0.04 && s < 0.06);
    }
}
