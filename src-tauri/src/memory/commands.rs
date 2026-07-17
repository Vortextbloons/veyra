use crate::memory::db::{self as memory_db, MemoryDbState};
use crate::memory::embedding;
use crate::memory::vector;
use crate::shared::db_utils::run_db_command;
use tauri::State;

#[tauri::command]
pub async fn list_memory_folders(
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFolderRow>, String> {
    run_db_command(state.inner(), "memory", |conn| {
        memory_db::list_folders(conn)
    })
    .await
}

#[tauri::command]
pub async fn list_memory_files(
    folder_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryFileRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_files(conn, folder_id)
    })
    .await
}

#[tauri::command]
pub async fn list_memory_nodes(
    filter: String,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_nodes(conn, filter)
    })
    .await
}

#[tauri::command]
pub async fn create_memory_node(
    input: String,
    vector_search_enabled: bool,
    endpoint_url: Option<String>,
    model: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    let node = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::create_node(conn, input)
    })
    .await?;

    if vector_search_enabled {
        if let Some(config) = embedding::resolve_embedding_config(endpoint_url, model).await {
            let text = format!(
                "{} {} {} {}",
                node.title,
                node.content,
                node.summary,
                node.tags.join(" ")
            );
            if let Some(embedding_vec) = embedding::embed_text(&config, &text).await {
                let node_id = node.id.clone();
                let _ = run_db_command(state.inner(), "memory", move |conn| {
                    memory_db::store_embedding(conn, &node_id, &embedding_vec)
                })
                .await;
            }
        }
    }

    Ok(node)
}

#[tauri::command]
pub async fn update_memory_node(
    input: String,
    vector_search_enabled: bool,
    endpoint_url: Option<String>,
    model: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::MemoryNodeRow, String> {
    let node = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::update_node(conn, input)
    })
    .await?;

    if vector_search_enabled {
        if let Some(config) = embedding::resolve_embedding_config(endpoint_url, model).await {
            let text = format!(
                "{} {} {} {}",
                node.title,
                node.content,
                node.summary,
                node.tags.join(" ")
            );
            if let Some(embedding_vec) = embedding::embed_text(&config, &text).await {
                let node_id = node.id.clone();
                let _ = run_db_command(state.inner(), "memory", move |conn| {
                    memory_db::store_embedding(conn, &node_id, &embedding_vec)
                })
                .await;
            }
        }
    }

    Ok(node)
}

#[tauri::command]
pub async fn delete_memory_node(id: String, state: State<'_, MemoryDbState>) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::delete_node(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn archive_memory_node(
    id: String,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::archive_node(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn pin_memory_node(
    id: String,
    pinned: bool,
    state: State<'_, MemoryDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::pin_node(conn, id, pinned)
    })
    .await
}

#[tauri::command]
pub async fn search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::MemoryNodeRow>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::search_nodes(conn, query, limit as i64, project_id)
    })
    .await
}

