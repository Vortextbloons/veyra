use serde::{Deserialize, Serialize};
use std::io::Read as _;
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::sync::Semaphore;

use crate::web_fetch_cache;
use crate::web_fetch_security::ssrf_check;
use readability::extractor::extract as readability_extract;
use scraper::{Html, Selector};

#[derive(Serialize, Clone)]
pub struct FetchedPage {
    pub url: String,
    pub status: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub error_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extraction_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub via_wayback: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub char_count: Option<usize>,
}

const USER_AGENT: &str = "Mozilla/5.0 (compatible; Veyra/0.1; +https://github.com/anomalyco/veyra)";
const MAX_BODY_BYTES: usize = 5_000_000;
const MIN_CONTENT_CHARS: usize = 200;

static FETCH_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        // Do not auto-follow redirects: each target would need its own SSRF
        // validation, and reqwest's automatic policy cannot enforce that here.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to build fetch client")
});

#[derive(Deserialize)]
pub struct FetchRequest {
    pub url: String,
    pub timeout_secs: u64,
    pub max_chars: usize,
    pub cache_dir: PathBuf,
    #[serde(default = "default_bundle_enabled")]
    pub advanced_search_bundle_enabled: bool,
}

fn default_bundle_enabled() -> bool {
    true
}

fn is_youtube_url(parsed: &url::Url) -> bool {
    let host = parsed
        .host_str()
        .map(|h| h.to_lowercase())
        .unwrap_or_default();
    matches!(
        host.as_str(),
        "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com" | "youtu.be"
    )
}

fn is_docx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".docx") || lower.contains("officedocument.wordprocessingml")
}

fn is_pptx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".pptx") || lower.contains("officedocument.presentationml")
}

fn is_xlsx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".xlsx") || lower.contains("officedocument.spreadsheetml")
}

fn is_epub_url(url_str: &str) -> bool {
    url_str.to_lowercase().contains(".epub")
}

fn is_office_content_type(ct: &str) -> bool {
    ct.contains("officedocument.wordprocessingml")
        || ct.contains("officedocument.presentationml")
        || ct.contains("officedocument.spreadsheetml")
        || ct.contains("msword")
        || ct.contains("ms-powerpoint")
        || ct.contains("ms-excel")
}

fn is_epub_content_type(ct: &str) -> bool {
    ct.contains("epub+zip") || ct.contains("epub")
}

fn is_valid_youtube_id(s: &str) -> bool {
    s.len() == 11
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn extract_youtube_video_id(url_str: &str) -> Option<String> {
    let parsed = url::Url::parse(url_str).ok()?;
    let host = parsed.host_str()?.to_lowercase();
    if host.contains("youtube.com") {
        if let Some((_, v)) = parsed.query_pairs().find(|(k, _)| k == "v") {
            if is_valid_youtube_id(&v) {
                return Some(v.into_owned());
            }
        }
        for prefix in ["/shorts/", "/embed/", "/live/", "/v/"] {
            if let Some(rest) = parsed.path().strip_prefix(prefix) {
                let id = rest.split(['/', '?', '#', '&']).next().unwrap_or("");
                if is_valid_youtube_id(id) {
                    return Some(id.to_string());
                }
            }
        }
    } else if host == "youtu.be" {
        let id = parsed
            .path()
            .trim_start_matches('/')
            .split(['/', '?', '#', '&'])
            .next()
            .unwrap_or("");
        if is_valid_youtube_id(id) {
            return Some(id.to_string());
        }
    }
    None
}

const YOUTUBE_CACHE_TTL_SECS: i64 = 7 * 24 * 60 * 60;
const INNERTUBE_PLAYER_URL: &str = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_ANDROID_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

/// Parse SRT-format caption text into plain lines, stripping timestamps.
fn parse_srt_captions(body: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut last_was_timestamp = false;
    for raw_line in body.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            last_was_timestamp = false;
            continue;
        }
        if line.contains("-->") {
            last_was_timestamp = true;
            continue;
        }
        // Strip simple SRT cue numbers (lines that are just digits).
        if last_was_timestamp && line.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        out.push(line.to_string());
        last_was_timestamp = false;
    }
    out
}

