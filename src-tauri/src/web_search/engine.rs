//! Bundled local search engine (DonSeTch) lifecycle and MCP bridge.
//!
//! The engine is a separate process shipped in the installer. It is started
//! with the app on an ephemeral loopback port, protected by a per-session
//! bearer token, and killed with the app. It is never linked as a Rust crate:
//! DonSeTch is AGPL-3.0 and Veyra talks to it over MCP.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use super::commands::{simple_hash, TauriSearchResponse, TauriSearchResult};

const ENGINE_START_TIMEOUT: Duration = Duration::from_secs(25);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(150);
const MCP_CALL_TIMEOUT: Duration = Duration::from_secs(45);
const ENGINE_VERSION_FALLBACK: &str = "unknown";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchEngineStatusKind {
    Stopped,
    Starting,
    Ready,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchEngineStatus {
    pub state: SearchEngineStatusKind,
    pub version: String,
    pub url: Option<String>,
    pub message: Option<String>,
    pub log_path: String,
}

struct EngineEndpoint {
    url: String,
    token: String,
}

/// Kill-on-close job object. If Veyra crashes, Windows closes the handle and
/// terminates the engine's whole process tree with it.
#[cfg(target_os = "windows")]
struct EngineJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
unsafe impl Send for EngineJob {}
#[cfg(target_os = "windows")]
unsafe impl Sync for EngineJob {}

#[cfg(target_os = "windows")]
fn create_engine_job() -> Option<EngineJob> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return None;
        }
        let mut information: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &information as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if configured == 0 {
            CloseHandle(job);
            return None;
        }
        Some(EngineJob(job))
    }
}

#[cfg(target_os = "windows")]
fn assign_process_to_job(job: &EngineJob, process_id: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, FALSE};
    use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    unsafe {
        let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, process_id);
        if process.is_null() {
            return false;
        }
        let assigned = AssignProcessToJobObject(job.0, process) != 0;
        CloseHandle(process);
        assigned
    }
}

#[cfg(target_os = "windows")]
fn close_engine_job(job: EngineJob) {
    unsafe {
        windows_sys::Win32::Foundation::CloseHandle(job.0);
    }
}

struct EngineInner {
    app: AppHandle,
    status: parking_lot::Mutex<SearchEngineStatus>,
    child: parking_lot::Mutex<Option<Child>>,
    endpoint: parking_lot::Mutex<Option<EngineEndpoint>>,
    start_lock: tokio::sync::Mutex<()>,
    #[cfg(target_os = "windows")]
    job: parking_lot::Mutex<Option<EngineJob>>,
}

/// App-managed search engine. Cloning shares the same process handle.
#[derive(Clone)]
pub struct SearchEngineState {
    inner: Arc<EngineInner>,
}

impl SearchEngineState {
    pub fn new(app: AppHandle) -> Self {
        let log_path = log_file_path(&app);
        let version = engine_version(&app).unwrap_or_else(|| ENGINE_VERSION_FALLBACK.to_string());
        Self {
            inner: Arc::new(EngineInner {
                app,
                status: parking_lot::Mutex::new(SearchEngineStatus {
                    state: SearchEngineStatusKind::Stopped,
                    version,
                    url: None,
                    message: None,
                    log_path: log_path
                        .as_ref()
                        .map(|path| path.to_string_lossy().to_string())
                        .unwrap_or_default(),
                }),
                child: parking_lot::Mutex::new(None),
                endpoint: parking_lot::Mutex::new(None),
                start_lock: tokio::sync::Mutex::new(()),
                #[cfg(target_os = "windows")]
                job: parking_lot::Mutex::new(None),
            }),
        }
    }

    /// Start the engine without blocking the UI. Safe to call more than once.
    pub fn start_background(&self) {
        let inner = Arc::clone(&self.inner);
        tauri::async_runtime::spawn(async move {
            if let Err(error) = inner.ensure_ready().await {
                eprintln!("[search-engine] startup failed: {error}");
            }
        });
    }

