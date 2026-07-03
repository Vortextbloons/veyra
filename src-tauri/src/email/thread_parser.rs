use serde::{Deserialize, Serialize};
use scraper::{Html, ElementRef, Node};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBody {
    pub latest_reply: String,
    pub quoted_html: String,
    pub signature: String,
    pub forwarded: String,
    pub parse_status: String,
}

/// Entry point: parse a message body into structured parts.
/// Prefers HTML parsing if body_html is non-empty; falls back to plain text.
pub fn parse_message_body(body_html: &str, body_text: &str) -> ParsedBody {
    if !body_html.is_empty() {
        let parsed = parse_html_body(body_html);
        if parsed.parse_status == "parsed" {
            return parsed;
        }
        // If HTML parsing failed, fall through to plain text.
    }
    if !body_text.is_empty() {
        return parse_plain_text_body(body_text);
    }
    ParsedBody {
        parse_status: "fallback".into(),
        ..Default::default()
    }
}

// ── HTML parsing ────────────────────────────────────────────────────────

pub fn parse_html_body(html: &str) -> ParsedBody {
    let document = Html::parse_fragment(html);
    let root = document.root_element();

    let mut reply_parts: Vec<String> = Vec::new();
    let mut quote_parts: Vec<String> = Vec::new();
    let mut signature = String::new();
    let mut forwarded = String::new();
    let mut found_quote = false;
    let mut found_signature = false;
    let mut found_forwarded = false;

    // Walk top-level element children and split at quote/sig/fwd boundaries.
    let children: Vec<ElementRef> = root.children().filter_map(|c| ElementRef::wrap(c)).collect();
    for child in &children {
        let text = element_text(child);
        let html_str = child.html();

        if is_signature_block(child, &text) {
            found_signature = true;
            signature = html_str;
            continue;
        }
        if is_forwarded_block(&text) {
            found_forwarded = true;
            forwarded = html_str;
            continue;
        }
        if is_quote_block(child, &text) {
            found_quote = true;
            quote_parts.push(html_str);
            continue;
        }

        // Not a quote/sig/fwd at top level. But it might CONTAIN a quote nested inside.
        // Recursively split this element's children.
        let (reply_html, quote_html, sig_html, fwd_html, has_nested) =
            split_element_children(child);

        if has_nested {
            found_quote = true;
            if !reply_html.is_empty() {
                reply_parts.push(reply_html);
            }
            if !quote_html.is_empty() {
                quote_parts.push(quote_html);
            }
            if !sig_html.is_empty() {
                found_signature = true;
                signature = sig_html;
            }
            if !fwd_html.is_empty() {
                found_forwarded = true;
                forwarded = fwd_html;
            }
        } else {
            reply_parts.push(html_str);
        }
    }

    let has_content = found_quote || found_signature || found_forwarded;
    let parse_status = if has_content { "parsed" } else { "fallback" };

    ParsedBody {
        latest_reply: reply_parts.join("").trim().to_string(),
        quoted_html: quote_parts.join("").trim().to_string(),
        signature: signature.trim().to_string(),
        forwarded: forwarded.trim().to_string(),
        parse_status: parse_status.into(),
    }
}

