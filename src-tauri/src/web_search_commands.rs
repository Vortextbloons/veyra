use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};

const MAX_SEARCH_RESULTS: usize = 10;

#[derive(Serialize, Deserialize)]
pub struct TauriSearchResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub engine: String,
    pub score: f64,
}

#[derive(Serialize, Deserialize)]
pub struct TauriSearchResponse {
    pub query: String,
    pub results: Vec<TauriSearchResult>,
    pub result_count: usize,
    pub searxng_url: String,
}

/// Validate a user-configured SearXNG base URL.
///
/// Unlike URLs fetched from search results (which must be public), the SearXNG
/// instance URL is explicitly chosen by the user and is commonly localhost or a
/// LAN address. We only reject truly dangerous schemes here.
fn validate_searxng_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;

    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "URL scheme '{other}' is not allowed. Use http or https."
            ));
        }
    }

    if parsed.host_str().is_none() {
        return Err("URL has no host. A valid SearXNG URL is required.".into());
    }

    Ok(())
}

fn simple_hash(s: &str) -> u64 {
    let mut hasher = std::hash::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

#[tauri::command]
pub async fn web_search_searxng(
    base_url: String,
    query: String,
    limit: usize,
) -> Result<TauriSearchResponse, String> {
    validate_searxng_url(&base_url)?;

    let url = format!(
        "{}/search?q={}&format=json&pageno=1",
        base_url.trim_end_matches('/'),
        urlencoding::encode(&query)
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Veyra/0.1")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SearXNG request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "SearXNG returned HTTP {}. Check your URL and ensure JSON output is enabled.",
            response.status().as_u16()
        ));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse SearXNG response as JSON: {e}"))?;

    let results = body
        .get("results")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .take(limit.clamp(1, MAX_SEARCH_RESULTS))
                .enumerate()
                .map(|(i, item)| TauriSearchResult {
                    id: item
                        .get("url")
                        .and_then(|u| u.as_str())
                        .map(|u| format!("{:x}", simple_hash(u)))
                        .unwrap_or_else(|| format!("result_{i}")),
                    title: item
                        .get("title")
                        .and_then(|t| t.as_str())
                        .unwrap_or("Untitled")
                        .to_string(),
                    url: item
                        .get("url")
                        .and_then(|u| u.as_str())
                        .unwrap_or("")
                        .to_string(),
                    snippet: item
                        .get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string(),
                    engine: item
                        .get("engine")
                        .and_then(|e| e.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    score: item
                        .get("score")
                        .and_then(|s| s.as_f64())
                        .unwrap_or(0.0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let result_count = results.len();

    Ok(TauriSearchResponse {
        query,
        result_count,
        searxng_url: base_url,
        results,
    })
}

#[tauri::command]
pub async fn test_searxng_connection(base_url: String) -> Result<bool, String> {
    validate_searxng_url(&base_url)?;

    let url = format!(
        "{}/search?q=test&format=json&pageno=1",
        base_url.trim_end_matches('/')
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("Veyra/0.1")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "SearXNG returned HTTP {}. The server is reachable but may not support JSON output.",
            response.status().as_u16()
        ));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "SearXNG responded but did not return valid JSON. Ensure format=json is supported.".to_string())?;

    if body.get("results").and_then(|r| r.as_array()).is_none() {
        return Err("SearXNG responded with JSON but no results array. The instance may be misconfigured.".into());
    }

    Ok(true)
}