    pub fn status(&self) -> SearchEngineStatus {
        self.inner.status.lock().clone()
    }

    pub async fn ensure_ready(&self) -> Result<String, String> {
        self.inner.ensure_ready().await
    }

    pub async fn restart(&self) -> Result<SearchEngineStatus, String> {
        let guard = self.inner.start_lock.lock().await;
        self.inner.stop_sync();
        let inner = Arc::clone(&self.inner);
        tauri::async_runtime::spawn_blocking(move || inner.start_sync())
            .await
            .map_err(|error| format!("Search engine restart task failed: {error}"))??;
        drop(guard);
        Ok(self.status())
    }

    pub async fn stop(&self) {
        let inner = Arc::clone(&self.inner);
        let _ = tauri::async_runtime::spawn_blocking(move || inner.stop_sync()).await;
    }

    /// Synchronous best-effort shutdown for window/exit handlers.
    pub fn stop_now(&self) {
        self.inner.stop_sync();
    }

    pub fn read_logs(&self, max_chars: usize) -> Result<String, String> {
        let path = self.inner.status.lock().log_path.clone();
        if path.is_empty() {
            return Ok(String::new());
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|error| format!("Could not read search engine log: {error}"))?;
        if content.len() <= max_chars {
            return Ok(content);
        }
        let start = content.len().saturating_sub(max_chars);
        Ok(content[start..].to_string())
    }
}

impl EngineInner {
    async fn ensure_ready(self: &Arc<Self>) -> Result<String, String> {
        let _guard = self.start_lock.lock().await;

        if let Some(url) = self.ready_url() {
            return Ok(url);
        }

        let inner = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || inner.start_sync())
            .await
            .map_err(|error| format!("Search engine startup task failed: {error}"))?
    }

    fn ready_url(&self) -> Option<String> {
        let status = self.status.lock();
        if status.state == SearchEngineStatusKind::Ready {
            status.url.clone()
        } else {
            None
        }
    }

    fn start_sync(self: &Arc<Self>) -> Result<String, String> {
        self.set_status(SearchEngineStatusKind::Starting, None, None);

        let engine_dir = match engine_directory(&self.app) {
            Ok(directory) => directory,
            Err(error) => {
                self.set_status(SearchEngineStatusKind::Failed, None, Some(error.clone()));
                return Err(error);
            }
        };

        let cache_dir = match app_cache_directory(&self.app) {
            Ok(directory) => directory,
            Err(error) => {
                self.set_status(SearchEngineStatusKind::Failed, None, Some(error.clone()));
                return Err(error);
            }
        };

        if let Err(error) = seed_rerank_model(&engine_dir, &cache_dir) {
            eprintln!("[search-engine] could not seed rerank model: {error}");
        }

        let log_path = log_file_path(&self.app);
        if let Some(path) = log_path.as_ref() {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        let mut last_error = String::new();

        for attempt in 0..3u8 {
            let port = match pick_loopback_port() {
                Ok(port) => port,
                Err(error) => {
                    last_error = error;
                    continue;
                }
            };
            let token = generate_token();
            let child =
                match spawn_engine(&engine_dir, &cache_dir, log_path.as_deref(), port, &token) {
                    Ok(child) => child,
                    Err(error) => {
                        last_error = error;
                        continue;
                    }
                };

            let process_id = child.id();
            #[cfg(target_os = "windows")]
            {
                let job = create_engine_job();
                if let Some(job) = job.as_ref() {
                    if !assign_process_to_job(job, process_id) {
                        eprintln!(
                            "[search-engine] could not attach the engine to a job object; falling back to taskkill"
                        );
                    }
                }
                if let Some(previous) = self.job.lock().take() {
                    close_engine_job(previous);
                }
                *self.job.lock() = job;
            }
            let _ = process_id;

            *self.child.lock() = Some(child);
            let health = wait_for_health(port, &self.child);

            match health {
                Ok(()) => {
                    let url = format!("http://127.0.0.1:{port}");
                    *self.endpoint.lock() = Some(EngineEndpoint {
                        url: url.clone(),
                        token,
                    });
                    self.set_status(SearchEngineStatusKind::Ready, Some(url.clone()), None);
                    return Ok(url);
                }
                Err(error) => {
                    last_error = error;
                    self.stop_sync();
                    if attempt < 2 {
                        std::thread::sleep(Duration::from_millis(250));
                    }
                }
            }
        }

        let detail = log_tail(log_path.as_deref(), 2_000);
        let message = if detail.is_empty() {
            last_error
        } else {
            format!("{last_error}\n\n{detail}")
        };
        self.set_status(SearchEngineStatusKind::Failed, None, Some(message.clone()));
        Err(message)
    }

    fn stop_sync(&self) {
        let child = self.child.lock().take();
        if let Some(mut child) = child {
            #[cfg(target_os = "windows")]
            {
                let mut command = Command::new("taskkill");
                command
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                crate::shared::process::hide_console(&mut command);
                let _ = command.status();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        #[cfg(target_os = "windows")]
        if let Some(job) = self.job.lock().take() {
            close_engine_job(job);
        }
        *self.endpoint.lock() = None;
        let already_stopped = self.status.lock().state == SearchEngineStatusKind::Stopped;
        if !already_stopped {
            self.set_status(SearchEngineStatusKind::Stopped, None, None);
        }
    }

    fn set_status(
        &self,
        state: SearchEngineStatusKind,
        url: Option<String>,
        message: Option<String>,
    ) {
        let mut status = self.status.lock();
        status.state = state;
        status.url = url;
        status.message = message;
    }
}

impl Drop for EngineInner {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        #[cfg(target_os = "windows")]
        if let Some(job) = self.job.lock().take() {
            close_engine_job(job);
        }
    }
}

// ── Engine paths ───────────────────────────────────────────────────────────

fn engine_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "donsetch.exe"
    } else {
        "donsetch"
    }
}

