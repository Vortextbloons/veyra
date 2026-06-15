use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::sync::Semaphore;

use crate::web_fetch_cache;
use readability::extractor::extract as readability_extract;
use scraper::{Html, Selector};

#[derive(Serialize, Clone)]
pub struct FetchedPage {
    pub url: String,
    pub status: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub error_reason: Option<String>,
}

const USER_AGENT: &str = "Mozilla/5.0 (compatible; Veyra/0.1; +https://github.com/anomalyco/veyra)";
const MAX_BODY_BYTES: usize = 5_000_000;
const MIN_CONTENT_CHARS: usize = 200;

static FETCH_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .expect("failed to build fetch client")
});

#[derive(Deserialize)]
pub struct FetchRequest {
    pub url: String,
    pub timeout_secs: u64,
    pub max_chars: usize,
    pub cache_dir: PathBuf,
}

fn is_private_or_loopback(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link local
        }
    }
}

async fn ssrf_check(parsed: &url::Url) -> Result<(), String> {
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_loopback(ip) {
            return Err("URL points to a private or loopback address".into());
        }
        return Ok(());
    }

    let normalized = host.to_lowercase();
    if normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
        || normalized.ends_with(".internal")
    {
        return Err("URL points to a local hostname".into());
    }

    let port = parsed.port_or_known_default().unwrap_or(443);
    let addrs: Vec<IpAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("DNS resolution failed: {e}"))?
        .map(|sa| sa.ip())
        .collect();

    if addrs.is_empty() {
        return Err("DNS resolution returned no addresses".into());
    }

    for ip in &addrs {
        if is_private_or_loopback(*ip) {
            return Err("URL resolves to a private or loopback address".into());
        }
    }
    Ok(())
}

fn truncate_at_sentence_boundary(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let mut cut = max_chars;
    let window_start = cut.saturating_sub(200);
    let window = &text[window_start..cut.min(text.len())];
    if let Some(idx) = window.rfind(|c| c == '.' || c == '!' || c == '?') {
        cut = window_start + idx + 1;
    }
    text[..cut].to_string()
}

/// Fallback extraction using scraper (html5ever) when readability fails or
/// returns too little content. Pulls text from paragraphs, list items,
/// headings, and blockquotes, joined with double newlines.
fn extract_paragraphs_fallback(html: &str) -> String {
    let document = Html::parse_document(html);
    let sel = Selector::parse("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre")
        .expect("static selector must parse");
    let mut out = String::new();
    for element in document.select(&sel) {
        let text: String = element
            .text()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if text.len() >= 20 {
            if !out.is_empty() {
                out.push_str("\n\n");
            }
            out.push_str(&text);
        }
    }
    out
}

/// Last-resort regex extraction of <p> blocks when scraper yields nothing.
fn extract_paragraphs_regex(html: &str) -> String {
    let mut out = String::new();
    let lower = html.to_lowercase();
    let mut i = 0usize;
    while i < lower.len() {
        if let Some(pos) = find_subslice(lower.as_bytes()[i..].as_ref(), b"<p") {
            let abs = i + pos;
            if let Some(end_rel) = lower[abs..].find("</p>") {
                let block = &html[abs..abs + end_rel];
                let text: String = block
                    .split('<')
                    .skip(1)
                    .filter_map(|s| s.split_once('>').map(|(_, after)| after))
                    .collect::<Vec<_>>()
                    .join(" ");
                let cleaned: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
                if cleaned.len() >= 20 {
                    if !out.is_empty() {
                        out.push_str("\n\n");
                    }
                    out.push_str(&cleaned);
                }
                i = abs + end_rel + 4;
                continue;
            }
        }
        break;
    }
    out
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| format!("PDF extraction failed: {e}"))
}

