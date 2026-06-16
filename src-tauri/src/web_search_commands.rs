use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::sync::LazyLock;
use std::time::Duration;

const MAX_SEARCH_RESULTS: usize = 10;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Veyra/0.1")
        .build()
        .expect("failed to build shared HTTP client")
});

static HTTP_CLIENT_SHORT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("Veyra/0.1")
        .build()
        .expect("failed to build shared HTTP client")
});

static ARXIV_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Veyra/0.1 (academic search)")
        .build()
        .expect("failed to build arxiv HTTP client")
});

static WIKIPEDIA_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Veyra/0.1 (encyclopedia search)")
        .build()
        .expect("failed to build wikipedia HTTP client")
});

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
/// Veyra's configured SearXNG instance is local-only. Enforce that at the
/// command boundary too; frontend checks are not a security boundary.
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

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host. A valid SearXNG URL is required.".to_string())?
        .to_lowercase();

    if !matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1") {
        return Err("SearXNG URL must point to localhost (127.0.0.1 or localhost).".into());
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
    allow_external: Option<bool>,
    time_range: Option<String>,
    categories: Option<String>,
    safe_search: Option<u8>,
    language: Option<String>,
) -> Result<TauriSearchResponse, String> {
    if allow_external == Some(false) {
        return Err("Web search is unavailable in Offline mode.".into());
    }

    validate_searxng_url(&base_url)?;

    let effective_limit = limit.clamp(1, MAX_SEARCH_RESULTS);

    let mut url = format!(
        "{}/search?q={}&format=json&pageno=1",
        base_url.trim_end_matches('/'),
        urlencoding::encode(&query)
    );

    if let Some(ref tr) = time_range {
        if !tr.is_empty() {
            url.push_str(&format!("&time_range={}", urlencoding::encode(tr)));
        }
    }
    if let Some(ref cats) = categories {
        if !cats.is_empty() {
            url.push_str(&format!("&categories={}", urlencoding::encode(cats)));
        }
    }
    if let Some(ss) = safe_search {
        url.push_str(&format!("&safesearch={}", ss.clamp(0, 2)));
    }
    if let Some(ref lang) = language {
        if !lang.is_empty() {
            url.push_str(&format!("&language={}", urlencoding::encode(lang)));
        }
    }

    let response = HTTP_CLIENT
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
                .take(effective_limit)
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
                    score: item.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0),
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

    let response = HTTP_CLIENT_SHORT
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

    let body: serde_json::Value = response.json().await.map_err(|_| {
        "SearXNG responded but did not return valid JSON. Ensure format=json is supported."
            .to_string()
    })?;

    if body.get("results").and_then(|r| r.as_array()).is_none() {
        return Err(
            "SearXNG responded with JSON but no results array. The instance may be misconfigured."
                .into(),
        );
    }

    Ok(true)
}

// ── ArXiv Search ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct ArxivResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub authors: String,
    pub published: String,
    pub updated: String,
    pub summary: String,
}

#[derive(Serialize, Deserialize)]
pub struct ArxivSearchResponse {
    pub query: String,
    pub results: Vec<ArxivResult>,
    pub result_count: usize,
}