fn engine_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("search-engine"));
    }
    #[cfg(debug_assertions)]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("search-engine"),
        );
    }

    for directory in candidates {
        if directory.join(engine_binary_name()).is_file() {
            return Ok(directory);
        }
    }

    Err(
        "The bundled search engine is missing. Run `npm run search-engine:fetch` and rebuild Veyra."
            .into(),
    )
}

fn engine_version(app: &AppHandle) -> Option<String> {
    let directory = engine_directory(app).ok()?;
    let version = std::fs::read_to_string(directory.join("VERSION")).ok()?;
    let version = version.trim();
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn app_cache_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?
        .join("search-engine");
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create search engine cache directory: {error}"))?;
    Ok(directory)
}

fn log_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|directory| directory.join("logs").join("search-engine.log"))
}

fn seed_rerank_model(engine_dir: &Path, cache_dir: &Path) -> Result<(), String> {
    let source = engine_dir.join("rerank");
    if !source.is_dir() {
        return Ok(());
    }
    let destination = cache_dir.join("rerank");
    std::fs::create_dir_all(&destination)
        .map_err(|error| format!("Could not create rerank cache directory: {error}"))?;

    for name in ["model_quantized.onnx", "tokenizer.json"] {
        let from = source.join(name);
        let to = destination.join(name);
        if !from.is_file() || to.is_file() {
            continue;
        }
        let temporary = destination.join(format!("{name}.part"));
        std::fs::copy(&from, &temporary)
            .map_err(|error| format!("Could not copy {name} into the search cache: {error}"))?;
        std::fs::rename(&temporary, &to)
            .map_err(|error| format!("Could not finalize {name} in the search cache: {error}"))?;
    }
    Ok(())
}

// ── Process lifecycle ──────────────────────────────────────────────────────

fn pick_loopback_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Could not reserve a local search port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Could not read the local search port: {error}"))
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("failed to generate search engine token");
    bytes
        .iter()
        .fold(String::with_capacity(64), |mut token, byte| {
            use std::fmt::Write as _;
            let _ = write!(token, "{byte:02x}");
            token
        })
}

