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
    let mut result = html.to_string();
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);

    loop {
        let lower = result.to_lowercase();
        let Some(start) = lower.find(&open) else {
            break;
        };
        let after_open = match result[start..].find('>') {
            Some(tag_end) => start + tag_end + 1,
            None => break,
        };
        let Some(close_start) = lower[after_open..].find(&close) else {
            break;
        };
        let end = after_open + close_start + close.len();
        result = format!("{}{}", &result[..start], &result[end..]);
    }

    result
}
