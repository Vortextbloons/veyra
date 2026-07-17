use serde::{Deserialize, Serialize};

/// Configuration for the embedding endpoint (LM Studio / Ollama).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    pub endpoint_url: String,
    pub model: String,
}

#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

/// Probe common local embedding endpoints and return the first one that responds.
pub async fn detect_embedding_endpoint() -> Option<EmbeddingConfig> {
    let candidates = vec![
        ("http://localhost:1234/v1", "nomic-embed-text"),
        ("http://localhost:11434/v1", "nomic-embed-text"),
        ("http://localhost:8080/v1", "nomic-embed-text"),
    ];

    for (base_url, default_model) in candidates {
        let models_url = format!("{}/models", base_url);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_default();

        if let Ok(resp) = client.get(&models_url).send().await {
            if resp.status().is_success() {
                // Try to extract model name from response
                let model = if let Ok(body) = resp.json::<serde_json::Value>().await {
                    body.get("data")
                        .and_then(|d| d.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|m| m.get("id"))
                        .and_then(|id| id.as_str())
                        .unwrap_or(default_model)
                        .to_string()
                } else {
                    default_model.to_string()
                };

                return Some(EmbeddingConfig {
                    endpoint_url: base_url.to_string(),
                    model,
                });
            }
        }
    }
    None
}

async fn detect_model_for_endpoint(base_url: &str, default_model: &str) -> String {
    let models_url = format!("{}/models", base_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    if let Ok(resp) = client.get(&models_url).send().await {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                return body
                    .get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|m| m.get("id"))
                    .and_then(|id| id.as_str())
                    .unwrap_or(default_model)
                    .to_string();
            }
        }
    }

    default_model.to_string()
}

/// Resolve an embedding config from user settings or auto-detect a local default.
pub async fn resolve_embedding_config(
    endpoint_url: Option<String>,
    model: Option<String>,
) -> Option<EmbeddingConfig> {
    let endpoint_url = endpoint_url.unwrap_or_default().trim().to_string();
    let model = model.unwrap_or_default().trim().to_string();

    if !endpoint_url.is_empty() {
        let resolved_model = if !model.is_empty() {
            model
        } else {
            detect_model_for_endpoint(&endpoint_url, "nomic-embed-text").await
        };
        return Some(EmbeddingConfig {
            endpoint_url,
            model: resolved_model,
        });
    }

    detect_embedding_endpoint().await
}

/// Call the embedding endpoint to compute embeddings for texts.
/// Returns None if the endpoint is unreachable.
pub async fn embed_texts(
    config: &EmbeddingConfig,
    texts: &[String],
) -> Option<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Some(vec![]);
    }

    let url = format!("{}/embeddings", config.endpoint_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();

    let body = serde_json::json!({
        "input": texts,
        "model": config.model,
    });

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let embedding_resp: EmbeddingResponse = resp.json().await.ok()?;

    let data = embedding_resp.data;

    Some(data.into_iter().map(|d| d.embedding).collect())
}

/// Embed a single text and return the vector.
pub async fn embed_text(config: &EmbeddingConfig, text: &str) -> Option<Vec<f32>> {
    let results = embed_texts(config, &[text.to_string()]).await?;
    results.into_iter().next()
}

/// Serialize a float vector to bytes for SQLite BLOB storage.
pub fn vec_to_bytes(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for &f in v {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

/// Deserialize bytes from SQLite BLOB back to a float vector.
pub fn bytes_to_vec(b: &[u8], dim: usize) -> Option<Vec<f32>> {
    if b.len() != dim * 4 {
        return None;
    }
    let mut v = Vec::with_capacity(dim);
    for chunk in b.chunks_exact(4) {
        v.push(f32::from_le_bytes([
            chunk[0], chunk[1], chunk[2], chunk[3],
        ]));
    }
    Some(v)
}