/// Recursively split an element's children into reply/quote/signature/forwarded parts.
/// Returns (reply_html, quote_html, sig_html, fwd_html, found_any_special).
fn split_element_children(el: &ElementRef) -> (String, String, String, String, bool) {
    use scraper::Node;

    let mut reply_parts: Vec<String> = Vec::new();
    let mut quote_parts: Vec<String> = Vec::new();
    let mut sig = String::new();
    let mut fwd = String::new();
    let mut found_special = false;
    let mut hit_quote = false; // Once we hit a quote, everything after goes to quotes.

    for child in el.children() {
        let Some(child_ref) = ElementRef::wrap(child) else {
            // Text node or comment — include in reply if before any quote.
            if !hit_quote {
                if let Node::Text(text) = child.value() {
                    reply_parts.push(text.to_string());
                }
            }
            continue;
        };

        let text = element_text(&child_ref);
        let html_str = child_ref.html();

        if is_signature_block(&child_ref, &text) {
            found_special = true;
            hit_quote = true;
            sig = html_str;
            continue;
        }
        if is_forwarded_block(&text) {
            found_special = true;
            hit_quote = true;
            fwd = html_str;
            continue;
        }
        if is_quote_block(&child_ref, &text) {
            found_special = true;
            hit_quote = true;
            quote_parts.push(html_str);
            continue;
        }

        // Not a quote at this level. Check deeper nesting.
        let (r, q, s, f, nested) = split_element_children(&child_ref);
        if nested {
            found_special = true;
            hit_quote = true;
            if !r.is_empty() {
                reply_parts.push(r);
            }
            if !q.is_empty() {
                quote_parts.push(q);
            }
            if !s.is_empty() {
                sig = s;
            }
            if !f.is_empty() {
                fwd = f;
            }
        } else if !hit_quote {
            reply_parts.push(html_str);
        } else {
            quote_parts.push(html_str);
        }
    }

    (
        reply_parts.join(""),
        quote_parts.join(""),
        sig,
        fwd,
        found_special,
    )
}

fn is_quote_block(el: &ElementRef, text: &str) -> bool {
    let tag = el.value().name();

    // Standard <blockquote>
    if tag == "blockquote" {
        return true;
    }

    // Gmail quotes: <div class="gmail_quote">
    if has_class(el, "gmail_quote") || has_class(el, "gmail_quote_attribution") {
        return true;
    }

    // Outlook: <div id="divRplyFwdMsg">
    if el.value().attr("id").map_or(false, |id| id == "divRplyFwdMsg") {
        return true;
    }

    // Mozilla/Thunderbird: <div class="moz-cite-prefix">
    if has_class(el, "moz-cite-prefix") {
        return true;
    }

    // Yahoo: <div class="yahoo_quoted">
    if has_class(el, "yahoo_quoted") {
        return true;
    }

    // Check for attribution patterns in text (English, CJK)
    // Only on leaf elements to avoid false positives on containers with nested quoted content.
    let has_child_elements = el.children().any(|c| ElementRef::wrap(c).is_some());
    if !has_child_elements {
        if text.contains("wrote:") || text.contains("writes:") {
            return true;
        }
        if text.contains("寫道：") || text.contains("写道：") || text.contains("書きました：") {
            return true;
        }
    }

    false
}

fn is_signature_block(el: &ElementRef, text: &str) -> bool {
    let tag = el.value().name();

    // Explicit signature divs
    if has_class(el, "signature") || has_class(el, "gmail_signature") {
        return true;
    }

    // Plain text signature: starts with "-- \n" or "-- \r\n"
    if text.starts_with("-- ") && text.len() < 500 {
        return true;
    }

    // Single div containing just "--" as first text
    if tag == "div" && text.trim().starts_with("-- ") {
        return true;
    }

    false
}

fn is_forwarded_block(text: &str) -> bool {
    text.contains("---------- Forwarded message ----------")
        || text.contains("Begin forwarded message:")
        || text.contains("ForwardedMessage")
}

fn has_class(el: &ElementRef, class: &str) -> bool {
    el.value()
        .attr("class")
        .map_or(false, |c| c.split_whitespace().any(|c| c == class))
}

fn element_text(el: &ElementRef) -> String {
    let mut texts = Vec::new();
    collect_text(el, &mut texts);
    texts.join("")
}

fn collect_text(el: &ElementRef, out: &mut Vec<String>) {
    for child in el.children() {
        match child.value() {
            Node::Text(text) => out.push(text.to_string()),
            Node::Element(_) => {
                if let Some(child_ref) = ElementRef::wrap(child) {
                    collect_text(&child_ref, out);
                }
            }
            _ => {}
        }
    }
}

