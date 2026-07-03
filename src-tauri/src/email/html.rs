use ammonia::Builder;
use scraper::Html;

/// Sanitize email HTML for safe rendering.
///
/// - Strips scripts, event handlers, unsafe URLs, forms, iframes
/// - Blocks remote images (http/https src) by replacing with data-remote-src
/// - Preserves cid: images (inline content-id)
/// - Adds rel/target attributes to links
pub fn sanitize_email_html(html: &str) -> String {
    let mut builder = Builder::default();

    builder
        .add_tags(&[
            "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u",
            "ul", "ol", "li", "blockquote", "pre", "code", "h1", "h2", "h3",
            "h4", "h5", "h6", "hr", "table", "thead", "tbody", "tr", "td", "th",
            "img", "sub", "sup", "small", "font",
        ])
        .add_tag_attributes("a", &["href", "title"])
        .add_tag_attributes("img", &["src", "alt", "width", "height", "data-remote-src"])
        .add_tag_attributes("td", &["colspan", "rowspan", "valign", "align"])
        .add_tag_attributes("th", &["colspan", "rowspan", "valign", "align"])
        .add_tag_attributes("table", &["cellpadding", "cellspacing", "border", "width"])
        .add_tag_attributes("font", &["color", "size", "face"])
        .add_tag_attributes("blockquote", &["style", "type"])
        .add_tag_attributes("div", &["style", "id", "class"])
        .add_tag_attributes("span", &["style", "class"])
        .add_tag_attributes("p", &["style", "class"])
        .add_tag_attributes("pre", &["style", "class"])
        .add_generic_attributes(&["style", "class", "id"])
        .link_rel(Some("noopener noreferrer nofollow"))
        .clean_content_tags(["style"].into_iter().collect());

    let cleaned = builder.clean(html).to_string();

    // Post-process: block remote images, fix link targets.
    post_process_email_html(&cleaned)
}

fn post_process_email_html(html: &str) -> String {
    let mut result = html.to_string();

    // Block remote images: find src="http... and replace with data-remote-src="http...
    for prefix in &["src=\"https://", "src=\"http://"] {
        let mut offset = 0;
        while let Some(pos) = result[offset..].find(prefix) {
            let abs_pos = offset + pos;
            // Find the closing quote.
            let val_start = abs_pos + prefix.len();
            if let Some(end) = result[val_start..].find('"') {
                let url = result[val_start..val_start + end].to_string();
                // Replace just the src= part with data-remote-src=
                let old = format!("src=\"{url}\"");
                let new = format!("data-remote-src=\"{url}\"");
                let replace_range = abs_pos..abs_pos + old.len();
                result.replace_range(replace_range, &new);
                offset = abs_pos + new.len();
            } else {
                break;
            }
        }
    }

    // Add target="_blank" to links with external-looking hrefs.
    // ammonia may strip the scheme, so check for href=" patterns that aren't cid: or relative.
    {
        let mut offset = 0;
        while let Some(pos) = result[offset..].find("href=\"") {
            let abs_pos = offset + pos;
            let val_start = abs_pos + 6; // after href="
            if let Some(end) = result[val_start..].find('"') {
                let url = result[val_start..val_start + end].to_string();
                // Skip cid: and empty hrefs.
                if !url.starts_with("cid:") && !url.is_empty() && !url.starts_with('#') {
                    // Check if target="_blank" already present nearby.
                    let check_end = (abs_pos + 200).min(result.len());
                    let nearby = &result[abs_pos..check_end];
                    if !nearby.contains("target=\"_blank\"") {
                        let insert_pos = val_start + end + 1; // after closing quote
                        let insertion = " target=\"_blank\"";
                        result.insert_str(insert_pos, insertion);
                        offset = insert_pos + insertion.len();
                    } else {
                        offset = val_start + end + 1;
                    }
                } else {
                    offset = val_start + end + 1;
                }
            } else {
                break;
            }
        }
    }

    result
}

/// Convert HTML to plain text for fallback display.
/// Extracts text content while preserving some structure.
pub fn html_to_plain_text(html: &str) -> String {
    let document = Html::parse_fragment(html);
    let mut texts = Vec::new();
    collect_text_nodes(&document.root_element(), &mut texts);
    texts.join("")
}

fn collect_text_nodes(element: &scraper::ElementRef, out: &mut Vec<String>) {
    use scraper::Node;

    for child in element.children() {
        match child.value() {
            Node::Text(text) => {
                out.push(text.to_string());
            }
            Node::Element(tag) => {
                let tag_name = tag.name();
                if matches!(
                    tag_name,
                    "p" | "div" | "br" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
                        | "li" | "tr" | "blockquote" | "hr"
                ) {
                    if !out.last().map_or(false, |s| s.ends_with('\n')) {
                        out.push("\n".to_string());
                    }
                }
                if let Some(child_ref) = scraper::ElementRef::wrap(child) {
                    collect_text_nodes(&child_ref, out);
                }
                if tag_name == "br" {
                    out.push("\n".to_string());
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_scripts() {
        let input = "<p>Hello</p><script>alert(1)</script>";
        let result = sanitize_email_html(input);
        assert!(result.contains("<p>Hello</p>"));
        assert!(!result.contains("<script"));
        assert!(!result.contains("</script>"));
    }

    #[test]
    fn sanitize_strips_event_handlers() {
        let input = "<p onclick=\"xss()\">Hi</p>";
        let result = sanitize_email_html(input);
        assert!(result.contains("Hi"));
        assert!(!result.contains("onclick"));
    }

    #[test]
    fn sanitize_blocks_remote_images() {
        let input = "<img src=\"https://tracker.com/pixel.png\" alt=\"track\">";
        let result = sanitize_email_html(input);
        assert!(result.contains("data-remote-src"));
        assert!(result.contains("alt=\"track\""));
    }

    #[test]
    fn sanitize_allows_safe_html() {
        let input = "<p><strong>Bold</strong> and <em>italic</em></p>";
        let result = sanitize_email_html(input);
        assert!(result.contains("<strong>Bold</strong>"));
        assert!(result.contains("<em>italic</em>"));
    }

    #[test]
    fn sanitize_strips_iframe() {
        let input = "<p>Hello</p><iframe src=\"https://evil.com\"></iframe>";
        let result = sanitize_email_html(input);
        assert!(result.contains("Hello"));
        assert!(!result.contains("iframe"));
    }

    #[test]
    fn sanitize_strips_javascript_urls() {
        let input = "<a href=\"javascript:alert(1)\">link</a>";
        let result = sanitize_email_html(input);
        assert!(result.contains("link"));
        assert!(!result.contains("javascript"));
    }

    #[test]
    fn sanitize_adds_link_rel() {
        let input = "<a href=\"https://example.com\">link</a>";
        let result = sanitize_email_html(input);
        assert!(result.contains("rel=\"noopener noreferrer nofollow\""));
    }

    #[test]
    fn html_to_plain_text_basic() {
        let input = "<p>Hello <strong>world</strong></p>";
        let result = html_to_plain_text(input);
        assert!(result.contains("Hello world"));
    }

    #[test]
    fn html_to_plain_text_preserves_br() {
        let input = "<p>Line 1<br>Line 2</p>";
        let result = html_to_plain_text(input);
        assert!(result.contains("Line 1"));
        assert!(result.contains("Line 2"));
    }

    #[test]
    fn html_to_plain_text_nested() {
        let input = "<div><p>One</p><p>Two</p></div>";
        let result = html_to_plain_text(input);
        assert!(result.contains("One"));
        assert!(result.contains("Two"));
    }
}
