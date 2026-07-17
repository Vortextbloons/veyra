use crate::web_search::fetch_cache;
use crate::web_search::fetch_html::{extract_text_from_html_body, strip_html_to_text};
use crate::web_search::fetch_types::{
    FetchedPage, FETCH_CLIENT, MIN_CONTENT_CHARS, YOUTUBE_CACHE_TTL_SECS,
};
use crate::web_search::fetch_utils::{transient_error_page, truncate_at_sentence_boundary};
use std::time::Duration;

pub(crate) fn is_qwen_ai_blog_url(parsed: &url::Url) -> bool {
    let host = parsed
        .host_str()
        .map(|h| h.to_lowercase())
        .unwrap_or_default();
    matches!(host.as_str(), "qwen.ai" | "www.qwen.ai") && parsed.path().starts_with("/blog")
}

fn extract_qwen_blog_id(parsed: &url::Url) -> Option<String> {
    for (key, value) in parsed.query_pairs() {
        if key == "id" && !value.is_empty() {
            return Some(value.into_owned());
        }
    }
    let slug = parsed.path().strip_prefix("/blog")?.trim_start_matches('/');
    if slug.is_empty() {
        return None;
    }
    Some(slug.split('/').next().unwrap_or("").to_string())
}

fn qwen_article_id_variants(id: &str) -> Vec<String> {
    let mut variants = vec![id.to_string()];
    let dotted = id.replace('-', ".");
    if dotted != id {
        variants.push(dotted);
    }
    let dashed = id.replace('.', "-");
    if dashed != id {
        variants.push(dashed);
    }
    if let Some(stripped) = id.strip_suffix("-plus") {
        let normalized = stripped.replace('-', ".");
        if !variants.iter().any(|v| v == &normalized) {
            variants.push(normalized);
        }
    }
    variants
}

fn random_request_id() -> String {
    let mut bytes = [0u8; 16];
    let _ = getrandom::fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

async fn fetch_qwen_v2_article(article_id: &str) -> Result<(String, String), String> {
    let request_id = random_request_id();
    let api_url = format!(
        "https://qwen.ai/api/v2/article/?language=en-US&path={}&type=qwen_ai",
        url::form_urlencoded::byte_serialize(article_id.as_bytes()).collect::<String>()
    );
    let response = FETCH_CLIENT
        .get(&api_url)
        .header("Accept", "application/json")
        .header("X-Request-Id", request_id)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Qwen article API request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Qwen article API returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Qwen article API JSON parse failed: {e}"))?;

    let data = payload
        .get("data")
        .ok_or_else(|| "Qwen article API missing data".to_string())?;
    let title = data
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let content = data
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if content.len() < MIN_CONTENT_CHARS {
        return Err("Qwen article API returned empty content".into());
    }

    Ok((title, content))
}

async fn fetch_qwen_page_config_article(article_id: &str) -> Result<(String, String), String> {
    let request_id = random_request_id();
    let api_url = format!(
        "https://qwen.ai/api/page_config?id={}&code=research.research-list",
        url::form_urlencoded::byte_serialize(article_id.as_bytes()).collect::<String>()
    );
    let response = FETCH_CLIENT
        .get(&api_url)
        .header("Accept", "application/json")
        .header("X-Request-Id", request_id)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Qwen page_config request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Qwen page_config returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let items: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Qwen page_config JSON parse failed: {e}"))?;

    let item = items
        .iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some(article_id))
        .ok_or_else(|| "Article not found in Qwen research list".to_string())?;

    let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(article_id)
        .to_string();
    let description = item
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let introduction = item
        .get("introduction")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut parts: Vec<String> = Vec::new();
    if !description.trim().is_empty() {
        parts.push(strip_html_to_text(description));
    }
    if !introduction.trim().is_empty() {
        parts.push(strip_html_to_text(introduction));
    }
    let content = parts.join("\n\n").trim().to_string();
    if content.len() < MIN_CONTENT_CHARS {
        return Err("Qwen page_config article content is too short".into());
    }

    Ok((title, content))
}

async fn fetch_qwen_ai_blog_article(article_id: &str) -> Result<(String, String), String> {
    let mut last_err = String::from("No Qwen article API candidates");
    for candidate in qwen_article_id_variants(article_id) {
        match fetch_qwen_v2_article(&candidate).await {
            Ok(result) => return Ok(result),
            Err(e) => last_err = e,
        }
    }
    for candidate in qwen_article_id_variants(article_id) {
        match fetch_qwen_page_config_article(&candidate).await {
            Ok(result) => return Ok(result),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

pub(crate) async fn handle_qwen_ai_blog(
    url: &str,
    parsed: &url::Url,
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    if let Some(cached) = fetch_cache::read(url, max_chars, cache_dir) {
        if cached.status == "ok" {
            return FetchedPage {
                url: cached.url,
                status: cached.status,
                title: cached.title,
                content: cached.content,
                error_reason: None,
                source_type: Some("webpage".into()),
                extraction_method: Some("qwen_api".into()),
                via_wayback: None,
                char_count: None,
            };
        }
    }

    let fail = |status: &str, reason: &str| transient_error_page(url, status, reason);

    let article_id = match extract_qwen_blog_id(parsed) {
        Some(id) if !id.is_empty() => id,
        _ => {
            return fail(
                "invalid_url",
                "Could not extract Qwen blog article id from URL",
            );
        }
    };

    let (api_title, html_content) = match fetch_qwen_ai_blog_article(&article_id).await {
        Ok(result) => result,
        Err(reason) => {
            let status = if reason.contains("timed out") || reason.contains("timeout") {
                "timeout"
            } else if reason.contains("HTTP") {
                "http"
            } else if reason.contains("request failed") {
                "network"
            } else {
                "extraction"
            };
            return fail(status, &reason);
        }
    };

    let parsed_api = url::Url::parse("https://qwen.ai/").unwrap_or_else(|_| parsed.clone());
    let (content, extracted_title) = match extract_text_from_html_body(&html_content, &parsed_api) {
        Ok(result) => result,
        Err(_) => {
            let plain = strip_html_to_text(&html_content);
            if plain.len() < MIN_CONTENT_CHARS {
                return fail(
                    "extraction",
                    "Qwen article content could not be extracted to readable text",
                );
            }
            (plain, None)
        }
    };

    let title = extracted_title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(api_title);
    let content = truncate_at_sentence_boundary(content.trim(), max_chars);

    let entry = fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: fetch_cache::now_unix_static(),
        ttl_secs: YOUTUBE_CACHE_TTL_SECS,
        status: "ok".into(),
        title: Some(title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] qwen cache write failed: {e}");
    }

    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(title),
        content: Some(content),
        error_reason: None,
        source_type: Some("webpage".into()),
        extraction_method: Some("qwen_api".into()),
        via_wayback: None,
        char_count: None,
    }
}
