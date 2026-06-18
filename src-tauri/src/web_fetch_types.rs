use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;

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

pub const USER_AGENT: &str = "Mozilla/5.0 (compatible; Veyra/0.1; +https://github.com/anomalyco/veyra)";
pub const MAX_BODY_BYTES: usize = 5_000_000;
pub const MIN_CONTENT_CHARS: usize = 200;

pub static FETCH_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        // Do not auto-follow redirects: each target would need its own SSRF
        // validation, and reqwest's automatic policy cannot enforce that here.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to build fetch client")
});

pub const YOUTUBE_CACHE_TTL_SECS: i64 = 7 * 24 * 60 * 60;
pub const INNERTUBE_PLAYER_URL: &str = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
pub const INNERTUBE_ANDROID_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

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
