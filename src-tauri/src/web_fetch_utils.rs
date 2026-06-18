use crate::web_fetch_cache;
use crate::web_fetch_types::{FetchedPage, MIN_CONTENT_CHARS};

/// Byte index after at most `max_chars` Unicode scalars (always on a char boundary).
pub(crate) fn byte_index_at_char_limit(text: &str, max_chars: usize) -> usize {
    match text.char_indices().nth(max_chars) {
        Some((idx, _)) => idx,
        None => text.len(),
    }
}

pub(crate) fn truncate_at_sentence_boundary(text: &str, max_chars: usize) -> String {
    let cut_byte = byte_index_at_char_limit(text, max_chars);
    if cut_byte >= text.len() {
        return text.to_string();
    }
    let window_start = byte_index_at_char_limit(text, max_chars.saturating_sub(200));
    let window = &text[window_start..cut_byte];
    let final_cut = if let Some(idx) = window.rfind(['.', '!', '?']) {
        // Sentence punctuation is ASCII, so idx + 1 stays on a char boundary.
        window_start + idx + 1
    } else {
        cut_byte
    };
    text[..final_cut].to_string()
}

pub(crate) fn contains_ole_compound_signature(bytes: &[u8]) -> bool {
    const SIG: [u8; 4] = [0xD0, 0xCF, 0x11, 0xE0];
    bytes.windows(4).any(|w| w == SIG)
}

pub(crate) fn is_zip_archive(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

pub(crate) fn url_has_extension(url_str: &str, ext: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.ends_with(ext)
        || lower.contains(&format!("{ext}?"))
        || lower.contains(&format!("{ext}#"))
        || lower.contains(&format!("{ext}&"))
}

pub(crate) fn is_legacy_office_url(url_str: &str) -> bool {
    (url_has_extension(url_str, ".doc") && !url_has_extension(url_str, ".docx"))
        || (url_has_extension(url_str, ".ppt") && !url_has_extension(url_str, ".pptx"))
        || (url_has_extension(url_str, ".xls") && !url_has_extension(url_str, ".xlsx"))
}

/// Heuristic for UTF-8 lossy decoding of binary payloads (Office OLE, compressed blobs, etc.).
pub(crate) fn is_low_quality_extracted_text(text: &str) -> bool {
    let sample: Vec<char> = text.chars().take(8000).collect();
    if sample.len() < MIN_CONTENT_CHARS {
        return false;
    }
    let len = sample.len();
    let replacement = sample.iter().filter(|&&c| c == '\u{FFFD}').count();
    let controls = sample
        .iter()
        .filter(|&&c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
        .count();
    replacement * 100 / len >= 12 || controls * 100 / len >= 8
}

pub(crate) async fn run_blocking_extraction<F>(url: &str, f: F) -> FetchedPage
where
    F: FnOnce() -> FetchedPage + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(page) => page,
        Err(e) => transient_error_page(
            url,
            "extraction",
            &format!("Document extraction task failed: {e}"),
        ),
    }
}

pub(crate) fn make_error_page(
    url: &str,
    max_chars: usize,
    status: &str,
    reason: &str,
    cache_dir: &std::path::Path,
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
    transient_error_page(url, status, reason)
}

/// Error response without writing to cache (used for YouTube where retries are expected).
pub(crate) fn transient_error_page(url: &str, status: &str, reason: &str) -> FetchedPage {
    FetchedPage {
        url: url.to_string(),
        status: status.to_string(),
        title: None,
        content: None,
        error_reason: Some(reason.to_string()),
        source_type: None,
        extraction_method: None,
        via_wayback: None,
        char_count: None,
    }
}

pub(crate) fn is_office_content_type(ct: &str) -> bool {
    ct.contains("officedocument.wordprocessingml")
        || ct.contains("officedocument.presentationml")
        || ct.contains("officedocument.spreadsheetml")
        || ct.contains("msword")
        || ct.contains("ms-powerpoint")
        || ct.contains("ms-excel")
}

pub(crate) fn is_epub_content_type(ct: &str) -> bool {
    ct.contains("epub+zip") || ct.contains("epub")
}