// ---------------------------------------------------------------------------
// Vector search & embedding commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn vector_search_memory(
    query: String,
    limit: u32,
    project_id: Option<String>,
    endpoint_url: Option<String>,
    model: Option<String>,
    vector_weight: f64,
    bm25_weight: f64,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::VectorSearchResult, String> {
    let config = embedding::resolve_embedding_config(endpoint_url, model).await;
    let query_vector = if let Some(config) = config.as_ref() {
        embedding::embed_text(config, &query).await
    } else {
        None
    };

    let pid_clone = project_id.clone();
    let project_id_filter_value = project_id.clone();
    let project_id_filter = project_id_filter_value.as_deref();
    let bm25_results = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::search_nodes(conn, query.clone(), limit as i64 * 3, project_id.clone())
    })
    .await?;

    let bm25_map: std::collections::HashMap<String, f64> = bm25_results
        .iter()
        .map(|node| (node.id.clone(), node.relevance_score.unwrap_or(0.0)))
        .collect();

    let (mut selected, query_vector_available): (Vec<(String, f64, f64)>, bool) =
        if let Some(query_embedding) = query_vector {
            let all_embeddings = run_db_command(state.inner(), "memory", move |conn| {
                memory_db::load_all_embeddings(conn, pid_clone)
            })
            .await?;

            let node_projects: Vec<(String, Option<String>)> = all_embeddings
                .iter()
                .map(|(id, _, proj)| (id.clone(), proj.clone()))
                .collect();
            let node_embs: Vec<(String, Vec<f32>)> = all_embeddings
                .into_iter()
                .map(|(id, emb, _)| (id, emb))
                .collect();

            let vector_results = vector::top_k_by_cosine(
                &node_embs,
                &query_embedding,
                &node_projects,
                project_id_filter,
                limit as usize * 3,
            );

            let vector_map: std::collections::HashMap<String, f64> = vector_results
                .iter()
                .map(|r| (r.id.clone(), r.vector_score as f64))
                .collect();

            let vector_signal_available = !vector_results.is_empty();
            let (effective_vector_weight, effective_bm25_weight) = if vector_signal_available {
                let sum = vector_weight + bm25_weight;
                if sum > 0.0 {
                    (vector_weight / sum, bm25_weight / sum)
                } else {
                    (0.0, 1.0)
                }
            } else {
                (0.0, 1.0)
            };

            let mut all_ids: std::collections::HashSet<String> = bm25_map.keys().cloned().collect();
            all_ids.extend(vector_map.keys().cloned());

            (
                all_ids
                    .into_iter()
                    .map(|id| {
                        let v_score = vector_map.get(&id).copied().unwrap_or(0.0);
                        let b_score = bm25_map.get(&id).copied().unwrap_or(0.0);
                        let hybrid = if vector_signal_available {
                            effective_vector_weight * v_score + effective_bm25_weight * b_score
                        } else {
                            b_score
                        };
                        (id, hybrid, v_score)
                    })
                    .collect(),
                vector_signal_available,
            )
        } else {
            (
                bm25_map
                    .iter()
                    .map(|(id, score)| (id.clone(), *score, 0.0))
                    .collect(),
                false,
            )
        };

    selected.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    selected.truncate(limit as usize);

    let selected_ids: Vec<String> = selected.iter().map(|(id, _, _)| id.clone()).collect();
    let selected_map: std::collections::HashMap<String, (f64, f64)> = selected
        .into_iter()
        .map(|(id, relevance, vector_score)| (id, (relevance, vector_score)))
        .collect();

    let all_nodes = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_nodes(conn, "{}".to_string())
    })
    .await?;

    let node_map: std::collections::HashMap<String, memory_db::MemoryNodeRow> = all_nodes
        .into_iter()
        .map(|node| (node.id.clone(), node))
        .collect();

    let mut nodes: Vec<memory_db::MemoryNodeRow> = Vec::new();
    for id in selected_ids {
        if let Some(mut node) = node_map.get(&id).cloned() {
            if let Some((relevance_score, vector_score)) = selected_map.get(&id) {
                node.relevance_score = Some(*relevance_score);
                if query_vector_available {
                    node.vector_score = Some(*vector_score);
                }
                node.bm25_score = bm25_map.get(&id).copied();
            }
            nodes.push(node);
        }
    }

    Ok(memory_db::VectorSearchResult {
        nodes,
        query_vector_available,
    })
}

#[tauri::command]
pub async fn compute_all_embeddings(
    endpoint_url: Option<String>,
    model: Option<String>,
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<i64, String> {
    let config = embedding::resolve_embedding_config(endpoint_url, model)
        .await
        .ok_or("No embedding endpoint available (LM Studio or Ollama must be running)")?;

    // 1. Get nodes that need embeddings
    let status = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::get_embedding_status(conn, project_id.clone())
    })
    .await?;

    if status.missing_ids.is_empty() {
        return Ok(0);
    }

    // 2. Fetch node content for missing embeddings
    let missing_ids = status.missing_ids.clone();
    let all_nodes = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::list_nodes(conn, "{}".to_string())
    })
    .await?;

    let nodes_to_embed: Vec<(String, String)> = all_nodes
        .into_iter()
        .filter(|n| missing_ids.contains(&n.id))
        .map(|n| {
            // Combine title, content, summary, and tags for embedding
            let text = format!(
                "{} {} {} {}",
                n.title,
                n.content,
                n.summary,
                n.tags.join(" ")
            );
            (n.id, text)
        })
        .collect();

    if nodes_to_embed.is_empty() {
        return Ok(0);
    }

    // 3. Compute embeddings in batches
    let batch_size = 32;
    let mut all_embeddings: Vec<(String, Vec<f32>)> = Vec::new();

    for chunk in nodes_to_embed.chunks(batch_size) {
        let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
        let embeddings = embedding::embed_texts(&config, &texts)
            .await
            .ok_or("Failed to compute embeddings for batch")?;

        for ((id, _), emb) in chunk.iter().zip(embeddings) {
            all_embeddings.push((id.clone(), emb));
        }
    }

    // 4. Store embeddings
    let count = run_db_command(state.inner(), "memory", move |conn| {
        memory_db::store_embeddings_batch(conn, &all_embeddings)
    })
    .await?;

    Ok(count)
}

#[tauri::command]
pub async fn get_embedding_memory_status(
    project_id: Option<String>,
    state: State<'_, MemoryDbState>,
) -> Result<memory_db::EmbeddingStatus, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::get_embedding_status(conn, project_id)
    })
    .await
}

#[tauri::command]
pub async fn find_duplicate_memory_nodes(
    threshold: f32,
    state: State<'_, MemoryDbState>,
) -> Result<Vec<memory_db::DuplicatePair>, String> {
    run_db_command(state.inner(), "memory", move |conn| {
        memory_db::find_duplicate_embeddings(conn, threshold)
    })
    .await
}
