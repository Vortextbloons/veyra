use serde::Deserialize;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn new_id(prefix: &str) -> String {
    format!("{}-{}", prefix, now_ms())
}

/// UUID-based ID for new entity types (folders, attachments, tags, AI jobs, AI outputs, AI drafts).
/// Kept separate from `new_id` so existing account IDs retain backward-compatible format.
pub fn new_uuid_id(prefix: &str) -> String {
    format!("{}-{}", prefix, uuid::Uuid::new_v4())
}

pub fn parse_json_vec<T: for<'de> Deserialize<'de>>(value: String) -> Vec<T> {
    serde_json::from_str(&value).unwrap_or_default()
}

pub fn account_initials(name: &str, email: &str) -> String {
    let source = if name.trim().is_empty() { email } else { name };
    source
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(2)
        .collect::<String>()
        .to_uppercase()
}

pub fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
