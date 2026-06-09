pub fn html_to_text(html: &str) -> String {
    let mut text = html.to_string();

    // Remove script and style blocks before stripping tags
    text = remove_tag_blocks(&text, "script");
    text = remove_tag_blocks(&text, "style");

    // Replace common block-level tags with newlines
    let replacements = [
        ("<br>", "\n"),
        ("<br/>", "\n"),
        ("<br />", "\n"),
        ("<p>", "\n"),
        ("</p>", "\n"),
        ("<div>", "\n"),
        ("</div>", "\n"),
        ("<li>", "\n"),
        ("</li>", "\n"),
        ("<tr>", "\n"),
        ("</tr>", "\n"),
        ("<h1>", "\n"),
        ("</h1>", "\n"),
        ("<h2>", "\n"),
        ("</h2>", "\n"),
        ("<h3>", "\n"),
        ("</h3>", "\n"),
        ("<h4>", "\n"),
        ("</h4>", "\n"),
        ("<h5>", "\n"),
        ("</h5>", "\n"),
        ("<h6>", "\n"),
        ("</h6>", "\n"),
    ];
    for (from, to) in &replacements {
        text = text.replace(from, to);
    }

    // Strip all remaining HTML tags
    let mut result = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }

    // Decode common HTML entities
    result = result.replace("&lt;", "<");
    result = result.replace("&gt;", ">");
    result = result.replace("&amp;", "&");
    result = result.replace("&quot;", "\"");
    result = result.replace("&#39;", "'");
    result = result.replace("&nbsp;", " ");

    // Collapse multiple newlines to max two and trim
    while result.contains("  ") {
        result = result.replace("  ", " ");
    }
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }

    result.trim().to_string()
}

fn remove_tag_blocks(html: &str, tag: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let lower = html.to_lowercase();
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let mut i = 0;

    while i < html.len() {
        if let Some(start) = lower[i..].find(&open) {
            let abs_start = i + start;
            // Find the end of the opening tag
            if let Some(tag_end) = html[abs_start..].find('>') {
                let after_open = abs_start + tag_end + 1;
                if let Some(close_start) = lower[after_open..].find(&close) {
                    let abs_end = after_open + close_start + close.len();
                    result.push_str(&html[i..abs_start]);
                    i = abs_end;
                    continue;
                }
            }
            result.push_str(&html[i..]);
            break;
        }
        result.push_str(&html[i..]);
        break;
    }

    result
}
