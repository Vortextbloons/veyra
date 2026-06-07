use std::path::PathBuf;
use std::process::Command;
use std::sync::LazyLock;
use std::time::Duration;

use crate::constants::LM_STUDIO_DEFAULT_BASE_URL;
const SERVER_READY_WAIT_SECS: u64 = 30;
const SERVER_POLL_MS: u64 = 500;

static LMS_PATH: LazyLock<Option<PathBuf>> = LazyLock::new(find_lms_uncached);

/// Find the `lms` CLI. Tauri often inherits a minimal PATH, so check LM Studio install dirs.
fn find_lms() -> Option<PathBuf> {
    LMS_PATH.clone()
}

fn find_lms_uncached() -> Option<PathBuf> {
    if let Ok(output) = Command::new("lms").arg("--version").output() {
        if output.status.success() {
            return Some(PathBuf::from("lms"));
        }
    }

    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let candidates = [
            PathBuf::from(&home)
                .join(".lmstudio")
                .join("bin")
                .join("lms.exe"),
            PathBuf::from(&home)
                .join(".lmstudio")
                .join("bin")
                .join("lms"),
        ];
        for path in candidates {
            if path.exists() {
                return Some(path);
            }
        }
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let path = PathBuf::from(local)
            .join("lm-studio")
            .join("bin")
            .join("lms.exe");
        if path.exists() {
            return Some(path);
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = PathBuf::from("/Applications/LM Studio.app/Contents/MacOS/lms");
        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn run_lms(args: &[&str]) -> Result<std::process::Output, String> {
    let lms = find_lms().ok_or_else(|| {
        "LM Studio CLI (lms) not found. Open LM Studio once, then run `lms bootstrap` in a terminal to add it to PATH.".to_string()
    })?;

    let mut cmd = Command::new(&lms);
    if let Some(bin_dir) = lms.parent() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let bin_str = bin_dir.to_string_lossy();
        #[cfg(target_os = "windows")]
        let new_path = format!("{bin_str};{current_path}");
        #[cfg(not(target_os = "windows"))]
        let new_path = format!("{bin_str}:{current_path}");
        cmd.env("PATH", new_path);
    }

    cmd.args(args)
        .output()
        .map_err(|e| format!("Failed to run lms: {e}"))
}

/// CLI-only startup (safe inside `spawn_blocking` — no reqwest blocking client).
fn start_lms_daemon_and_server() -> Result<(), String> {
    let version = run_lms(&["--version"])?;
    if !version.status.success() {
        return Err(format!(
            "lms --version failed: {}",
            String::from_utf8_lossy(&version.stderr)
        ));
    }

    let daemon = run_lms(&["daemon", "up"])?;
    if !daemon.status.success() {
        return Err(format!(
            "lms daemon up failed: {}",
            String::from_utf8_lossy(&daemon.stderr)
        ));
    }

    let server = run_lms(&["server", "start"])?;
    if !server.status.success() {
        let stderr = String::from_utf8_lossy(&server.stderr);
        let stdout = String::from_utf8_lossy(&server.stdout);
        return Err(format!(
            "lms server start failed: {}{}",
            stderr,
            if stdout.is_empty() {
                String::new()
            } else {
                format!(" ({stdout})")
            }
        ));
    }

    Ok(())
}

async fn is_server_responding(base_url: &str) -> bool {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    client
        .get(&url)
        .send()
        .await
        .map(|res| res.status().is_success())
        .unwrap_or(false)
}

async fn wait_for_server(base_url: &str) -> Result<(), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(SERVER_READY_WAIT_SECS);
    while std::time::Instant::now() < deadline {
        if is_server_responding(base_url).await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(SERVER_POLL_MS)).await;
    }

    Err(format!(
        "LM Studio server was started but did not respond at {base_url} within {SERVER_READY_WAIT_SECS}s. Open LM Studio and enable the local server, or check the port in settings."
    ))
}

#[tauri::command]
pub async fn lm_studio_server_running(base_url: Option<String>) -> Result<bool, String> {
    let base = base_url.unwrap_or_else(|| LM_STUDIO_DEFAULT_BASE_URL.to_string());
    Ok(is_server_responding(base.trim_end_matches('/')).await)
}

#[tauri::command]
pub async fn start_lm_studio_server(base_url: Option<String>) -> Result<String, String> {
    let base = base_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| LM_STUDIO_DEFAULT_BASE_URL.to_string());
    let base = base.trim_end_matches('/').to_string();

    if is_server_responding(&base).await {
        return Ok(format!("{base}/v1/models"));
    }

    tauri::async_runtime::spawn_blocking(start_lms_daemon_and_server)
        .await
        .map_err(|e| format!("LM Studio setup task failed: {e}"))??;

    wait_for_server(&base).await?;

    Ok(format!("{base}/v1/models"))
}