/// Extract a JSON object assigned to a JS global such as
/// `var ytInitialPlayerResponse = {...}` from inline page scripts.
fn extract_inline_js_json(html: &str, global_name: &str) -> Option<serde_json::Value> {
    let token = format!("var {global_name} = ");
    let start_index = html.find(&token)?;
    let json_start = start_index + token.len();
    let bytes = html.as_bytes();
    let mut i = json_start;
    while i < bytes.len() && bytes[i] != b'{' {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let start = i;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;
    while i < bytes.len() {
        let c = bytes[i];
        if escape {
            escape = false;
        } else if c == b'\\' {
            escape = true;
        } else if c == b'"' {
            in_string = !in_string;
        } else if !in_string {
            if c == b'{' {
                depth += 1;
            } else if c == b'}' {
                depth -= 1;
                if depth == 0 {
                    return serde_json::from_str(&html[start..=i]).ok();
                }
            }
        }
        i += 1;
    }
    None
}

async fn fetch_youtube_player_innertube(video_id: &str) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38"
            }
        },
        "videoId": video_id
    });
    let response = FETCH_CLIENT
        .post(INNERTUBE_PLAYER_URL)
        .header("Content-Type", "application/json")
        .header("User-Agent", INNERTUBE_ANDROID_UA)
        .timeout(Duration::from_secs(15))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("YouTube InnerTube player request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "YouTube InnerTube player returned HTTP {}",
            response.status().as_u16()
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("YouTube InnerTube player JSON parse failed: {e}"))
}

async fn fetch_youtube_player_from_watch_page(video_id: &str) -> Result<serde_json::Value, String> {
    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
    let page_response = FETCH_CLIENT
        .get(&watch_url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("YouTube watch page request failed: {e}"))?;

    if !page_response.status().is_success() {
        return Err(format!(
            "YouTube watch page returned HTTP {}",
            page_response.status().as_u16()
        ));
    }

    let page_html = page_response
        .text()
        .await
        .map_err(|e| format!("YouTube watch page body read failed: {e}"))?;

    extract_inline_js_json(&page_html, "ytInitialPlayerResponse").ok_or_else(|| {
        "Could not find player response in YouTube watch page (video may be private, age-restricted, or the page structure has changed)".into()
    })
}

async fn fetch_youtube_player_response(video_id: &str) -> Result<serde_json::Value, String> {
    if let Ok(player) = fetch_youtube_player_innertube(video_id).await {
        if player
            .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
            .and_then(|v| v.as_array())
            .is_some_and(|tracks| !tracks.is_empty())
        {
            return Ok(player);
        }
    }
    fetch_youtube_player_from_watch_page(video_id).await
}