// ── Plain text parsing ──────────────────────────────────────────────────

pub fn parse_plain_text_body(text: &str) -> ParsedBody {
    let lines: Vec<&str> = text.lines().collect();

    // Find the start of quoted/forwarded content.
    let mut split_at = None;
    let mut sig_at = None;
    let mut fwd_at = None;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // Forwarded message delimiter
        if trimmed.starts_with("---------- Forwarded message ----------")
            || trimmed.starts_with("Begin forwarded message:")
        {
            fwd_at = Some(i);
            break;
        }

        // Standard quote attribution (English)
        if i > 0 && is_quote_attribution(trimmed) {
            split_at = Some(i);
            break;
        }

        // Quote lines starting with >
        if i > 0 && trimmed.starts_with('>') {
            split_at = Some(i);
            break;
        }
    }

    // Look for signature (must be after reply content, before quotes)
    let search_end = split_at.or(fwd_at).unwrap_or(lines.len());
    for i in 0..search_end {
        let trimmed = lines[i].trim();
        if trimmed == "--" || trimmed == "-- " {
            sig_at = Some(i);
            break;
        }
    }

    // Build parts.
    let sig_line = sig_at.unwrap_or(search_end);
    let quote_line = split_at.or(fwd_at).unwrap_or(lines.len());

    let reply = lines[..sig_line.min(quote_line)]
        .join("\n")
        .trim()
        .to_string();
    let signature = if sig_at.is_some() && sig_line < quote_line {
        lines[sig_line..quote_line].join("\n").trim().to_string()
    } else {
        String::new()
    };
    let quoted = if split_at.is_some() {
        lines[quote_line..].join("\n").trim().to_string()
    } else {
        String::new()
    };
    let forwarded = if fwd_at.is_some() {
        lines[fwd_at.unwrap()..].join("\n").trim().to_string()
    } else {
        String::new()
    };

    let has_content = split_at.is_some() || sig_at.is_some() || fwd_at.is_some();
    let parse_status = if has_content { "parsed" } else { "fallback" };

    ParsedBody {
        latest_reply: reply,
        quoted_html: quoted,
        signature,
        forwarded,
        parse_status: parse_status.into(),
    }
}