async fn fetch_one(req: FetchRequest) -> FetchedPage {
    let url = req.url.clone();
    let max_chars = req.max_chars;

    if let Some(cached) = web_fetch_cache::read(&url, max_chars, &req.cache_dir) {
        if cached.status == "ok" {
            return FetchedPage {
                url: cached.url,
                status: cached.status,
                title: cached.title,
                content: cached.content,
                error_reason: None,
            };
        }
        if let Some(reason) = cached.error_reason.clone() {
            return FetchedPage {
                url,
                status: cached.status,
                title: None,
                content: None,
                error_reason: Some(reason),
            };
        }
    }

    let parsed = match url::Url::parse(&url) {
        Ok(p) => p,
        Err(e) => {
            return make_error_page(&url, max_chars, "invalid_url", &format!("Invalid URL: {e}"), &req.cache_dir)
        }
    };

    if let Err(reason) = ssrf_check(&parsed).await {
        return make_error_page(&url, max_chars, "ssrf_blocked", &reason, &req.cache_dir);
    }

    let timeout = Duration::from_secs(req.timeout_secs.clamp(2, 30));
    let response = match tokio::time::timeout(
        timeout,
        FETCH_CLIENT
            .get(parsed.clone())
            .timeout(timeout)
            .send(),
    )
    .await
    {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => {
            let reason = if e.is_timeout() {
                "Request timed out".to_string()
            } else {
                format!("Network error: {e}")
            };
            let status = if e.is_timeout() { "timeout" } else { "network" };
            return make_error_page(&url, max_chars, status, &reason, &req.cache_dir);
        }
        Err(_) => {
            return make_error_page(
                &url,
                max_chars,
                "timeout",
                &format!("Request timed out after {}s", req.timeout_secs),
                &req.cache_dir,
            );
        }
    };

    let http_status = response.status();
    if !http_status.is_success() {
        return make_error_page(
            &url,
            max_chars,
            "http",
            &format!("HTTP {}", http_status.as_u16()),
            &req.cache_dir,
        );
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let is_pdf = content_type.contains("application/pdf");
    if !content_type.is_empty()
        && !content_type.contains("text/html")
        && !content_type.contains("text/plain")
        && !content_type.contains("application/xhtml")
        && !content_type.contains("text/")
        && !is_pdf
    {
        return make_error_page(
            &url,
            max_chars,
            "unsupported",
            &format!("Unsupported content-type: {content_type}"),
            &req.cache_dir,
        );
    }

    let body_bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return make_error_page(&url, max_chars, "network", &format!("Failed to read body: {e}"), &req.cache_dir)
        }
    };

    if body_bytes.len() > MAX_BODY_BYTES {
        return make_error_page(
            &url,
            max_chars,
            "too_large",
            &format!("Response exceeds {} MB", MAX_BODY_BYTES / (1024 * 1024)),
            &req.cache_dir,
        );
    }

    if is_pdf {
        return handle_pdf(&url, &body_bytes, max_chars, &req.cache_dir);
    }

    let body = String::from_utf8_lossy(&body_bytes).to_string();

    // Primary extraction: readability
    let (primary_content, primary_title) = match readability_extract(&mut body.as_bytes(), &parsed) {
        Ok(p) if p.content.trim().len() >= MIN_CONTENT_CHARS => {
            (p.content, Some(p.title))
        }
        Ok(_) => {
            // Readability produced too little. Try fallback.
            let fallback = extract_paragraphs_fallback(&body);
            let fallback = if fallback.trim().len() >= MIN_CONTENT_CHARS {
                fallback
            } else {
                let regex = extract_paragraphs_regex(&body);
                if regex.trim().len() >= MIN_CONTENT_CHARS {
                    regex
                } else {
                    return make_error_page(
                        &url,
                        max_chars,
                        "extraction",
                        "Extraction returned too little content (likely a JS-only site)",
                        &req.cache_dir,
                    );
                }
            };
            (fallback, None)
        }
        Err(_) => {
            // Readability failed entirely. Try fallback.
            let fallback = extract_paragraphs_fallback(&body);
            let fallback = if fallback.trim().len() >= MIN_CONTENT_CHARS {
                fallback
            } else {
                let regex = extract_paragraphs_regex(&body);
                if regex.trim().len() >= MIN_CONTENT_CHARS {
                    regex
                } else {
                    return make_error_page(
                        &url,
                        max_chars,
                        "extraction",
                        "Extraction failed and no fallback content found",
                        &req.cache_dir,
                    );
                }
            };
            (fallback, None)
        }
    };

    let content_trimmed = primary_content.trim();
    let content = truncate_at_sentence_boundary(content_trimmed, max_chars);
    let title = primary_title.unwrap_or_else(|| url.clone());

    let entry = web_fetch_cache::CachedEntry {
        url: url.clone(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(&url, max_chars, &entry, &req.cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }

    FetchedPage {
        url,
        status: "ok".into(),
        title: Some(title),
        content: Some(content),
        error_reason: None,
    }
}

fn handle_pdf(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &PathBuf,
) -> FetchedPage {
    let text = match extract_pdf_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "PDF text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
    }
}

fn make_error_page(
    url: &str,
    max_chars: usize,
    status: &str,
    reason: &str,
    cache_dir: &PathBuf,
) -> FetchedPage {
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: status.to_string(),
        title: None,
        content: None,
        error_reason: Some(reason.to_string()),
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: status.to_string(),
        title: None,
        content: None,
        error_reason: Some(reason.to_string()),
    }
}

#[tauri::command]
pub async fn fetch_and_extract_pages(
    urls: Vec<String>,
    concurrency: usize,
    timeout_secs: u64,
    max_chars_per_source: usize,
    cache_dir: PathBuf,
) -> Result<Vec<FetchedPage>, String> {
    if cache_dir.as_os_str().is_empty() {
        return Err("Cache directory is required".into());
    }
    let sem_concurrency = concurrency.clamp(1, 16);
    let semaphore = std::sync::Arc::new(Semaphore::new(sem_concurrency));
    let max_chars = max_chars_per_source.clamp(500, 50_000);
    let timeout = timeout_secs.clamp(2, 30);

    let mut tasks = Vec::with_capacity(urls.len());
    for url in urls {
        let permit_source = semaphore.clone();
        let cache_dir = cache_dir.clone();
        tasks.push(tokio::spawn(async move {
            let _permit = permit_source.acquire_owned().await.ok()?;
            let req = FetchRequest {
                url,
                timeout_secs: timeout,
                max_chars,
                cache_dir,
            };
            Some(fetch_one(req).await)
        }));
    }

    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        match task.await {
            Ok(Some(page)) => results.push(page),
            Ok(None) => {}
            Err(e) => {
                return Err(format!("Fetch task failed: {e}"));
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn clear_web_fetch_cache(cache_dir: PathBuf) -> Result<(), String> {
    web_fetch_cache::clear(&cache_dir)
}

#[tauri::command]
pub fn get_web_fetch_cache_stats(cache_dir: PathBuf) -> Result<web_fetch_cache::CacheStats, String> {
    Ok(web_fetch_cache::stats(&cache_dir))
}