fn youtube_title_from_player(player: &serde_json::Value) -> String {
    player
        .get("videoDetails")
        .and_then(|d| d.get("title"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string()
}

/// Pick the best caption track URL from a player response. Prefers manual
/// English captions, then any English track, then the first available track.
fn pick_caption_track_url(player: &serde_json::Value) -> Option<String> {
    let tracks = player
        .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")?
        .as_array()?;
    if tracks.is_empty() {
        return None;
    }

    let base_url = |track: &serde_json::Value| {
        track
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };

    for track in tracks {
        let lang = track
            .get("languageCode")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let kind = track.get("kind").and_then(|v| v.as_str());
        if lang == "en" && kind != Some("asr") {
            if let Some(url) = base_url(track) {
                return Some(url);
            }
        }
    }

    for track in tracks {
        if track.get("languageCode").and_then(|v| v.as_str()) == Some("en") {
            if let Some(url) = base_url(track) {
                return Some(url);
            }
        }
    }

    base_url(&tracks[0])
}

fn parse_caption_body(body: &str) -> Vec<String> {
    if !body.trim_start().starts_with('<') {
        return parse_srt_captions(body);
    }

    let document = Html::parse_document(body);

    if let Ok(p_sel) = Selector::parse("p") {
        let lines: Vec<String> = document
            .select(&p_sel)
            .map(|el| decode_html_entities(&el.text().collect::<String>()))
            .filter(|s| !s.trim().is_empty())
            .collect();
        if !lines.is_empty() {
            return lines;
        }
    }

    if let Ok(text_sel) = Selector::parse("text") {
        let lines: Vec<String> = document
            .select(&text_sel)
            .map(|el| decode_html_entities(&el.text().collect::<String>()))
            .filter(|s| !s.trim().is_empty())
            .collect();
        if !lines.is_empty() {
            return lines;
        }
    }

    Vec::new()
}

async fn handle_youtube(url: &str, max_chars: usize, cache_dir: &std::path::Path) -> FetchedPage {
    // Only serve successful YouTube transcripts from cache. Errors are not
    // cached here so handler upgrades and transient failures can retry.
    if let Some(cached) = web_fetch_cache::read(url, max_chars, cache_dir) {
        if cached.status == "ok" {
            return FetchedPage {
                url: cached.url,
                status: cached.status,
                title: cached.title,
                content: cached.content,
                error_reason: None,
                source_type: Some("youtube".into()),
                extraction_method: Some("youtube_captions".into()),
                via_wayback: None,
                char_count: None,
            };
        }
    }

    let fail = |status: &str, reason: &str| transient_error_page(url, status, reason);

    let video_id = match extract_youtube_video_id(url) {
        Some(id) => id,
        None => return fail("invalid_url", "Could not extract YouTube video ID from URL"),
    };

    let player = match fetch_youtube_player_response(&video_id).await {
        Ok(p) => p,
        Err(reason) => {
            let status = if reason.contains("timed out") {
                "timeout"
            } else if reason.contains("HTTP") {
                "http"
            } else if reason.contains("request failed") || reason.contains("body read failed") {
                "network"
            } else {
                "extraction"
            };
            return fail(status, &reason);
        }
    };

    let title = youtube_title_from_player(&player);

    let caption_url = match pick_caption_track_url(&player) {
        Some(u) => u,
        None => {
            return fail("extraction", "YouTube video has no captions available");
        }
    };

    let caption_response = match FETCH_CLIENT
        .get(&caption_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let reason = if e.is_timeout() {
                "YouTube caption track request timed out".to_string()
            } else {
                format!("YouTube caption track request failed: {e}")
            };
            let status = if e.is_timeout() { "timeout" } else { "network" };
            return fail(status, &reason);
        }
    };

    if !caption_response.status().is_success() {
        return fail(
            "http",
            &format!(
                "YouTube caption track returned HTTP {}",
                caption_response.status().as_u16()
            ),
        );
    }

    let caption_body = match caption_response.text().await {
        Ok(t) => t,
        Err(e) => {
            return fail(
                "network",
                &format!("YouTube caption track body read failed: {e}"),
            )
        }
    };

    let lines = parse_caption_body(&caption_body);

    if lines.is_empty() {
        return fail("extraction", "YouTube caption track is empty");
    }

    let transcript: String = lines
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if transcript.len() < MIN_CONTENT_CHARS {
        return fail(
            "extraction",
            "YouTube transcript is too short (likely auto-captions failed)",
        );
    }

    let content = truncate_at_sentence_boundary(&transcript, max_chars);
    let final_title = if !title.is_empty() {
        title
    } else {
        format!("YouTube Video ({video_id})")
    };

    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: YOUTUBE_CACHE_TTL_SECS,
        status: "ok".into(),
        title: Some(final_title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] youtube cache write failed: {e}");
    }

    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(final_title),
        content: Some(content),
        error_reason: None,
        source_type: Some("youtube".into()),
        extraction_method: Some("youtube_captions".into()),
        via_wayback: None,
        char_count: None,
    }
}