fn is_quote_attribution(line: &str) -> bool {
    // English: "On <date>, <name> wrote:"
    if line.starts_with("On ") && line.contains("wrote:") {
        return true;
    }
    if line.starts_with("On ") && line.contains("writes:") {
        return true;
    }
    // CJK: "在 2024年1月8日...，alice@example.com 寫道："
    if (line.contains("寫道：") || line.contains("写道：") || line.contains("書きました："))
        && line.contains('@')
    {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── HTML parsing tests ──────────────────────────────────────────────

    #[test]
    fn parse_gmail_quoted_reply_html() {
        let html = r#"<div dir="ltr">Sounds good, let me evaluate the draft.<br><br><div class="gmail_quote"><div dir="ltr">On Thu, Jan 04 2024 at 12:00 PM, &lt;original@example.com&gt; wrote:<br><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex"><div>We should meet next week to discuss.</div></blockquote></div></div></div>"#;
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("Sounds good"));
        assert!(!parsed.latest_reply.contains("We should meet"));
        assert!(parsed.quoted_html.contains("gmail_quote"));
        assert!(parsed.quoted_html.contains("We should meet"));
    }

    #[test]
    fn parse_outlook_reply_html() {
        let html = r#"<div>I agree with the proposal.</div><br><div id="divRplyFwdMsg">From: Alice<br>Sent: Friday<br>To: Eve<br>Subject: Budget<br><hr><br>Here is the budget draft.</div>"#;
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("I agree"));
        assert!(!parsed.latest_reply.contains("budget draft"));
        assert!(parsed.quoted_html.contains("divRplyFwdMsg"));
    }

    #[test]
    fn parse_nested_blockquotes_html() {
        let html = r#"<div>See inline comments.</div><br><blockquote>The API layer should be separate.<blockquote>Why not use gPTI?<blockquote>Because we need caching.</blockquote></blockquote></blockquote>"#;
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("See inline"));
        assert!(parsed.quoted_html.contains("blockquote"));
    }

    #[test]
    fn parse_html_signature() {
        let html = r#"<div>Thanks for the update.</div><div class="gmail_signature">-- <br>John Doe<br>CTO</div>"#;
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("Thanks for the update"));
        assert!(parsed.signature.contains("John Doe"));
    }

    #[test]
    fn parse_html_forwarded() {
        let html = r#"<div>FYI</div><br><div>---------- Forwarded message ----------<br>From: bob@example.com<br>Subject: API</div>"#;
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("FYI"));
        assert!(parsed.forwarded.contains("Forwarded message"));
    }

    #[test]
    fn parse_html_only_no_quotes() {
        let html = "<p>Hello <strong>world</strong></p><p>This is a test.</p>";
        let parsed = parse_html_body(html);
        assert_eq!(parsed.parse_status, "fallback");
        assert!(parsed.latest_reply.contains("Hello"));
        assert!(parsed.quoted_html.is_empty());
    }

    // ── Plain text parsing tests ────────────────────────────────────────

    #[test]
    fn parse_plain_text_gt_quotes() {
        let text = "Agreed, we should ship it this week.\n\nOn Sun, Jan 07, 2024 at 12:00 AM, Alice Smith <smith@example.com> wrote:\n> We are ready to ship.\n> Shall we go live on Monday?";
        let parsed = parse_plain_text_body(text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("Agreed"));
        assert!(!parsed.latest_reply.contains("We are ready"));
        assert!(parsed.quoted_html.contains("> We are ready"));
    }

    #[test]
    fn parse_cjk_attribution() {
        let text = "提案について確認しました。\n\n在 2024年1月8日 週一 12:00，alice@example.com 寫道：\n> 提案について確認しました。";
        let parsed = parse_plain_text_body(text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("提案について確認しました。"));
        assert!(parsed.quoted_html.contains("寫道：") || parsed.quoted_html.contains(">"));
    }

    #[test]
    fn parse_forwarded_message() {
        let text = "FYI\n\n---------- Forwarded message ----------\nFrom: Bob\nDate: Mon, 01 Jan 2024\nSubject: API\n\nWe should use RESTful.";
        let parsed = parse_plain_text_body(text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("FYI"));
        assert!(parsed.forwarded.contains("Forwarded message"));
    }

    #[test]
    fn parse_signature_detection() {
        let text = "Thanks!\n-- \nJohn Doe\nCTO";
        let parsed = parse_plain_text_body(text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("Thanks!"));
        assert!(parsed.signature.contains("John Doe"));
    }

    #[test]
    fn parse_no_quotes_no_sig() {
        let text = "Hello world, this is a plain message.";
        let parsed = parse_plain_text_body(text);
        assert_eq!(parsed.parse_status, "fallback");
        assert_eq!(parsed.latest_reply, text);
    }

    #[test]
    fn parse_empty_body() {
        let parsed = parse_message_body("", "");
        assert_eq!(parsed.parse_status, "fallback");
        assert!(parsed.latest_reply.is_empty());
    }

    #[test]
    fn parse_prefers_html_over_text() {
        let html = r#"<div>HTML reply</div><blockquote>Quoted</blockquote>"#;
        let text = "Text reply\n> Quoted text";
        let parsed = parse_message_body(html, text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("HTML reply"));
    }

    #[test]
    fn parse_falls_back_to_text_when_html_empty() {
        let text = "Text reply\n> Quoted text";
        let parsed = parse_message_body("", text);
        assert_eq!(parsed.parse_status, "parsed");
        assert!(parsed.latest_reply.contains("Text reply"));
    }
}
