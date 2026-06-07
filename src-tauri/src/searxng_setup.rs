use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const CONTAINER_NAME: &str = "veyra-searxng";
const SEARXNG_IMAGE: &str = "searxng/searxng";
const SEARXNG_PORT: u16 = 8888;
/// How long to wait for Docker Desktop's engine after launching the app.
const DOCKER_DAEMON_WAIT_SECS: u64 = 90;
const DOCKER_DAEMON_POLL_MS: u64 = 2000;

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

    pub fn clear_started(&self) {
        self.started_by_us.store(false, Ordering::Relaxed);
    }
}

/// Minimal SearXNG settings template — secret key is injected at runtime.
const SEARXNG_SETTINGS_TEMPLATE: &str = r#"use_default_settings: true

server:
  limiter: false
  secret_key: "{secret_key}"

search:
  formats:
    - html
    - json
"#;

#[derive(Serialize)]
pub struct SearxngSetupStatus {
    pub docker_installed: bool,
    pub docker_daemon_running: bool,
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

    #[cfg(target_os = "macos")]
    {
        let candidates = ["/usr/local/bin/docker", "/opt/homebrew/bin/docker"];
        for path in &candidates {
            let p = PathBuf::from(path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    None
}

/// Path to the Docker Desktop application executable (not the `docker` CLI).
fn find_docker_desktop_app() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [PathBuf::from(
            r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        )];
        for p in &candidates {
            if p.exists() {
                return Some(p.clone());
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local)
                .join("Docker")
                .join("Docker")
                .join("Docker Desktop.exe");
            if p.exists() {
                return Some(p);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let p = PathBuf::from("/Applications/Docker.app/Contents/MacOS/Docker");
        if p.exists() {
            return Some(p);
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
        #[cfg(windows)]
        let separator = ";";
        #[cfg(not(windows))]
        let separator = ":";
        let new_path = format!("{bin_str}{separator}{current_path}");
        cmd.env("PATH", new_path);
    }
    cmd.args(args)
        .output()
        .map_err(|e| format!("Failed to run docker: {e}"))
}

/// Map raw Docker CLI stderr to actionable messages (daemon down, npipe missing, etc.).
fn normalize_docker_error(stderr: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("dockerdesktoplinuxengine")
        || lower.contains("cannot connect to the docker daemon")
        || lower.contains("failed to connect to the docker api")
        || lower.contains("error during connect")
        || lower.contains("is the docker daemon running")
        || lower.contains("the system cannot find the file specified")
    {
        return "Docker is installed but the daemon is not running. Start Docker Desktop and try again.".into();
    }
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        "Docker command failed with no error output.".into()
    } else {
        trimmed.into()
    }
}

fn run_docker_checked(args: &[&str]) -> Result<std::process::Output, String> {
    let output = run_docker(args)?;
    if output.status.success() {
        return Ok(output);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let command = args.first().copied().unwrap_or("docker");
    Err(format!(
        "docker {command} failed: {}",
        normalize_docker_error(&stderr)
    ))
}

fn check_docker_installed() -> Result<bool, String> {
    Ok(find_docker().is_some())
}

fn is_docker_daemon_running() -> bool {
    run_docker(&["info", "-f", "{{.ServerVersion}}"])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn check_docker_daemon() -> Result<bool, String> {
    if !check_docker_installed()? {
        return Ok(false);
    }
    Ok(is_docker_daemon_running())
}

/// Launch Docker Desktop when the engine is not running (class-lab friendly).
fn try_start_docker_desktop() -> Result<(), String> {
    // Docker Desktop 4.37+ — preferred when the CLI is on PATH.
    if let Ok(output) = run_docker(&["desktop", "start"]) {
        if output.status.success() {
            return Ok(());
        }
    }

    if let Some(app) = find_docker_desktop_app() {
        std::process::Command::new(&app)
            .spawn()
            .map_err(|e| format!("Failed to launch Docker Desktop: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        if std::process::Command::new("open")
            .args(["-a", "Docker"])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }

    Err(
        "Could not start Docker Desktop automatically. Open Docker Desktop manually, or in Docker Desktop → Settings → General enable \"Start Docker Desktop when you sign in to your computer\".".into(),
    )
}

fn wait_for_docker_daemon() -> Result<(), String> {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_secs(DOCKER_DAEMON_WAIT_SECS);
    while std::time::Instant::now() < deadline {
        if is_docker_daemon_running() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(DOCKER_DAEMON_POLL_MS));
    }
    Err(format!(
        "Docker Desktop did not become ready within {DOCKER_DAEMON_WAIT_SECS} seconds. \
         Open Docker Desktop once, or enable \"Start Docker Desktop when you sign in\" under Settings → General."
    ))
}

fn ensure_docker_daemon() -> Result<(), String> {
    find_docker().ok_or_else(|| {
        "Docker is not installed. Install Docker Desktop to use automatic SearXNG setup."
            .to_string()
    })?;

    if is_docker_daemon_running() {
        return Ok(());
    }

    try_start_docker_desktop()?;
    wait_for_docker_daemon()
}

fn pull_searxng_image() -> Result<(), String> {
    run_docker_checked(&["pull", SEARXNG_IMAGE])?;
    Ok(())
}

/// Returns (exists, running).
fn check_container() -> Result<(bool, bool), String> {
    // Does the container exist (any state)?
    let output = run_docker_checked(&[
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
    let output = run_docker_checked(&[
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

fn wait_for_searxng_health() -> Result<(), String> {
    let url = format!("http://127.0.0.1:{SEARXNG_PORT}/search?q=health&format=json&pageno=1");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .user_agent("Veyra/0.1")
        .build()
        .map_err(|e| format!("Failed to create health check client: {e}"))?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    while std::time::Instant::now() < deadline {
        if let Ok(response) = client.get(&url).send() {
            if response.status().is_success() {
                return Ok(());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    Err(
        "SearXNG container started but did not respond to HTTP health checks within 30 seconds."
            .into(),
    )
}

/// Check Docker + container status. Non-blocking — just reads state.
#[tauri::command]
pub async fn check_searxng_setup() -> Result<SearxngSetupStatus, String> {
    tauri::async_runtime::spawn_blocking(check_searxng_setup_sync)
        .await
        .map_err(|error| format!("SearXNG status task failed: {error}"))?
}

fn check_searxng_setup_sync() -> Result<SearxngSetupStatus, String> {
    let docker_installed = check_docker_installed()?;
    let docker_daemon_running = if docker_installed {
        check_docker_daemon()?
    } else {
        false
    };
    let (container_exists, container_running) = if docker_daemon_running {
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
        docker_daemon_running,
        container_exists,
        container_running,
        searxng_url,
    })
}

fn generate_searxng_secret_key() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::SystemTime;

    let mut hasher = DefaultHasher::new();
    SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    format!("veyra-{:016x}", hasher.finish())
}

fn load_or_create_searxng_secret(settings_dir: &std::path::Path) -> Result<String, String> {
    let secret_path = settings_dir.join("secret_key");
    if secret_path.exists() {
        let key = std::fs::read_to_string(&secret_path)
            .map_err(|e| format!("Failed to read SearXNG secret key: {e}"))?
            .trim()
            .to_string();
        if !key.is_empty() {
            return Ok(key);
        }
    }

    let key = generate_searxng_secret_key();
    std::fs::write(&secret_path, &key)
        .map_err(|e| format!("Failed to write SearXNG secret key: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&secret_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set SearXNG secret key permissions: {e}"))?;
    }

    Ok(key)
}

/// Start (or create + start) the SearXNG container. Returns the URL on success.
///
/// If the container already exists we remove it first so that updated settings
/// are applied on the next start. May launch Docker Desktop and wait up to
/// [`DOCKER_DAEMON_WAIT_SECS`] when the engine is not running.
fn start_searxng_container_sync() -> Result<String, String> {
    ensure_docker_daemon()?;
    pull_searxng_image()?;

    // Write a minimal settings.yml that enables JSON and disables the limiter.
    let settings_dir = std::env::temp_dir().join("veyra-searxng");
    std::fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings dir: {e}"))?;
    let settings_path = settings_dir.join("settings.yml");
    let secret_key = load_or_create_searxng_secret(&settings_dir)?;
    let settings_yml = SEARXNG_SETTINGS_TEMPLATE.replace("{secret_key}", &secret_key);
    std::fs::write(&settings_path, settings_yml)
        .map_err(|e| format!("Failed to write SearXNG settings: {e}"))?;

    // Remove existing container (stopped or running) so we can recreate with
    // the correct port mapping and mounted settings.
    let (exists, running) = check_container()?;
    if running {
        run_docker_checked(&["stop", CONTAINER_NAME])?;
    }
    if exists {
        run_docker_checked(&["rm", CONTAINER_NAME])?;
        // Brief pause so Docker releases the name
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // Create and start a fresh container with the settings file mounted.
    let host_path = settings_path.to_string_lossy().to_string();
    let mount_arg = format!("{host_path}:/etc/searxng/settings.yml:ro");
    let port_arg = format!("127.0.0.1:{SEARXNG_PORT}:8080");

    run_docker_checked(&[
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
        SEARXNG_IMAGE,
    ])
    .map_err(|e| format!("Failed to create SearXNG container: {e}"))?;

    // Give SearXNG a moment to start listening, then verify HTTP health.
    wait_for_searxng_health()?;

    // Verify it's actually running
    let (_exists, running) = check_container()?;
    if !running {
        let logs = run_docker(&["logs", "--tail", "30", CONTAINER_NAME])
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty());
        let detail = logs
            .map(|l| format!(" Container logs:\n{l}"))
            .unwrap_or_default();
        return Err(format!(
            "SearXNG container was created but is not running. Check Docker logs for errors.{detail}"
        ));
    }

    Ok(format!("http://localhost:{SEARXNG_PORT}"))
}

#[tauri::command]
pub async fn start_searxng_container(
    state: tauri::State<'_, SearxngState>,
) -> Result<String, String> {
    let url = tauri::async_runtime::spawn_blocking(start_searxng_container_sync)
        .await
        .map_err(|e| format!("SearXNG setup task failed: {e}"))??;

    state.mark_started();
    Ok(url)
}

/// Stop the SearXNG container.
#[tauri::command]
pub async fn stop_searxng_container(state: tauri::State<'_, SearxngState>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(stop_container)
        .await
        .map_err(|error| format!("SearXNG stop task failed: {error}"))?;
    state.clear_started();
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