fn parse_arxiv_xml_entry(entry_xml: &str) -> Option<ArxivResult> {
    let doc = quick_xml::Reader::from_str(entry_xml);
    let mut buf = Vec::new();
    let mut reader = doc;

    let mut id = String::new();
    let mut title = String::new();
    let mut summary = String::new();
    let mut authors: Vec<String> = Vec::new();
    let mut published = String::new();
    let mut updated = String::new();
    let mut in_tag: Option<String> = None;
    let mut in_author = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) | Ok(quick_xml::events::Event::Empty(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag.as_str() {
                    "id" => in_tag = Some("id".into()),
                    "title" => in_tag = Some("title".into()),
                    "summary" => in_tag = Some("summary".into()),
                    "published" => in_tag = Some("published".into()),
                    "updated" => in_tag = Some("updated".into()),
                    "author" => in_author = true,
                    "name" if in_author => in_tag = Some("name".into()),
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if tag == "author" {
                    in_author = false;
                }
                in_tag = None;
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if let Some(ref tag) = in_tag {
                    let text = e.unescape().unwrap_or_default().to_string();
                    match tag.as_str() {
                        "id" => id = text,
                        "title" => title = text,
                        "summary" => summary = text,
                        "published" => published = text,
                        "updated" => updated = text,
                        "name" if in_author => authors.push(text),
                        _ => {}
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    if id.is_empty() || title.is_empty() {
        return None;
    }

    // Clean up title (ArXiv titles often have newlines)
    let title = title.replace('\n', " ").trim().to_string();
    let summary = summary.replace('\n', " ").trim().to_string();
    let authors_str = authors.join(", ");

    // Build abstract snippet (first 300 chars of summary)
    let snippet = if summary.len() > 300 {
        format!("{}…", &summary[..300])
    } else {
        summary.clone()
    };

    Some(ArxivResult {
        id: id.clone(),
        title,
        url: id,
        snippet,
        authors: authors_str,
        published,
        updated,
        summary,
    })
}

#[tauri::command]
pub async fn search_arxiv(
    query: String,
    limit: usize,
) -> Result<ArxivSearchResponse, String> {
    let effective_limit = limit.clamp(1, MAX_SEARCH_RESULTS);

    let api_url = format!(
        "http://export.arxiv.org/api/query?search_query=all:{}&start=0&max_results={}&sortBy=relevance",
        urlencoding::encode(&query),
        effective_limit
    );

    let response = ARXIV_CLIENT
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("ArXiv API request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "ArXiv API returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let xml_body = response
        .text()
        .await
        .map_err(|e| format!("ArXiv API body read failed: {e}"))?;

    // Parse entries from the Atom feed
    let mut results: Vec<ArxivResult> = Vec::new();
    let mut remaining = xml_body.as_str();

    while let Some(entry_start) = remaining.find("<entry>") {
        let entry_end = remaining[entry_start..].find("</entry>").map(|e| entry_start + e + 8);
        if let Some(end) = entry_end {
            let entry_xml = &remaining[entry_start..end];
            if let Some(result) = parse_arxiv_xml_entry(entry_xml) {
                results.push(result);
            }
            remaining = &remaining[end..];
        } else {
            break;
        }
    }

    let result_count = results.len();
    Ok(ArxivSearchResponse {
        query,
        results,
        result_count,
    })
}

// ── Wikipedia Search ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct WikipediaResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub extract: String,
}

#[derive(Serialize, Deserialize)]
pub struct WikipediaSearchResponse {
    pub query: String,
    pub results: Vec<WikipediaResult>,
    pub result_count: usize,
}

#[tauri::command]
pub async fn search_wikipedia(
    query: String,
    limit: usize,
) -> Result<WikipediaSearchResponse, String> {
    let effective_limit = limit.clamp(1, MAX_SEARCH_RESULTS);

    // Step 1: Search for matching articles
    let search_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&srlimit={}&format=json",
        urlencoding::encode(&query),
        effective_limit
    );

    let search_response = WIKIPEDIA_CLIENT
        .get(&search_url)
        .send()
        .await
        .map_err(|e| format!("Wikipedia search API request failed: {e}"))?;

    if !search_response.status().is_success() {
        return Err(format!(
            "Wikipedia search API returned HTTP {}",
            search_response.status().as_u16()
        ));
    }

    let search_body: serde_json::Value = search_response
        .json()
        .await
        .map_err(|e| format!("Wikipedia search API JSON parse failed: {e}"))?;

    let search_results = search_body
        .get("query")
        .and_then(|q| q.get("search"))
        .and_then(|s| s.as_array())
        .ok_or_else(|| "Wikipedia search API returned unexpected format".to_string())?;

    let mut page_ids: Vec<(String, String, String)> = Vec::new(); // (pageid, title, snippet)
    for item in search_results.iter().take(effective_limit) {
        let pageid = item
            .get("pageid")
            .and_then(|p| p.as_u64())
            .map(|p| p.to_string())
            .unwrap_or_default();
        let title = item
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let snippet = item
            .get("snippet")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        if !pageid.is_empty() && !title.is_empty() {
            page_ids.push((pageid, title, snippet));
        }
    }

    if page_ids.is_empty() {
        return Ok(WikipediaSearchResponse {
            query,
            results: Vec::new(),
            result_count: 0,
        });
    }

    // Step 2: Get article extracts for the found pages
    let ids_str = page_ids.iter().map(|(id, _, _)| id.as_str()).collect::<Vec<_>>().join("|");
    let extract_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&pageids={}&format=json",
        ids_str
    );

    let extract_response = WIKIPEDIA_CLIENT
        .get(&extract_url)
        .send()
        .await
        .map_err(|e| format!("Wikipedia extract API request failed: {e}"))?;

    let extract_body: serde_json::Value = if extract_response.status().is_success() {
        extract_response
            .json()
            .await
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let pages = extract_body
        .get("query")
        .and_then(|q| q.get("pages"))
        .and_then(|p| p.as_object());

    let mut results: Vec<WikipediaResult> = Vec::new();
    for (pageid, title, search_snippet) in &page_ids {
        let extract = pages
            .and_then(|p| p.get(pageid))
            .and_then(|page| page.get("extract"))
            .and_then(|e| e.as_str())
            .unwrap_or("")
            .to_string();

        let clean_snippet = search_snippet
            .replace(|c: char| c == '<' || c == '>', "")
            .trim()
            .to_string();

        let url = format!(
            "https://en.wikipedia.org/wiki/{}",
            urlencoding::encode(&title.replace(' ', "_"))
        );

        results.push(WikipediaResult {
            id: format!("{:x}", simple_hash(&url)),
            title: title.clone(),
            url,
            snippet: clean_snippet,
            extract,
        });
    }

    let result_count = results.len();
    Ok(WikipediaSearchResponse {
        query,
        results,
        result_count,
    })
}
