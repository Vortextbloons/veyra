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
    #[serde(default = "default_bundle_enabled")]
    pub advanced_search_bundle_enabled: bool,
}

fn default_bundle_enabled() -> bool {
    true
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

fn is_valid_youtube_id(s: &str) -> bool {
    s.len() == 11
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn extract_youtube_video_id(url_str: &str) -> Option<String> {
    let parsed = url::Url::parse(url_str).ok()?;
    let host = parsed.host_str()?.to_lowercase();
    if host.contains("youtube.com") {
        if let Some((_, v)) = parsed
            .query_pairs()
            .find(|(k, _)| k == "v")
        {
            if is_valid_youtube_id(&v) {
                return Some(v.into_owned());
            }
        }
        for prefix in ["/shorts/", "/embed/", "/live/", "/v/"] {
            if let Some(rest) = parsed.path().strip_prefix(prefix) {
                let id = rest
                    .split(['/', '?', '#', '&'])
                    .next()
                    .unwrap_or("");
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

async fn handle_youtube(
    url: &str,
    max_chars: usize,
    cache_dir: &PathBuf,
) -> FetchedPage {
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
            };
        }
    }

    let fail = |status: &str, reason: &str| transient_error_page(url, status, reason);

    let video_id = match extract_youtube_video_id(url) {
        Some(id) => id,
        None => {
            return fail(
                "invalid_url",
                "Could not extract YouTube video ID from URL",
            )
        }
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
            return fail(
                "extraction",
                "YouTube video has no captions available",
            );
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
            return fail(&status, &reason);
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
        return fail(
            "extraction",
            "YouTube caption track is empty",
        );
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

    let data = payload.get("data").ok_or_else(|| "Qwen article API missing data".to_string())?;
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
    cache_dir: &PathBuf,
) -> FetchedPage {
    if let Some(cached) = web_fetch_cache::read(url, max_chars, cache_dir) {
        if cached.status == "ok" {
            return FetchedPage {
                url: cached.url,
                status: cached.status,
                title: cached.title,
                content: cached.content,
                error_reason: None,
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

    let parsed = match url::Url::parse(&url) {
        Ok(p) => p,
        Err(e) => {
            return make_error_page(&url, max_chars, "invalid_url", &format!("Invalid URL: {e}"), &req.cache_dir)
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
            };
        }
        // Handler-specific errors are not served from cache so upgrades can retry.
        if !youtube_url && !qwen_blog_url {
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
        if !req.advanced_search_bundle_enabled {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Advanced Search Bundle is disabled (PDF extraction unavailable)",
                &req.cache_dir,
            );
        }
        return handle_pdf(&url, &body_bytes, max_chars, &req.cache_dir);
    }

    let body = String::from_utf8_lossy(&body_bytes).to_string();

    let (primary_content, primary_title) = match extract_text_from_html_body(&body, &parsed) {
        Ok((content, title)) => (content, title),
        Err(_) => {
            return make_error_page(
                &url,
                max_chars,
                "extraction",
                "Extraction returned too little content (likely a JS-only site)",
                &req.cache_dir,
            );
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
        tasks.push(tokio::spawn(async move {
            let _permit = permit_source.acquire_owned().await.ok()?;
            let req = FetchRequest {
                url,
                timeout_secs: timeout,
                max_chars,
                cache_dir,
                advanced_search_bundle_enabled: bundle_enabled,
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
