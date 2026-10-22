use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;
use tokio::sync::Semaphore;
use tokio::time::sleep;

use crate::web_search::fetch_cache;
use crate::web_search::fetch_documents::{
    fetch_office_document, handle_epub, handle_pdf, is_epub_url, is_office_url,
};
use crate::web_search::fetch_html::extract_text_from_html_body;
use crate::web_search::fetch_qwen::{handle_qwen_ai_blog, is_qwen_ai_blog_url};
use crate::web_search::fetch_security::ssrf_check;
use crate::web_search::fetch_types::{FetchRequest, FetchedPage, FETCH_CLIENT, MAX_BODY_BYTES};
use crate::web_search::fetch_utils::{
    contains_ole_compound_signature, is_epub_content_type, is_low_quality_extracted_text,
    is_office_content_type, is_zip_archive, make_error_page, run_blocking_extraction,
    transient_error_page, truncate_at_sentence_boundary,
};
use crate::web_search::fetch_wayback::try_wayback_fallback;
use crate::web_search::fetch_youtube::{handle_youtube, is_youtube_url};

const FETCH_MAX_ATTEMPTS: u32 = 2;
const FETCH_MAX_REDIRECTS: usize = 5;
/// Extra wall-clock allowance on top of the per-page timeout before the whole
/// batch gives up on a page (covers redirect hops and Wayback recovery).
const FETCH_BUDGET_GRACE_SECS: u64 = 4;

fn validate_cache_dir(cache_dir: &std::path::Path, app: &tauri::AppHandle) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let app_data_canonical = std::fs::canonicalize(&app_data)
        .map_err(|e| format!("failed to canonicalize app data dir: {e}"))?;
    let cache_canonical = std::fs::canonicalize(cache_dir)
        .map_err(|e| format!("cache directory does not exist: {e}"))?;
    if !cache_canonical.starts_with(&app_data_canonical) {
        return Err("cache directory must be inside the app data directory".into());
    }
    Ok(())
}

fn fetch_retry_delay(attempt: u32, retry_after: Option<Duration>) -> Duration {
    retry_after.unwrap_or_else(|| Duration::from_millis(300 * u64::from(attempt.min(3)) + 300))
}

#[derive(Debug)]
struct FetchFailure {
    status: &'static str,
    reason: String,
    retryable: bool,
    retry_after: Option<Duration>,
}

impl FetchFailure {
    fn new(status: &'static str, reason: impl Into<String>, retryable: bool) -> Self {
        Self {
            status,
            reason: reason.into(),
            retryable,
            retry_after: None,
        }
    }
}

fn remaining_budget(deadline: Option<Instant>) -> Option<Duration> {
    deadline.map(|deadline| deadline.saturating_duration_since(Instant::now()))
}

/// Resolve a `Location` header against the URL that produced it.
fn resolve_redirect_target(current: &url::Url, location: &str) -> Result<url::Url, FetchFailure> {
    let next = current.join(location).map_err(|error| {
        FetchFailure::new("http", format!("Invalid redirect target: {error}"), false)
    })?;
    if !matches!(next.scheme(), "http" | "https") {
        return Err(FetchFailure::new(
            "ssrf_blocked",
            format!("Redirect to unsupported scheme: {}", next.scheme()),
            false,
        ));
    }
    Ok(next)
}