fn spawn_engine(
    engine_dir: &Path,
    cache_dir: &Path,
    log_path: Option<&Path>,
    port: u16,
    token: &str,
) -> Result<Child, String> {
    let binary = engine_dir.join(engine_binary_name());
    let mut command = Command::new(&binary);
    command
        .arg("mcp")
        .arg("--http")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(engine_dir)
        .env("DONSETCH_CACHE_DIR", cache_dir)
        .env("DONSETCH_TRANSPORT__TOKEN", token)
        .env("DONSETCH_TRANSPORT__TIMEOUT_SECS", "120")
        // Keep startup cheap; search can still escalate to a browser if needed.
        .env("DONSETCH_NO_PREWARM", "1")
        .stdin(Stdio::null());

    // The ghost lane escalates blocked SERP engines into a full browser render.
    // In keyless mode those engines are almost always captcha-walled, so the
    // escalation usually burns 20+ seconds and returns nothing. Skip it unless
    // the user opts back in with VEYRA_SEARCH_GHOST_LANES=1.
    if std::env::var_os("VEYRA_SEARCH_GHOST_LANES").is_none() {
        command.env("DONSEEK_NO_GHOST_LANES", "1");
    }

    match log_path {
        Some(path) => {
            let stdout = std::fs::File::create(path)
                .map_err(|error| format!("Could not create search engine log: {error}"))?;
            let stderr = stdout
                .try_clone()
                .map_err(|error| format!("Could not open search engine log: {error}"))?;
            command
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr));
        }
        None => {
            command.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }

    crate::shared::process::hide_console(&mut command);

    command.spawn().map_err(|error| {
        format!(
            "Could not start the bundled search engine ({}): {error}",
            binary.display()
        )
    })
}

fn wait_for_health(port: u16, child: &parking_lot::Mutex<Option<Child>>) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .user_agent("Veyra/0.1")
        .build()
        .map_err(|error| format!("Could not create search health client: {error}"))?;
    let url = format!("http://127.0.0.1:{port}/health");
    let deadline = Instant::now() + ENGINE_START_TIMEOUT;

    while Instant::now() < deadline {
        {
            let mut guard = child.lock();
            if let Some(process) = guard.as_mut() {
                if let Ok(Some(status)) = process.try_wait() {
                    return Err(format!(
                        "The search engine exited during startup ({status})."
                    ));
                }
            }
        }

        if let Ok(response) = client.get(&url).send() {
            if response.status().is_success() {
                return Ok(());
            }
        }
        std::thread::sleep(HEALTH_POLL_INTERVAL);
    }

    Err(format!(
        "The search engine did not become ready within {} seconds.",
        ENGINE_START_TIMEOUT.as_secs()
    ))
}

fn log_tail(path: Option<&Path>, max_chars: usize) -> String {
    let Some(path) = path else {
        return String::new();
    };
    let Ok(content) = std::fs::read_to_string(path) else {
        return String::new();
    };
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let start = trimmed.len().saturating_sub(max_chars);
    format!("Search engine log:\n{}", &trimmed[start..])
}

// ── MCP bridge ─────────────────────────────────────────────────────────────

