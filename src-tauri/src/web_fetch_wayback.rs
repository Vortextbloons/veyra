use crate::web_fetch_cache;
use crate::web_fetch_documents::{
    fetch_office_document, handle_epub, handle_pdf, is_epub_url, is_office_url,
};
use crate::web_fetch_html::{extract_text_from_html_body, strip_html_to_text};
use crate::web_fetch_types::{FetchedPage, FETCH_CLIENT, MAX_BODY_BYTES, MIN_CONTENT_CHARS};
use crate::web_fetch_utils::{
    contains_ole_compound_signature, is_epub_content_type, is_low_quality_extracted_text,
    is_office_content_type, is_zip_archive, truncate_at_sentence_boundary,
};
use std::time::Duration;

/// Try to recover content from the Wayback Machine for a failed URL.
/// Returns Some(FetchedPage) if a snapshot was found and extracted.
pub(crate) async fn try_wayback_fallback(
    original_url: &str,
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> Option<FetchedPage> {
    // Query the Wayback Availability API
    let availability_url = format!(
        "https://archive.org/wayback/available?url={}",
        urlencoding::encode(original_url)
    );

    let availability_response = match tokio::time::timeout(
        Duration::from_secs(8),
        FETCH_CLIENT.get(&availability_url).send(),
    )
    .await
    {
        Ok(Ok(r)) => r,
        _ => return None,
    };

    if !availability_response.status().is_success() {
        return None;
    }

    let availability: serde_json::Value = match availability_response.json().await {
        Ok(v) => v,
        _ => return None,
    };

    let snapshot_url = availability
        .get("archived_snapshots")
        .and_then(|s| s.get("closest"))
        .and_then(|c| c.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());

    let snapshot_url = match snapshot_url {
        Some(u) if !u.is_empty() => u,
        _ => return None,
    };

    // Fetch the archived snapshot
    let timeout = Duration::from_secs(15);
    let response = match tokio::time::timeout(
        timeout,
        FETCH_CLIENT.get(&snapshot_url).timeout(timeout).send(),
    )
    .await
    {
        Ok(Ok(r)) => r,
        _ => return None,
    };

    if !response.status().is_success() {
        return None;
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let body_bytes = match response.bytes().await {
        Ok(b) => b,
        _ => return None,
    };

    if body_bytes.len() > MAX_BODY_BYTES {
        return None;
    }

    // Handle PDF from Wayback
    if content_type.contains("application/pdf") {
        let result = handle_pdf(original_url, &body_bytes, max_chars, cache_dir);
        if result.status == "ok" {
            return Some(FetchedPage {
                via_wayback: Some(true),
                ..result
            });
        }
        return None;
    }

    // Handle Office documents from Wayback
    if is_office_content_type(&content_type) || is_office_url(original_url) {
        let result = fetch_office_document(original_url, &body_bytes, max_chars, cache_dir);
        if result.status == "ok" {
            return Some(FetchedPage {
                via_wayback: Some(true),
                ..result
            });
        }
        return None;
    }

    // Handle EPUB from Wayback
    if is_epub_content_type(&content_type) || is_epub_url(original_url) {
        let result = handle_epub(original_url, &body_bytes, max_chars, cache_dir);
        if result.status == "ok" {
            return Some(FetchedPage {
                via_wayback: Some(true),
                ..result
            });
        }
        return None;
    }

    // Handle HTML from Wayback
    if !content_type.is_empty()
        && !content_type.contains("text/html")
        && !content_type.contains("text/plain")
        && !content_type.contains("text/")
        && !content_type.contains("application/xhtml")
    {
        return None;
    }

    if body_bytes.len() >= 4 && &body_bytes[0..4] == b"%PDF" {
        let result = handle_pdf(original_url, &body_bytes, max_chars, cache_dir);
        if result.status == "ok" {
            return Some(FetchedPage {
                via_wayback: Some(true),
                ..result
            });
        }
        return None;
    }

    if contains_ole_compound_signature(&body_bytes) || is_zip_archive(&body_bytes) {
        let result = fetch_office_document(original_url, &body_bytes, max_chars, cache_dir);
        if result.status == "ok" {
            return Some(FetchedPage {
                via_wayback: Some(true),
                ..result
            });
        }
        return None;
    }

    let body = String::from_utf8_lossy(&body_bytes).to_string();
    let parsed_url = match url::Url::parse(original_url) {
        Ok(u) => u,
        _ => return None,
    };

    let (content, title) = match extract_text_from_html_body(&body, &parsed_url) {
        Ok(r) => r,
        Err(_) => {
            let plain = strip_html_to_text(&body);
            if plain.len() < MIN_CONTENT_CHARS {
                return None;
            }
            (plain, None)
        }
    };

    let content_trimmed = content.trim();
    if is_low_quality_extracted_text(content_trimmed) {
        return None;
    }
    let content = truncate_at_sentence_boundary(content_trimmed, max_chars);
    let title = title.unwrap_or_else(|| original_url.to_string());

    let entry = web_fetch_cache::CachedEntry {
        url: original_url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 4 * 60 * 60, // 4 hours for Wayback content
        status: "ok".into(),
        title: Some(title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(original_url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] wayback cache write failed: {e}");
    }

    Some(FetchedPage {
        url: original_url.to_string(),
        status: "ok".into(),
        title: Some(title),
        content: Some(content),
        error_reason: None,
        source_type: None,
        extraction_method: Some("wayback_html".into()),
        via_wayback: Some(true),
        char_count: None,
    })
}