/// GET a URL, following redirects manually so every hop can be SSRF-checked.
/// Returns the final response together with the URL it was served from.
async fn fetch_following_redirects(
    start: &url::Url,
    timeout: Duration,
    deadline: Option<Instant>,
) -> Result<(reqwest::Response, url::Url), FetchFailure> {
    let mut current = start.clone();

    for _ in 0..=FETCH_MAX_REDIRECTS {
        let effective = match remaining_budget(deadline) {
            Some(remaining) => {
                if remaining < Duration::from_millis(150) {
                    return Err(FetchFailure::new(
                        "timeout",
                        "Fetch time budget exhausted",
                        false,
                    ));
                }
                remaining.min(timeout)
            }
            None => timeout,
        };

        let response = match tokio::time::timeout(
            effective,
            FETCH_CLIENT.get(current.clone()).timeout(effective).send(),
        )
        .await
        {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                let (status, reason) = if error.is_timeout() {
                    ("timeout", "Request timed out".to_string())
                } else {
                    ("network", format!("Network error: {error}"))
                };
                return Err(FetchFailure::new(status, reason, status == "network"));
            }
            Err(_) => {
                return Err(FetchFailure::new(
                    "timeout",
                    format!("Request timed out after {}s", effective.as_secs().max(1)),
                    false,
                ))
            }
        };

        let status = response.status();
        if status.is_success() {
            return Ok((response, current));
        }

        if status.is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let Some(location) = location else {
                return Err(FetchFailure::new(
                    "http",
                    format!("HTTP {} without a Location header", status.as_u16()),
                    false,
                ));
            };
            let next = resolve_redirect_target(&current, location)?;
            if let Err(reason) = ssrf_check(&next).await {
                return Err(FetchFailure::new("ssrf_blocked", reason, false));
            }
            current = next;
            continue;
        }

        let retryable =
            status.as_u16() == 429 || status.as_u16() == 408 || status.is_server_error();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .map(Duration::from_secs);
        let mut failure = FetchFailure::new("http", format!("HTTP {}", status.as_u16()), retryable);
        failure.retry_after = retry_after;
        return Err(failure);
    }

    Err(FetchFailure::new(
        "http",
        format!("Too many redirects (more than {FETCH_MAX_REDIRECTS})"),
        false,
    ))
}

/// Wayback recovery, only when enabled and when enough budget remains to be useful.
async fn recover_with_wayback(req: &FetchRequest) -> Option<FetchedPage> {
    if !req.wayback_fallback_enabled {
        return None;
    }
    if let Some(remaining) = remaining_budget(req.deadline) {
        if remaining < Duration::from_millis(1_200) {
            return None;
        }
    }
    try_wayback_fallback(&req.url, req.max_chars, &req.cache_dir).await
}