async fn call_web_search(
    endpoint: &EngineEndpoint,
    query: &str,
    limit: usize,
    intent: Option<&str>,
) -> Result<serde_json::Value, String> {
    use rmcp::model::CallToolRequestParams;
    use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
    use rmcp::transport::StreamableHttpClientTransport;
    use rmcp::ServiceExt;

    let config = StreamableHttpClientTransportConfig::with_uri(format!(
        "{}/mcp",
        endpoint.url.trim_end_matches('/')
    ))
    .auth_header(endpoint.token.clone());
    let transport = StreamableHttpClientTransport::from_config(config);
    let mut client = ()
        .serve(transport)
        .await
        .map_err(|error| format!("Could not connect to the local search engine: {error}"))?;

    let mut arguments = serde_json::Map::new();
    arguments.insert("query".into(), serde_json::json!(query));
    arguments.insert("max_results".into(), serde_json::json!(limit.clamp(1, 12)));
    if let Some(intent) = intent {
        arguments.insert("intent".into(), serde_json::json!(intent));
    }

    let request = CallToolRequestParams::new("web_search").with_arguments(arguments);
    let result = tokio::time::timeout(MCP_CALL_TIMEOUT, client.peer().call_tool(request))
        .await
        .map_err(|_| "The local search engine timed out.".to_string())?
        .map_err(|error| format!("The local search engine failed: {error}"))?;

    let value = serde_json::to_value(result)
        .map_err(|error| format!("Could not read the search engine response: {error}"))?;
    let _ = client.close().await;
    Ok(value)
}

fn map_intent(intent: Option<&str>) -> Option<&'static str> {
    match intent.map(str::trim).filter(|value| !value.is_empty()) {
        Some("news") => Some("news"),
        Some("academic") => Some("paper"),
        Some("code") | Some("documentation") => Some("code"),
        Some("general") | Some("local") | Some("discussion") => Some("web"),
        _ => None,
    }
}