/// Minimal HTML entity decoder for the few common entities YouTube's caption
/// XML uses (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` `&nbsp;` and numeric refs).
fn decode_html_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '&' {
            out.push(c);
            continue;
        }
        // Collect until ';'
        let mut entity = String::new();
        while let Some(&next) = chars.peek() {
            if next == ';' {
                chars.next();
                break;
            }
            entity.push(next);
            chars.next();
        }
        match entity.as_str() {
            "amp" => out.push('&'),
            "lt" => out.push('<'),
            "gt" => out.push('>'),
            "quot" => out.push('"'),
            "apos" => out.push('\''),
            "nbsp" => out.push(' '),
            "#39" => out.push('\''),
            _ => {
                if let Some(stripped) = entity.strip_prefix('#') {
                    if let Ok(code) = stripped.parse::<u32>() {
                        if let Some(ch) = char::from_u32(code) {
                            out.push(ch);
                            continue;
                        }
                    }
                }
                // Unknown entity, keep as-is.
                out.push('&');
                out.push_str(&entity);
                out.push(';');
            }
        }
    }
    out
}

/// Byte index after at most `max_chars` Unicode scalars (always on a char boundary).
fn byte_index_at_char_limit(text: &str, max_chars: usize) -> usize {
    match text.char_indices().nth(max_chars) {
        Some((idx, _)) => idx,
        None => text.len(),
    }
}