async fn fetch_one(req: FetchRequest) -> FetchedPage {
    let url = req.url.clone();
    let max_chars = req.max_chars;

    let parsed = match url::Url::parse(&url) {
        Ok(p) => p,
        Err(e) => {
            return make_error_page(
                &url,
                max_chars,
                "invalid_url",
                &format!("Invalid URL: {e}"),
                &req.cache_dir,
            )
        }
    };

    let youtube_url = is_youtube_url(&parsed);
    let qwen_blog_url = is_qwen_ai_blog_url(&parsed);

    if let Some(cached) = fetch_cache::read(&url, max_chars, &req.cache_dir) {
        if cached.status == "ok" {
            return FetchedPage {
                url: cached.url,
                status: cached.status,
                title: cached.title,
                content: cached.content,
                error_reason: None,
                source_type: None,
                extraction_method: None,
                via_wayback: None,
                char_count: None,
            };
        }
        // Handler-specific errors are not served from cache so upgrades can retry.
        if !youtube_url && !qwen_blog_url {
            if let Some(reason) = cached.error_reason.clone() {
                return FetchedPage {
                    url: url.clone(),
                    status: cached.status,
                    title: None,
                    content: None,
                    error_reason: Some(reason),
                    source_type: None,
                    extraction_method: None,
                    via_wayback: None,
                    char_count: None,
                };
            }
        }
    }

    if let Err(reason) = ssrf_check(&parsed).await {
        return make_error_page(&url, max_chars, "ssrf_blocked", &reason, &req.cache_dir);
    }
    if youtube_url {
        if !req.advanced_search_bundle_enabled {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Advanced Search Bundle is disabled (YouTube transcripts unavailable)",
                &req.cache_dir,
            );
        }
        return handle_youtube(&url, max_chars, &req.cache_dir).await;
    }

    if is_qwen_ai_blog_url(&parsed) {
        return handle_qwen_ai_blog(&url, &parsed, max_chars, &req.cache_dir).await;
    }

    let timeout = Duration::from_secs(req.timeout_secs.clamp(2, 30));

    let mut attempt = 0u32;
    let fetched = loop {
        let attempt_timeout = match remaining_budget(req.deadline) {
            Some(remaining) => {
                if remaining < Duration::from_millis(200) {
                    break Err(FetchFailure::new(
                        "timeout",
                        "Fetch time budget exhausted",
                        false,
                    ));
                }
                remaining.min(timeout)
            }
            None => timeout,
        };

        match fetch_following_redirects(&parsed, attempt_timeout, req.deadline).await {
            Ok(response) => break Ok(response),
            Err(failure) => {
                let budget_left = remaining_budget(req.deadline)
                    .map(|remaining| remaining > Duration::from_secs(1))
                    .unwrap_or(true);
                if failure.retryable && attempt + 1 < FETCH_MAX_ATTEMPTS && budget_left {
                    let delay =
                        fetch_retry_delay(attempt, failure.retry_after).min(Duration::from_secs(1));
                    attempt += 1;
                    sleep(delay).await;
                    continue;
                }
                break Err(failure);
            }
        }
    };

    let (response, final_url) = match fetched {
        Ok(fetched) => fetched,
        Err(failure) => {
            if let Some(recovered) = recover_with_wayback(&req).await {
                return recovered;
            }
            return make_error_page(
                &url,
                max_chars,
                failure.status,
                &failure.reason,
                &req.cache_dir,
            );
        }
    };

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
            return make_error_page(
                &url,
                max_chars,
                "network",
                &format!("Failed to read body: {e}"),
                &req.cache_dir,
            )
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
        if !req.advanced_search_bundle_enabled {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Advanced Search Bundle is disabled (PDF extraction unavailable)",
                &req.cache_dir,
            );
        }
        let result = run_blocking_extraction(&url, {
            let url = url.clone();
            let body_bytes = body_bytes.to_vec();
            let cache_dir = req.cache_dir.clone();
            move || handle_pdf(&url, &body_bytes, max_chars, &cache_dir)
        })
        .await;
        if result.status == "ok" {
            return result;
        }
        // PDF extraction failed — try Wayback fallback
        if let Some(recovered) = recover_with_wayback(&req).await {
            return recovered;
        }
        return result;
    }

    // Detect Office documents by content-type or URL extension
    let is_office = is_office_content_type(&content_type) || is_office_url(&url);
    if is_office {
        if !req.advanced_search_bundle_enabled {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Advanced Search Bundle is disabled (Office document extraction unavailable)",
                &req.cache_dir,
            );
        }
        let result = run_blocking_extraction(&url, {
            let url = url.clone();
            let body_bytes = body_bytes.to_vec();
            let cache_dir = req.cache_dir.clone();
            move || fetch_office_document(&url, &body_bytes, max_chars, &cache_dir)
        })
        .await;
        if result.status == "ok" {
            return result;
        }
        if let Some(recovered) = recover_with_wayback(&req).await {
            return recovered;
        }
        return result;
    }

    // Detect EPUB by content-type or URL extension
    let is_epub = is_epub_content_type(&content_type) || is_epub_url(&url);
    if is_epub {
        if !req.advanced_search_bundle_enabled {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Advanced Search Bundle is disabled (EPUB extraction unavailable)",
                &req.cache_dir,
            );
        }
        let result = run_blocking_extraction(&url, {
            let url = url.clone();
            let body_bytes = body_bytes.to_vec();
            let cache_dir = req.cache_dir.clone();
            move || handle_epub(&url, &body_bytes, max_chars, &cache_dir)
        })
        .await;
        if result.status == "ok" {
            return result;
        }
        if let Some(recovered) = recover_with_wayback(&req).await {
            return recovered;
        }
        return result;
    }

    // Some servers mislabel PDF/Office payloads as HTML or wrap them in a minimal HTML shell.
    if body_bytes.len() >= 4 && &body_bytes[0..4] == b"%PDF" {
        if req.advanced_search_bundle_enabled {
            let result = run_blocking_extraction(&url, {
                let url = url.clone();
                let body_bytes = body_bytes.to_vec();
                let cache_dir = req.cache_dir.clone();
                move || handle_pdf(&url, &body_bytes, max_chars, &cache_dir)
            })
            .await;
            if result.status == "ok" {
                return result;
            }
            if let Some(recovered) = recover_with_wayback(&req).await {
                return recovered;
            }
            return result;
        }
        return make_error_page(
            &url,
            max_chars,
            "extraction",
            "Advanced Search Bundle is disabled (PDF extraction unavailable)",
            &req.cache_dir,
        );
    }

    if contains_ole_compound_signature(&body_bytes) || is_zip_archive(&body_bytes) {
        if req.advanced_search_bundle_enabled {
            let result = run_blocking_extraction(&url, {
                let url = url.clone();
                let body_bytes = body_bytes.to_vec();
                let cache_dir = req.cache_dir.clone();
                move || fetch_office_document(&url, &body_bytes, max_chars, &cache_dir)
            })
            .await;
            if result.status == "ok" {
                return result;
            }
            if let Some(recovered) = recover_with_wayback(&req).await {
                return recovered;
            }
            return result;
        }
        return make_error_page(
            &url,
            max_chars,
            "extraction",
            "Advanced Search Bundle is disabled (Office document extraction unavailable)",
            &req.cache_dir,
        );
    }

    // Offload CPU-heavy DOM parsing (readability + scraper) to a blocking thread.
    let body = String::from_utf8_lossy(&body_bytes).to_string();
    let extraction_result = run_blocking_extraction(&url, {
        let url = url.clone();
        let body = body.clone();
        let parsed_url = final_url.clone();
        move || match extract_text_from_html_body(&body, &parsed_url) {
            Ok((content, title)) => FetchedPage {
                url,
                status: "ok".into(),
                title,
                content: Some(content),
                error_reason: None,
                source_type: Some("webpage".into()),
                extraction_method: Some("readability".into()),
                via_wayback: None,
                char_count: None,
            },
            Err(reason) => FetchedPage {
                url,
                status: "extraction".into(),
                title: None,
                content: None,
                error_reason: Some(reason.to_string()),
                source_type: None,
                extraction_method: None,
                via_wayback: None,
                char_count: None,
            },
        }
    })
    .await;

    if extraction_result.status != "ok" {
        if let Some(recovered) = recover_with_wayback(&req).await {
            return recovered;
        }
        let reason = extraction_result
            .error_reason
            .unwrap_or_else(|| "HTML extraction failed".into());
        return make_error_page(&url, max_chars, "extraction", &reason, &req.cache_dir);
    }

    let primary_content = extraction_result.content.unwrap_or_default();
    let primary_title = extraction_result.title;

    let content_trimmed = primary_content.trim();
    if is_low_quality_extracted_text(content_trimmed) {
        if let Some(recovered) = recover_with_wayback(&req).await {
            return recovered;
        }
        return make_error_page(
            &url,
            max_chars,
            "extraction",
            "Extraction returned binary or garbled content (likely a mislabeled document download)",
            &req.cache_dir,
        );
    }

    let content = truncate_at_sentence_boundary(content_trimmed, max_chars);
    let title = primary_title.unwrap_or_else(|| url.clone());

    let entry = fetch_cache::CachedEntry {
        url: url.clone(),
        fetched_at_unix: fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = fetch_cache::write(&url, max_chars, &entry, &req.cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }

    FetchedPage {
        url,
        status: "ok".into(),
        title: Some(title),
        content: Some(content),
        error_reason: None,
        source_type: Some("webpage".into()),
        extraction_method: Some("readability".into()),
        via_wayback: None,
        char_count: None,
    }
}