fn extract_search_response(
    query: &str,
    value: &serde_json::Value,
) -> Result<TauriSearchResponse, String> {
    let debug = value
        .get("_meta")
        .and_then(|meta| meta.get("com.donsetch/search-debug"))
        .filter(|debug| debug.is_object());
    let structured = value.get("structuredContent");

    let degraded = structured
        .and_then(|value| value.get("degraded"))
        .and_then(|value| value.as_bool())
        .or_else(|| {
            debug
                .and_then(|value| value.get("degraded"))
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false);

    let debug_results = debug
        .and_then(|value| value.get("results"))
        .and_then(|value| value.as_array());

    let structured_results = structured
        .and_then(|value| value.get("results"))
        .and_then(|value| value.as_array());

    let mut results = debug_results
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let url = item.get("url")?.as_str()?.to_string();
                    let title = item
                        .get("title")
                        .and_then(|value| value.as_str())
                        .unwrap_or(&url)
                        .to_string();
                    let snippet = item
                        .get("snippet")
                        .and_then(|value| value.as_str())
                        .unwrap_or("")
                        .to_string();
                    let score = item
                        .get("score")
                        .and_then(|value| value.as_f64())
                        .unwrap_or(0.0);
                    let published_at = item
                        .get("published")
                        .and_then(|value| value.as_str())
                        .map(str::to_string);
                    Some(TauriSearchResult {
                        id: format!("{:x}", simple_hash(&url)),
                        title,
                        url,
                        snippet,
                        engine: "donsetch".to_string(),
                        score,
                        published_at,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if results.is_empty() {
        if let Some(items) = structured_results {
            results = items
                .iter()
                .filter_map(|item| {
                    let url = item.get("url")?.as_str()?.to_string();
                    Some(TauriSearchResult {
                        id: format!("{:x}", simple_hash(&url)),
                        title: url.clone(),
                        url,
                        snippet: String::new(),
                        engine: "donsetch".to_string(),
                        score: 0.0,
                        published_at: None,
                    })
                })
                .collect();
        }
    }

    let result_count = results.len();
    Ok(TauriSearchResponse {
        query: query.to_string(),
        results,
        result_count,
        engine: "donsetch".to_string(),
        degraded,
    })
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_search_engine_status(
    state: tauri::State<'_, SearchEngineState>,
) -> Result<SearchEngineStatus, String> {
    Ok(state.status())
}

#[tauri::command]
pub async fn restart_search_engine(
    state: tauri::State<'_, SearchEngineState>,
) -> Result<SearchEngineStatus, String> {
    state.restart().await
}

#[tauri::command]
pub async fn stop_search_engine(state: tauri::State<'_, SearchEngineState>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn get_search_engine_logs(
    state: tauri::State<'_, SearchEngineState>,
) -> Result<String, String> {
    state.read_logs(40_000)
}

#[tauri::command]
pub async fn web_search(
    state: tauri::State<'_, SearchEngineState>,
    query: String,
    limit: Option<usize>,
    intent: Option<String>,
) -> Result<TauriSearchResponse, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Search query is empty.".into());
    }
    if query.len() > 2_000 {
        return Err("Search query is too long.".into());
    }

    let _url = state.ensure_ready().await?;
    let endpoint = state
        .inner
        .endpoint
        .lock()
        .as_ref()
        .map(|endpoint| EngineEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        })
        .ok_or_else(|| "The local search engine is not ready.".to_string())?;

    let value = call_web_search(
        &endpoint,
        query,
        limit.unwrap_or(8),
        map_intent(intent.as_deref()),
    )
    .await?;

    extract_search_response(query, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_veyra_intents_to_engine_intents() {
        assert_eq!(map_intent(Some("news")), Some("news"));
        assert_eq!(map_intent(Some("academic")), Some("paper"));
        assert_eq!(map_intent(Some("code")), Some("code"));
        assert_eq!(map_intent(Some("documentation")), Some("code"));
        assert_eq!(map_intent(Some("general")), Some("web"));
        assert_eq!(map_intent(Some("auto")), None);
        assert_eq!(map_intent(None), None);
    }

    #[test]
    fn reads_titles_and_snippets_from_mcp_debug_meta() {
        let value = json!({
            "_meta": {
                "com.donsetch/search-debug": {
                    "degraded": true,
                    "results": [
                        {
                            "title": "Example result",
                            "url": "https://example.com/a",
                            "snippet": "A useful snippet",
                            "score": 1.5,
                            "published": "2026-10-20"
                        }
                    ]
                }
            },
            "structuredContent": { "degraded": true, "results": [{ "url": "https://example.com/a" }] }
        });

        let response = extract_search_response("test query", &value).expect("response");
        assert_eq!(response.query, "test query");
        assert_eq!(response.engine, "donsetch");
        assert!(response.degraded);
        assert_eq!(response.result_count, 1);
        assert_eq!(response.results[0].title, "Example result");
        assert_eq!(response.results[0].snippet, "A useful snippet");
        assert_eq!(response.results[0].score, 1.5);
        assert_eq!(
            response.results[0].published_at.as_deref(),
            Some("2026-10-20")
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "starts the bundled engine and uses live network search"]
    async fn live_search_round_trip() {
        let engine_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("search-engine");
        let cache =
            std::env::temp_dir().join(format!("veyra-search-engine-test-{}", std::process::id()));
        std::fs::create_dir_all(&cache).expect("cache dir");
        seed_rerank_model(&engine_dir, &cache).expect("seed rerank");
        let log = cache.join("engine.log");
        let port = pick_loopback_port().expect("port");
        let token = generate_token();
        let child = spawn_engine(&engine_dir, &cache, Some(&log), port, &token).expect("spawn");
        let child = parking_lot::Mutex::new(Some(child));
        tokio::task::block_in_place(|| wait_for_health(port, &child)).expect("health");

        let endpoint = EngineEndpoint {
            url: format!("http://127.0.0.1:{port}"),
            token,
        };
        let value = call_web_search(&endpoint, "tokio select macro", 3, Some("code"))
            .await
            .expect("mcp call");
        let response = extract_search_response("tokio select macro", &value).expect("response");
        assert!(!response.results.is_empty(), "expected at least one result");

        if let Some(mut child) = child.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn falls_back_to_structured_urls_when_debug_meta_is_missing() {
        let value = json!({
            "structuredContent": {
                "degraded": false,
                "results": [{ "url": "https://example.com/b", "rank": 1 }]
            }
        });

        let response = extract_search_response("q", &value).expect("response");
        assert_eq!(response.result_count, 1);
        assert_eq!(response.results[0].url, "https://example.com/b");
        assert_eq!(response.results[0].title, "https://example.com/b");
        assert!(!response.degraded);
    }
}
