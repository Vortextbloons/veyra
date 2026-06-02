use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const CONTAINER_NAME: &str = "veyra-searxng";
const SEARXNG_PORT: u16 = 8888;

/// Tracks whether Veyra started the SearXNG container during this session.
/// Used by the close handler to know if it should stop the container.
pub struct SearxngState {
    started_by_us: Arc<AtomicBool>,
}

impl SearxngState {
    pub fn new() -> Self {
        Self {
            started_by_us: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn mark_started(&self) {
        self.started_by_us.store(true, Ordering::Relaxed);
    }

    pub fn was_started_by_us(&self) -> bool {
        self.started_by_us.load(Ordering::Relaxed)
    }
}

/// Minimal SearXNG settings that enable JSON output and disable the rate
/// limiter so the app can query the instance programmatically.
const SEARXNG_SETTINGS_YML: &str = r#"use_default_settings: true

server:
  limiter: false
  secret_key: "veyra-searxng-local"

search:
  formats:
    - html
    - json
"#;

#[derive(Serialize)]
pub struct SearxngSetupStatus {
    pub docker_installed: bool,
    pub container_exists: bool,
    pub container_running: bool,
    pub searxng_url: String,
}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Find the docker binary. Tries `docker` in PATH first, then common
/// Docker Desktop install locations on Windows.
fn find_docker() -> Option<PathBuf> {
    // 1. Try `docker` in PATH
    if let Ok(output) = Command::new("docker").arg("--version").output() {
        if output.status.success() {
            return Some(PathBuf::from("docker"));
        }
    }

    // 2. Try common Windows Docker Desktop paths
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
            r"C:\ProgramData\DockerDesktop\version-bin\docker.exe",
        ];
        for path in &candidates {
            let p = PathBuf::from(path);
            if p.exists() {
                return Some(p);
            }
        }

        // 3. Check user-level install (AppData\Local\Docker)
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(&local)
                .join("Docker")
                .join("Docker")
                .join("resources")
                .join("bin")
                .join("docker.exe");
            if p.exists() {
                return Some(p);
            }
        }
    }

    None
}

fn run_docker(args: &[&str]) -> Result<std::process::Output, String> {
    let docker = find_docker().ok_or("Docker not found")?;

    // Ensure the directory containing the docker binary is in PATH so that
    // helper executables like `docker-credential-desktop` can be found.
    let mut cmd = Command::new(&docker);
    if let Some(bin_dir) = docker.parent() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let bin_str = bin_dir.to_string_lossy();
        let new_path = format!("{bin_str};{current_path}");
        cmd.env("PATH", new_path);
    }
    cmd.args(args)
        .output()
        .map_err(|e| format!("Failed to run docker: {e}"))
}

fn check_docker_installed() -> Result<bool, String> {
    Ok(find_docker().is_some())
}

/// Returns (exists, running).
fn check_container() -> Result<(bool, bool), String> {
    // Does the container exist (any state)?
    let output = run_docker(&[
        "ps",
        "-a",
        "--filter",
        &format!("name={CONTAINER_NAME}"),
        "--format",
        "{{.Names}}",
    ])?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let exists = stdout.trim().contains(CONTAINER_NAME);

    if !exists {
        return Ok((false, false));
    }

    // Is it running?
    let output = run_docker(&[
        "ps",
        "--filter",
        &format!("name={CONTAINER_NAME}"),
        "--format",
        "{{.Names}}",
    ])?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let running = stdout.trim().contains(CONTAINER_NAME);

    Ok((exists, running))
}

// ── commands ──────────────────────────────────────────────────────────────────

/// Check Docker + container status. Non-blocking — just reads state.
#[tauri::command]
pub async fn check_searxng_setup() -> Result<SearxngSetupStatus, String> {
    let docker_installed = check_docker_installed()?;
    let (container_exists, container_running) = if docker_installed {
        check_container()?
    } else {
        (false, false)
    };

    let searxng_url = if container_running {
        format!("http://localhost:{SEARXNG_PORT}")
    } else {
        String::new()
    };

    Ok(SearxngSetupStatus {
        docker_installed,
        container_exists,
        container_running,
        searxng_url,
    })
}

/// Start (or create + start) the SearXNG container. Returns the URL on success.
///
/// If the container already exists we remove it first so that updated settings
/// are applied on the next start.
#[tauri::command]
pub async fn start_searxng_container(
    state: tauri::State<'_, SearxngState>,
) -> Result<String, String> {
    let _docker = find_docker().ok_or("Docker is not installed. Install Docker Desktop to use automatic SearXNG setup.")?;

    // Write a minimal settings.yml that enables JSON and disables the limiter.
    let settings_dir = std::env::temp_dir().join("veyra-searxng");
    std::fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings dir: {e}"))?;
    let settings_path = settings_dir.join("settings.yml");
    std::fs::write(&settings_path, SEARXNG_SETTINGS_YML)
        .map_err(|e| format!("Failed to write SearXNG settings: {e}"))?;

    // Remove existing container (stopped or running) so we can recreate with
    // the correct port mapping and mounted settings.
    let (exists, running) = check_container()?;
    if running {
        let _ = run_docker(&["stop", CONTAINER_NAME]);
    }
    if exists {
        let _ = run_docker(&["rm", CONTAINER_NAME]);
        // Brief pause so Docker releases the name
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // Create and start a fresh container with the settings file mounted.
    let host_path = settings_path.to_string_lossy().to_string();
    let mount_arg = format!("{host_path}:/etc/searxng/settings.yml:ro");
    let port_arg = format!("127.0.0.1:{SEARXNG_PORT}:8080");

    let output = run_docker(&[
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "-p",
        &port_arg,
        "-v",
        &mount_arg,
        "-e",
        "SEARXNG_BASE_URL=http://localhost:8888/",
        "searxng/searxng",
    ])?;
    if !output.status.success() {
        return Err(format!(
            "Failed to create SearXNG container: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Give SearXNG a moment to start listening
    std::thread::sleep(std::time::Duration::from_secs(4));

    // Verify it's actually running
    let (_exists, running) = check_container()?;
    if !running {
        return Err("SearXNG container was started but is not running. Check Docker logs for errors.".into());
    }

    state.mark_started();

    Ok(format!("http://localhost:{SEARXNG_PORT}"))
}

/// Stop the SearXNG container.
#[tauri::command]
pub async fn stop_searxng_container() -> Result<(), String> {
    stop_container();
    Ok(())
}

/// Stop the SearXNG container synchronously. Used by the close handler.
pub fn stop_container() {
    if let Ok(output) = run_docker(&["stop", CONTAINER_NAME]) {
        if !output.status.success() {
            eprintln!(
                "[SearXNG] Failed to stop container on close: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