fn truncate_at_sentence_boundary(text: &str, max_chars: usize) -> String {
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

fn contains_ole_compound_signature(bytes: &[u8]) -> bool {
    const SIG: [u8; 4] = [0xD0, 0xCF, 0x11, 0xE0];
    bytes.windows(4).any(|w| w == SIG)
}

fn is_zip_archive(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

fn url_has_extension(url_str: &str, ext: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.ends_with(ext)
        || lower.contains(&format!("{ext}?"))
        || lower.contains(&format!("{ext}#"))
        || lower.contains(&format!("{ext}&"))
}

fn is_legacy_office_url(url_str: &str) -> bool {
    (url_has_extension(url_str, ".doc") && !url_has_extension(url_str, ".docx"))
        || (url_has_extension(url_str, ".ppt") && !url_has_extension(url_str, ".pptx"))
        || (url_has_extension(url_str, ".xls") && !url_has_extension(url_str, ".xlsx"))
}

/// Heuristic for UTF-8 lossy decoding of binary payloads (Office OLE, compressed blobs, etc.).
fn is_low_quality_extracted_text(text: &str) -> bool {
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

fn is_qwen_ai_blog_url(parsed: &url::Url) -> bool {
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

fn strip_html_to_text(html: &str) -> String {
    let document = Html::parse_document(html);
    document
        .root_element()
        .text()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_text_from_html_body(
    html: &str,
    parsed: &url::Url,
) -> Result<(String, Option<String>), &'static str> {
    let body = html.to_string();
    match readability_extract(&mut body.as_bytes(), parsed) {
        Ok(p) if p.content.trim().len() >= MIN_CONTENT_CHARS => {
            return Ok((p.content, Some(p.title)));
        }
        Ok(_) | Err(_) => {}
    }

    let fallback = extract_paragraphs_fallback(html);
    if fallback.trim().len() >= MIN_CONTENT_CHARS {
        return Ok((fallback, None));
    }

    let regex = extract_paragraphs_regex(html);
    if regex.trim().len() >= MIN_CONTENT_CHARS {
        return Ok((regex, None));
    }

    let plain = strip_html_to_text(html);
    if plain.len() >= MIN_CONTENT_CHARS {
        return Ok((plain, None));
    }

    Err("too_little")
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

async fn handle_qwen_ai_blog(
    url: &str,
    parsed: &url::Url,
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    if let Some(cached) = web_fetch_cache::read(url, max_chars, cache_dir) {
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

    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: YOUTUBE_CACHE_TTL_SECS,
        status: "ok".into(),
        title: Some(title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
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

/// Fallback extraction using scraper (html5ever) when readability fails or
/// returns too little content. Pulls text from paragraphs, list items,
/// headings, and blockquotes, joined with double newlines.
fn extract_paragraphs_fallback(html: &str) -> String {
    let document = Html::parse_document(html);
    let sel = Selector::parse("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre")
        .expect("static selector must parse");
    let mut out = String::new();
    for element in document.select(&sel) {
        let mut text = String::new();
        for part in element.text().map(str::trim).filter(|s| !s.is_empty()) {
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(part);
        }
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
                let mut text = String::new();
                for part in block
                    .split('<')
                    .skip(1)
                    .filter_map(|s| s.split_once('>').map(|(_, after)| after))
                {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(part);
                }
                let cleaned = compact_whitespace(&text);
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

fn compact_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for part in text.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(part);
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

async fn run_blocking_extraction<F>(url: &str, f: F) -> FetchedPage
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

    if let Some(cached) = web_fetch_cache::read(&url, max_chars, &req.cache_dir) {
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
    let response = match tokio::time::timeout(
        timeout,
        FETCH_CLIENT.get(parsed.clone()).timeout(timeout).send(),
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
            // Network/timeout error — try Wayback fallback
            if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
                return recovered;
            }
            return make_error_page(&url, max_chars, status, &reason, &req.cache_dir);
        }
        Err(_) => {
            // Timeout — try Wayback fallback
            if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
                return recovered;
            }
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
        // HTTP error — try Wayback fallback
        if let Some(recovered) = try_wayback_fallback(&url, max_chars, &req.cache_dir).await {
            return recovered;
        }
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
        source_type: Some("webpage".into()),
        extraction_method: Some("readability".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn handle_pdf(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
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
        source_type: Some("pdf".into()),
        extraction_method: Some("pdf_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_docx_text(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("DOCX zip open failed: {e}"))?;

    let mut xml_content = String::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("DOCX zip entry read failed: {e}"))?;
        if file.name() == "word/document.xml" {
            file.read_to_string(&mut xml_content)
                .map_err(|e| format!("DOCX document.xml read failed: {e}"))?;
            break;
        }
    }

    if xml_content.is_empty() {
        return Err("DOCX contains no word/document.xml".into());
    }

    let doc = quick_xml::Reader::from_str(&xml_content);
    let mut text = String::new();
    let mut in_text = false;
    let mut buf = Vec::new();

    let mut reader = doc;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e))
            | Ok(quick_xml::events::Event::Empty(ref e)) => {
                if e.name().as_ref() == b"w:p" {
                    if !text.is_empty() && !text.ends_with("\n") {
                        text.push('\n');
                    }
                } else if e.name().as_ref() == b"w:t" {
                    in_text = true;
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if in_text {
                    if let Ok(s) = e.unescape() {
                        text.push_str(&s);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("DOCX XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(text)
}

fn handle_docx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_docx_text(body_bytes) {
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
            "DOCX text extraction returned too little content",
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
        source_type: Some("docx".into()),
        extraction_method: Some("docx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_pptx_text(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("PPTX zip open failed: {e}"))?;

    let mut text_parts: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("PPTX zip entry read failed: {e}"))?;
        let name = file.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml_content = String::new();
            file.read_to_string(&mut xml_content)
                .map_err(|e| format!("PPTX slide XML read failed: {e}"))?;
            let doc = quick_xml::Reader::from_str(&xml_content);
            let mut slide_text = String::new();
            let mut in_text = false;
            let mut buf = Vec::new();
            let mut reader = doc;
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(quick_xml::events::Event::Start(ref e))
                    | Ok(quick_xml::events::Event::Empty(ref e)) => {
                        if e.name().as_ref() == b"a:t" {
                            in_text = true;
                        }
                    }
                    Ok(quick_xml::events::Event::End(ref e)) => {
                        if e.name().as_ref() == b"a:t" {
                            in_text = false;
                        }
                    }
                    Ok(quick_xml::events::Event::Text(ref e)) => {
                        if in_text {
                            if let Ok(s) = e.unescape() {
                                slide_text.push_str(&s);
                            }
                        }
                    }
                    Ok(quick_xml::events::Event::Eof) => break,
                    Err(e) => return Err(format!("PPTX XML parse error: {e}")),
                    _ => {}
                }
                buf.clear();
            }
            if !slide_text.trim().is_empty() {
                text_parts.push(slide_text.trim().to_string());
            }
        }
    }

    if text_parts.is_empty() {
        return Err("PPTX contains no slides with text".into());
    }

    Ok(text_parts.join("\n\n"))
}

fn handle_pptx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_pptx_text(body_bytes) {
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
            "PPTX text extraction returned too little content",
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
        source_type: Some("pptx".into()),
        extraction_method: Some("pptx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn handle_xlsx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_xlsx_text(body_bytes) {
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
            "XLSX text extraction returned too little content",
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
        source_type: Some("xlsx".into()),
        extraction_method: Some("xlsx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_xlsx_text(bytes: &[u8]) -> Result<String, String> {
    use calamine::{open_workbook_auto_from_rs, Reader};

    let cursor = std::io::Cursor::new(bytes);
    let mut workbook =
        open_workbook_auto_from_rs(cursor).map_err(|e| format!("XLSX open failed: {e}"))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let mut text_parts: Vec<String> = Vec::new();

    for name in &sheet_names {
        if let Ok(range) = workbook.worksheet_range(name) {
            let mut sheet_text = String::new();
            for row in range.rows() {
                let cells: Vec<String> = row
                    .iter()
                    .map(|cell| match cell {
                        calamine::Data::Empty => String::new(),
                        calamine::Data::String(s) => s.clone(),
                        calamine::Data::Float(f) => {
                            if *f == (*f as i64) as f64 {
                                format!("{}", *f as i64)
                            } else {
                                format!("{f}")
                            }
                        }
                        calamine::Data::Int(i) => format!("{i}"),
                        calamine::Data::Bool(b) => format!("{b}"),
                        calamine::Data::Error(e) => format!("[{e}]"),
                        calamine::Data::DateTime(dt) => format!("{dt}"),
                        _ => String::new(),
                    })
                    .filter(|s| !s.is_empty())
                    .collect();
                if !cells.is_empty() {
                    sheet_text.push_str(&cells.join(" | "));
                    sheet_text.push('\n');
                }
            }
            if !sheet_text.trim().is_empty() {
                text_parts.push(format!("Sheet: {name}\n{sheet_text}"));
            }
        }
    }

    if text_parts.is_empty() {
        return Err("XLSX contains no data".into());
    }

    Ok(text_parts.join("\n\n"))
}

fn extract_epub_text(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("EPUB zip open failed: {e}"))?;

    // Find and parse the OPF container to get the content file
    let mut opf_path = None;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == "META-INF/container.xml" {
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| format!("EPUB container.xml read failed: {e}"))?;
            // Parse the rootfile path from container.xml
            if let Some(start) = content.find("full-path=\"") {
                let rest = &content[start + 11..];
                if let Some(end) = rest.find('\"') {
                    opf_path = Some(rest[..end].to_string());
                }
            }
            break;
        }
    }

    let opf_path = opf_path.unwrap_or_else(|| "content.opf".to_string());
    let opf_dir = opf_path
        .rsplit_once('/')
        .map(|(dir, _)| format!("{dir}/"))
        .unwrap_or_default();

    // Read the OPF file to find spine items in order
    let mut spine_hrefs: Vec<String> = Vec::new();
    let mut opf_content = String::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == opf_path {
            file.read_to_string(&mut opf_content)
                .map_err(|e| format!("EPUB OPF read failed: {e}"))?;
            break;
        }
    }

    if !opf_content.is_empty() {
        let doc = quick_xml::Reader::from_str(&opf_content);
        let mut manifest_items: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let mut in_manifest = false;
        let mut buf = Vec::new();
        let mut reader = doc;
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(quick_xml::events::Event::Start(ref e))
                | Ok(quick_xml::events::Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = true;
                    } else if tag == "item" && in_manifest {
                        let mut id = String::new();
                        let mut href = String::new();
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            if key == "id" {
                                id = val;
                            } else if key == "href" {
                                href = val;
                            }
                        }
                        if !id.is_empty() && !href.is_empty() {
                            manifest_items.insert(id, href);
                        }
                    }
                }
                Ok(quick_xml::events::Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = false;
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(e) => return Err(format!("EPUB OPF parse error: {e}")),
                _ => {}
            }
            buf.clear();
        }

        // Parse spine to get ordered itemrefs
        let doc2 = quick_xml::Reader::from_str(&opf_content);
        let mut buf2 = Vec::new();
        let mut reader2 = doc2;
        loop {
            match reader2.read_event_into(&mut buf2) {
                Ok(quick_xml::events::Event::Start(ref e))
                | Ok(quick_xml::events::Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "itemref" {
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            if key == "idref" {
                                let idref = String::from_utf8_lossy(&attr.value).to_string();
                                if let Some(href) = manifest_items.get(&idref) {
                                    spine_hrefs.push(format!("{opf_dir}{href}"));
                                }
                            }
                        }
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf2.clear();
        }
    }

    // Extract text from each spine item (XHTML content files)
    let mut all_text = String::new();
    for href in &spine_hrefs {
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
            if file.name() == href.as_str() {
                let mut content = String::new();
                file.read_to_string(&mut content)
                    .map_err(|e| format!("EPUB content file read failed: {e}"))?;
                let text = strip_html_to_text(&content);
                if !text.trim().is_empty() {
                    if !all_text.is_empty() {
                        all_text.push_str("\n\n");
                    }
                    all_text.push_str(text.trim());
                }
                break;
            }
        }
    }

    if all_text.trim().is_empty() {
        return Err("EPUB contains no extractable text content".into());
    }

    Ok(all_text)
}

fn handle_epub(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_epub_text(body_bytes) {
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
            "EPUB text extraction returned too little content",
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
        source_type: Some("epub".into()),
        extraction_method: Some("epub_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

/// Try to recover content from the Wayback Machine for a failed URL.
/// Returns Some(FetchedPage) if a snapshot was found and extracted.
async fn try_wayback_fallback(
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

fn is_office_url(url_str: &str) -> bool {
    is_docx_url(url_str)
        || is_pptx_url(url_str)
        || is_xlsx_url(url_str)
        || is_legacy_office_url(url_str)
}

fn fetch_office_document(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    if contains_ole_compound_signature(body_bytes) && !is_zip_archive(body_bytes) {
        if is_xlsx_url(url) || url_has_extension(url, ".xls") {
            return handle_xlsx(url, body_bytes, max_chars, cache_dir);
        }
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "Legacy binary Office format (.doc/.ppt) is not supported; try a PDF or DOCX link",
            cache_dir,
        );
    }

    if is_docx_url(url) || is_xlsx_url(url) || is_pptx_url(url) {
        let lower = url.to_lowercase();
        if lower.contains(".docx") {
            return handle_docx(url, body_bytes, max_chars, cache_dir);
        }
        if lower.contains(".xlsx") {
            return handle_xlsx(url, body_bytes, max_chars, cache_dir);
        }
        if lower.contains(".pptx") {
            return handle_pptx(url, body_bytes, max_chars, cache_dir);
        }
    }
    // Fallback: try DOCX first (modern Office Open XML zip archives).
    handle_docx(url, body_bytes, max_chars, cache_dir)
}

fn make_error_page(
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
fn transient_error_page(url: &str, status: &str, reason: &str) -> FetchedPage {
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

#[tauri::command]
pub async fn fetch_and_extract_pages(
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
pub fn clear_web_fetch_cache(cache_dir: PathBuf) -> Result<(), String> {
    web_fetch_cache::clear(&cache_dir)
}

#[tauri::command]
pub fn get_web_fetch_cache_stats(
    cache_dir: PathBuf,
) -> Result<web_fetch_cache::CacheStats, String> {
    Ok(web_fetch_cache::stats(&cache_dir))
}
