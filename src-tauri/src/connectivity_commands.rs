use std::sync::LazyLock;

static PROBE_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .user_agent("Veyra/0.1")
        .build()
        .expect("failed to build connectivity probe HTTP client")
});

/// Endpoints used to detect general internet reachability. Tried in order;
/// the first successful 2xx response counts as online.
const PROBE_URLS: &[&str] = &[
    "https://1.1.1.1/cdn-cgi/trace",
    "https://www.google.com/generate_204",
    "http://connectivitycheck.gstatic.com/generate_204",
];

#[tauri::command]
pub async fn probe_internet_connectivity() -> Result<bool, String> {
    for url in PROBE_URLS {
        let Ok(response) = PROBE_CLIENT.get(*url).send().await else {
            continue;
        };
        if response.status().is_success() {
            return Ok(true);
        }
    }

    Ok(false)
}
