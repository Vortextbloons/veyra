use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use std::time::Duration;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Veyra/0.1 Research Bot")
        .build()
        .expect("failed to build research HTTP client")
});

const MAX_TEXT_LENGTH: usize = 50_000;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchedSource {
    pub url: String,
    pub title: String,
    pub content_type: String,
    pub text_content: String,
    pub status_code: u16,
    pub fetch_error: Option<String>,
    pub fetched_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchedSourceResult {
    pub url: String,
    pub source: Option<FetchedSource>,
    pub error: Option<String>,
}

pub async fn fetch_source_url(url: String) -> Result<FetchedSource, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "URL scheme '{other}' is not allowed. Use http or https."
            ))
        }
    }

    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status_code = response.status().as_u16();
    if !response.status().is_success() {
        return Err(format!("HTTP {status_code}"));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("text/plain")
        .to_lowercase();

    let body_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read body: {e}"))?;

    let (text_content, title) = if content_type.contains("text/html") {
        let html = String::from_utf8_lossy(&body_bytes).to_string();
        let text = crate::research_html_parser::html_to_text(&html);
        let title = extract_title_from_html(&html)
            .unwrap_or_else(|| parsed.host_str().unwrap_or("Unknown").to_string());
        (truncate_text(text), title)
    } else if content_type.contains("text/plain") {
        let text = String::from_utf8_lossy(&body_bytes).to_string();
        let title = parsed.host_str().unwrap_or("Unknown").to_string();
        (truncate_text(text), title)
    } else if content_type.contains("application/pdf") {
        return Err("PDF parsing not yet implemented".to_string());
    } else {
        let text = String::from_utf8_lossy(&body_bytes).to_string();
        let title = parsed.host_str().unwrap_or("Unknown").to_string();
        (truncate_text(text), title)
    };

    Ok(FetchedSource {
        url,
        title,
        content_type,
        text_content,
        status_code,
        fetch_error: None,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn extract_title_from_html(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title>") {
        let title_start = start + 7;
        if let Some(end) = lower[title_start..].find("</title>") {
            let title = html[title_start..title_start + end].trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

fn truncate_text(text: String) -> String {
    if text.len() > MAX_TEXT_LENGTH {
        text.chars().take(MAX_TEXT_LENGTH).collect()
    } else {
        text
    }
}

pub async fn fetch_source_urls(urls: Vec<String>) -> Vec<FetchedSourceResult> {
    let mut results = Vec::with_capacity(urls.len());
    for url in urls {
        let url_clone = url.clone();
        match fetch_source_url(url).await {
            Ok(source) => {
                results.push(FetchedSourceResult {
                    url: url_clone,
                    source: Some(source),
                    error: None,
                });
            }
            Err(error) => {
                results.push(FetchedSourceResult {
                    url: url_clone,
                    source: None,
                    error: Some(error),
                });
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    results
}
