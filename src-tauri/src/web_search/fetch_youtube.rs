use crate::web_search::fetch_cache;
use crate::web_search::fetch_html::decode_html_entities;
use crate::web_search::fetch_types::{
    FetchedPage, FETCH_CLIENT, INNERTUBE_ANDROID_UA, INNERTUBE_PLAYER_URL, MIN_CONTENT_CHARS,
    YOUTUBE_CACHE_TTL_SECS,
};
use crate::web_search::fetch_utils::{transient_error_page, truncate_at_sentence_boundary};
use scraper::{Html, Selector};
use std::time::Duration;

pub(crate) fn is_youtube_url(parsed: &url::Url) -> bool {
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

pub(crate) async fn handle_youtube(
    url: &str,
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    // Only serve successful YouTube transcripts from cache. Errors are not
    // cached here so handler upgrades and transient failures can retry.
    if let Some(cached) = fetch_cache::read(url, max_chars, cache_dir) {
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

    let entry = fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: fetch_cache::now_unix_static(),
        ttl_secs: YOUTUBE_CACHE_TTL_SECS,
        status: "ok".into(),
        title: Some(final_title.clone()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = fetch_cache::write(url, max_chars, &entry, cache_dir) {
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