#[tauri::command]
pub async fn fetch_and_extract_pages(
    app: tauri::AppHandle,
    urls: Vec<String>,
    concurrency: usize,
    timeout_secs: u64,
    max_chars_per_source: usize,
    cache_dir: PathBuf,
    advanced_search_bundle_enabled: Option<bool>,
    wayback_fallback_enabled: Option<bool>,
) -> Result<Vec<FetchedPage>, String> {
    if cache_dir.as_os_str().is_empty() {
        return Err("Cache directory is required".into());
    }
    validate_cache_dir(&cache_dir, &app)?;
    let sem_concurrency = concurrency.clamp(1, 16);
    let semaphore = std::sync::Arc::new(Semaphore::new(sem_concurrency));
    let max_chars = max_chars_per_source.clamp(500, 50_000);
    let timeout = timeout_secs.clamp(2, 30);
    let bundle_enabled = advanced_search_bundle_enabled.unwrap_or(true);
    let wayback_enabled = wayback_fallback_enabled.unwrap_or(true);
    // One shared wall-clock budget keeps a single dead host from stalling the
    // whole batch: retries, redirect hops and Wayback recovery all share it.
    let deadline = Instant::now() + Duration::from_secs(timeout + FETCH_BUDGET_GRACE_SECS);

    let mut tasks = Vec::with_capacity(urls.len());
    for url in urls {
        let permit_source = semaphore.clone();
        let cache_dir = cache_dir.clone();
        let url_for_error = url.clone();
        let handle = tokio::spawn(async move {
            let _permit = permit_source.acquire_owned().await.ok()?;
            let req = FetchRequest {
                url: url.clone(),
                timeout_secs: timeout,
                max_chars,
                cache_dir,
                advanced_search_bundle_enabled: bundle_enabled,
                wayback_fallback_enabled: wayback_enabled,
                deadline: Some(deadline),
            };
            // Hard stop for the page, including extraction work that the network
            // deadline does not cover.
            let budget = deadline
                .saturating_duration_since(Instant::now())
                .max(Duration::from_millis(1_500));
            match tokio::time::timeout(budget, fetch_one(req)).await {
                Ok(page) => Some(page),
                Err(_) => Some(transient_error_page(
                    &url,
                    "timeout",
                    "Fetch budget exhausted",
                )),
            }
        });
        tasks.push((url_for_error, handle));
    }

    let mut results = Vec::with_capacity(tasks.len());
    for (url, task) in tasks {
        match task.await {
            Ok(Some(page)) => results.push(page),
            Ok(None) => {}
            Err(e) if e.is_panic() => {
                eprintln!("[web_fetch] fetch panicked for {url}: {e}");
                results.push(make_error_page(
                    &url,
                    max_chars,
                    "extraction",
                    "Page extraction failed unexpectedly",
                    &cache_dir,
                ));
            }
            Err(e) => {
                return Err(format!("Fetch task failed: {e}"));
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn clear_web_fetch_cache(app: tauri::AppHandle, cache_dir: PathBuf) -> Result<(), String> {
    validate_cache_dir(&cache_dir, &app)?;
    fetch_cache::clear(&cache_dir)
}

#[tauri::command]
pub fn get_web_fetch_cache_stats(
    app: tauri::AppHandle,
    cache_dir: PathBuf,
) -> Result<fetch_cache::CacheStats, String> {
    validate_cache_dir(&cache_dir, &app)?;
    Ok(fetch_cache::stats(&cache_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(url: &str, wayback: bool, deadline: Option<Instant>) -> FetchRequest {
        FetchRequest {
            url: url.to_string(),
            timeout_secs: 8,
            max_chars: 8000,
            cache_dir: std::env::temp_dir(),
            advanced_search_bundle_enabled: true,
            wayback_fallback_enabled: wayback,
            deadline,
        }
    }

    #[test]
    fn resolves_relative_and_absolute_redirects() {
        let base = url::Url::parse("http://example.com/a/b").unwrap();
        let relative = resolve_redirect_target(&base, "../c").unwrap();
        assert_eq!(relative.as_str(), "http://example.com/c");

        let absolute = resolve_redirect_target(&base, "https://other.test/x").unwrap();
        assert_eq!(absolute.as_str(), "https://other.test/x");
    }

    #[test]
    fn rejects_non_http_redirect_targets() {
        let base = url::Url::parse("https://example.com/").unwrap();
        let failure = resolve_redirect_target(&base, "file:///etc/passwd").unwrap_err();
        assert_eq!(failure.status, "ssrf_blocked");
        assert!(!failure.retryable);
    }

    #[test]
    fn retry_backoff_stays_short_and_honors_retry_after() {
        assert!(fetch_retry_delay(0, None) <= Duration::from_millis(400));
        assert_eq!(
            fetch_retry_delay(2, Some(Duration::from_secs(7))),
            Duration::from_secs(7)
        );
    }

    #[tokio::test]
    async fn wayback_is_skipped_when_disabled_or_out_of_budget() {
        assert!(
            recover_with_wayback(&request("https://example.com", false, None))
                .await
                .is_none()
        );

        let expired = Instant::now() - Duration::from_secs(1);
        assert!(
            recover_with_wayback(&request("https://example.com", true, Some(expired)))
                .await
                .is_none()
        );
    }
}
