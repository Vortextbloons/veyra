use std::path::PathBuf;
use std::time::Duration;
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
    truncate_at_sentence_boundary,
};
use crate::web_search::fetch_wayback::try_wayback_fallback;
use crate::web_search::fetch_youtube::{handle_youtube, is_youtube_url};

const FETCH_MAX_RETRIES: u32 = 2;

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
    retry_after.unwrap_or_else(|| Duration::from_secs(2u64.pow(attempt.min(3))))
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

    enum FetchOutcome {
        Ok(reqwest::Response),
        Err(String, String),
    }

    let outcome = 'retry: {
        for attempt in 0..=FETCH_MAX_RETRIES {
            let result = tokio::time::timeout(
                timeout,
                FETCH_CLIENT.get(parsed.clone()).timeout(timeout).send(),
            )
            .await;
            match result {
                Ok(Ok(r)) => {
                    let status = r.status();
                    if status.is_success() {
                        break 'retry FetchOutcome::Ok(r);
                    }
                    let retryable = status.as_u16() == 429
                        || status.as_u16() == 408
                        || status.is_server_error();
                    if retryable && attempt < FETCH_MAX_RETRIES {
                        let retry_after = r
                            .headers()
                            .get(reqwest::header::RETRY_AFTER)
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .map(Duration::from_secs);
                        sleep(fetch_retry_delay(attempt, retry_after)).await;
                        continue;
                    }
                    break 'retry FetchOutcome::Err(
                        "http".to_string(),
                        format!("HTTP {}", status.as_u16()),
                    );
                }
                Ok(Err(e)) => {
                    let reason = if e.is_timeout() {
                        "Request timed out".to_string()
                    } else {
                        format!("Network error: {e}")
                    };
                    let status = if e.is_timeout() { "timeout" } else { "network" };
                    if attempt < FETCH_MAX_RETRIES {
                        sleep(fetch_retry_delay(attempt, None)).await;
                        continue;
                    }
                    break 'retry FetchOutcome::Err(status.to_string(), reason);
                }
                Err(_) => {
                    if attempt < FETCH_MAX_RETRIES {
                        sleep(fetch_retry_delay(attempt, None)).await;
                        continue;
                    }
                    break 'retry FetchOutcome::Err(
                        "timeout".to_string(),
                        format!("Request timed out after {}s", req.timeout_secs),
                    );
                }
            }
        }
        FetchOutcome::Err("retry".to_string(), "all attempts failed".to_string())
    };

    let response = match outcome {
        FetchOutcome::Ok(r) => r,
        FetchOutcome::Err(status, reason) => {
            if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
                return recovered;
            }
            return make_error_page(&url, max_chars, &status, &reason, &req.cache_dir);
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
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
            if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
            if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
        let parsed_url = parsed.clone();
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
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
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

    let mut tasks = Vec::with_capacity(urls.len());
    for url in urls {
        let permit_source = semaphore.clone();
        let cache_dir = cache_dir.clone();
        let url_for_error = url.clone();
        let handle = tokio::spawn(async move {
            let _permit = permit_source.acquire_owned().await.ok()?;
            let req = FetchRequest {
                url,
                timeout_secs: timeout,
                max_chars,
                cache_dir,
                advanced_search_bundle_enabled: bundle_enabled,
            };
            Some(fetch_one(req).await)
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
