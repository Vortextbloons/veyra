use crate::web_search::fetch_types::MIN_CONTENT_CHARS;
use htmd::convert as htmd_convert;
use readability::extractor::extract as readability_extract;
use scraper::{Html, Selector};

/// Minimal HTML entity decoder for the few common entities YouTube's caption
/// XML uses (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` `&nbsp;` and numeric refs).
pub(crate) fn decode_html_entities(s: &str) -> String {
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

pub(crate) fn strip_html_to_text(html: &str) -> String {
    let document = Html::parse_document(html);
    document
        .root_element()
        .text()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn extract_text_from_html_body(
    html: &str,
    parsed: &url::Url,
) -> Result<(String, Option<String>), &'static str> {
    let body = html.to_string();
    match readability_extract(&mut body.as_bytes(), parsed) {
        Ok(p) if p.content.trim().len() >= MIN_CONTENT_CHARS => {
            let content = htmd_convert(&p.content).unwrap_or(p.content);
            return Ok((content, Some(p.title)));
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

/// Fallback extraction using scraper (html5ever) when readability fails or
/// returns too little content. Pulls text from paragraphs, list items,
/// headings, and blockquotes, joined with double newlines.
fn extract_paragraphs_fallback(html: &str) -> String {
    let document = Html::parse_document(html);
    let sel = Selector::parse("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, article, section, td, dt, dd, figcaption")
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

/// Last-resort regex extraction of <p> and other block elements when scraper yields nothing.
fn extract_paragraphs_regex(html: &str) -> String {
    let mut out = String::new();
    let lower = html.to_lowercase();
    let tags: &[&str] = &["<p", "<article", "<section", "<td", "<li", "<h1", "<h2", "<h3", "<h4", "<h5", "<h6"];
    let mut i = 0usize;
    'outer: while i < lower.len() {
        for tag in tags {
            if let Some(pos) = find_subslice(lower.as_bytes()[i..].as_ref(), tag.as_bytes()) {
                let abs = i + pos;
                let close_tag = format!("</{}>", &tag[1..]);
                if let Some(end_rel) = lower[abs..].find(&close_tag) {
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
                    i = abs + end_rel + close_tag.len();
                    continue 'outer;
                }
            }
        }
        break;
    }
    out
}

pub(crate) fn compact_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for part in text.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(part);
    }
    out
}

pub(crate) fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
