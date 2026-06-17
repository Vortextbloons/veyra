use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use tauri::Emitter;

use crate::constants::LM_STUDIO_OPENAI_BASE_URL;

static RUNNING_AGENT_PIDS: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Keep stdin handles alive so Pi doesn't exit before the LLM responds.
static RUNNING_AGENT_STDIN: LazyLock<Mutex<HashMap<String, std::process::ChildStdin>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const AGENT_PROCESS_TIMEOUT: Duration = Duration::from_secs(2 * 60 * 60);
const AGENT_POLL_INTERVAL: Duration = Duration::from_millis(100);

// ---------------------------------------------------------------------------
// Input / event types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StartPiAgentInput {
    pub session_id: String,
    pub mode: String,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub context_length: Option<u32>,
    pub reserved_output_tokens: Option<u32>,
    pub provider_id: Option<String>,
    pub reasoning_enabled: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRunEvent {
    pub session_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRunFinishedEvent {
    pub session_id: String,
    pub result: PiRunResult,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_pi_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        pi_candidates()
            .iter()
            .any(|candidate| {
                Command::new(candidate)
                    .arg("--version")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .is_ok_and(|output| output.status.success())
            })
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub async fn run_pi_agent(
    app: tauri::AppHandle,
    input: StartPiAgentInput,
) -> Result<String, String> {
    validate_pi_agent_input(&input)?;

    let session_id = input.session_id.trim().to_string();
    let cwd = resolve_workspace_path(input.project_path.trim())?;
    if !cwd.is_dir() {
        return Err(
            "workspace path must be an existing directory; empty folders are supported".into(),
        );
    }

    let model = input.model.trim().to_string();
    let prompt = input.prompt.trim().to_string();
    let provider_id = input.provider_id.as_deref().unwrap_or_default().trim();
    let reasoning_enabled = input.reasoning_enabled.unwrap_or(true);
    let context_length = input.context_length;
    let reserved_output_tokens = input.reserved_output_tokens;

    // Generate models.json if routing to LM Studio
    let route_to_lm_studio = provider_id == "lm-studio" && !model.is_empty();
    if route_to_lm_studio {
        generate_pi_models_json(
            &model,
            context_length,
            reserved_output_tokens,
            reasoning_enabled,
        )?;
    }

    let sid = session_id.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = run_pi_agent_blocking(
            &app_clone,
            &sid,
            &cwd,
            &model,
            &prompt,
            route_to_lm_studio,
        );

        let finished_event = match result {
            Ok(output) => PiRunFinishedEvent {
                session_id: sid.clone(),
                result: PiRunResult {
                    stdout: output.stdout,
                    stderr: output.stderr,
                    exit_code: output.exit_status.code(),
                },
            },
            Err(e) => PiRunFinishedEvent {
                session_id: sid.clone(),
                result: PiRunResult {
                    stdout: String::new(),
                    stderr: e,
                    exit_code: None,
                },
            },
        };

        let _ = app_clone.emit("agent://run-finished", finished_event);
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn stop_pi_agent(session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let session_id = session_id.trim();
        if session_id.is_empty() {
            return Err("agent session id is required".into());
        }
        kill_agent_process(session_id);
        Ok(())
    })
    .await
    .map_err(|e| format!("pi stop task failed: {e}"))?
}

pub fn stop_all_pi_agents() {
    let pids = RUNNING_AGENT_PIDS
        .lock()
        .drain()
        .map(|(_, pid)| pid)
        .collect::<Vec<_>>();
    for pid in pids {
        kill_pid(pid);
    }
    // Drop all stdin handles
    RUNNING_AGENT_STDIN.lock().clear();
}

#[tauri::command]
pub async fn list_pi_sessions(project_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || list_pi_sessions_sync(project_path))
        .await
        .map_err(|e| format!("pi list sessions task failed: {e}"))?
}

#[tauri::command]
pub async fn switch_pi_session(session_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || switch_pi_session_sync(session_path))
        .await
        .map_err(|e| format!("pi switch session task failed: {e}"))?
}

#[tauri::command]
pub async fn delete_pi_session(session_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(session_path.trim());
        if !path.exists() {
            return Err("session file does not exist".into());
        }
        if !path
            .extension()
            .is_some_and(|ext| ext == "jsonl")
        {
            return Err("session file must be a .jsonl file".into());
        }
        fs::remove_file(&path).map_err(|e| format!("failed to delete session: {e}"))
    })
    .await
    .map_err(|e| format!("pi delete session task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn pi_candidates() -> Vec<&'static str> {
    if cfg!(windows) {
        vec!["pi.cmd", "pi"]
    } else {
        vec!["pi"]
    }
}

fn validate_pi_agent_input(input: &StartPiAgentInput) -> Result<(), String> {
    if input.session_id.trim().is_empty() {
        return Err("agent session id is required".into());
    }
    if input.prompt.trim().is_empty() {
        return Err("agent prompt is required".into());
    }
    if input.model.trim().is_empty() {
        return Err("agent model is required".into());
    }
    Ok(())
}

struct PiAgentOutput {
    exit_status: std::process::ExitStatus,
    stdout: String,
    stderr: String,
}

/// Spawn `pi --mode rpc`, send the prompt, stream stdout events, and wait for
/// the process to finish (or time out).
fn run_pi_agent_blocking(
    app: &tauri::AppHandle,
    session_id: &str,
    cwd: &Path,
    model: &str,
    prompt: &str,
    route_to_lm_studio: bool,
) -> Result<PiAgentOutput, String> {
    let mut args = vec![
        "--mode".to_string(),
        "rpc".to_string(),
        "--no-session".to_string(),
    ];

    if route_to_lm_studio {
        // Model string for Pi: lmstudio/<model>
        let pi_model = if model.contains('/') {
            format!("lmstudio/{}", model.trim_start_matches("lmstudio/"))
        } else {
            format!("lmstudio/{model}")
        };
        args.push("--model".to_string());
        args.push(pi_model);
    } else if !model.is_empty() {
        args.push("--model".to_string());
        args.push(model.to_string());
    }

    let mut last_error = String::new();
    let mut child = None;
    for candidate in pi_candidates() {
        match Command::new(candidate)
            .args(&args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => {
                child = Some(c);
                break;
            }
            Err(e) => {
                last_error = format!("{candidate}: {e}");
            }
        }
    }
    let mut child = child.ok_or_else(|| {
        format!(
            "failed to spawn pi. Tried candidates: {:?}. Last error: {}",
            pi_candidates(),
            last_error
        )
    })?;

    register_agent_process(session_id, child.id());

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Flag to detect when Pi emits agent_end — we kill the process after that
    // since Pi RPC never exits on its own (it waits for more commands).
    let ended_flag = Arc::new(AtomicBool::new(false));

    // Spawn thread to stream stdout lines as events
    let stdout_handle = stdout.map(|stdout| {
        let app = app.clone();
        let session_id = session_id.to_string();
        let ended_flag = ended_flag.clone();
        std::thread::spawn(move || {
            let mut lines = Vec::new();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app.emit(
                    "agent://run-event",
                    PiRunEvent {
                        session_id: session_id.clone(),
                        stream: "stdout".to_string(),
                        line: line.clone(),
                    },
                );
                if line.contains("\"type\":\"agent_end\"") || line.contains("\"type\": \"agent_end\"") {
                    ended_flag.store(true, Ordering::Relaxed);
                }
                lines.push(line);
            }
            lines
        })
    });

    // Spawn thread to stream stderr lines as events
    let stderr_handle = stderr.map(|stderr| {
        let app = app.clone();
        let session_id = session_id.to_string();
        std::thread::spawn(move || {
            let mut lines = Vec::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app.emit(
                    "agent://run-event",
                    PiRunEvent {
                        session_id: session_id.clone(),
                        stream: "stderr".to_string(),
                        line: line.clone(),
                    },
                );
                lines.push(line);
            }
            lines
        })
    });

    // Send the prompt command over stdin, then keep it alive so Pi doesn't exit
    if let Some(stdin) = stdin {
        let prompt_cmd = json!({
            "type": "prompt",
            "message": prompt
        });
        let line = format!("{}\n", prompt_cmd);
        let mut stdin_owned = stdin;
        if let Err(e) = stdin_owned.write_all(line.as_bytes()) {
            unregister_agent_process(session_id);
            RUNNING_AGENT_STDIN.lock().remove(session_id);
            return Err(format!("failed to write prompt to pi stdin: {e}"));
        }
        // Keep stdin alive — Pi must not see EOF before LLM responds
        RUNNING_AGENT_STDIN
            .lock()
            .insert(session_id.to_string(), stdin_owned);
    }

    // Pi RPC never exits on its own — it waits for more commands.
    // Poll the ended_flag (set by the stdout thread when it sees agent_end)
    // and kill the process once the agent is done.
    let deadline = Instant::now() + AGENT_PROCESS_TIMEOUT;
    loop {
        if ended_flag.load(Ordering::Relaxed) {
            // Give Pi a moment to flush remaining output, then kill
            std::thread::sleep(Duration::from_millis(200));
            let _ = child.kill();
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            unregister_agent_process(session_id);
            RUNNING_AGENT_STDIN.lock().remove(session_id);
            let _ = stdout_handle.and_then(|h| h.join().ok());
            let _ = stderr_handle.and_then(|h| h.join().ok());
            return Err("pi process timed out after 2 hours".into());
        }
        // Check if process exited unexpectedly (crash)
        if let Ok(Some(_status)) = child.try_wait() {
            break;
        }
        std::thread::sleep(AGENT_POLL_INTERVAL);
    }

    unregister_agent_process(session_id);
    // Drop the stdin handle now that Pi is done
    RUNNING_AGENT_STDIN.lock().remove(session_id);

    // Collect remaining output from threads
    let stdout_lines = stdout_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let stderr_lines = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();

    let stdout = stdout_lines.join("\n");
    let stderr = stderr_lines.join("\n");

    // Wait for the killed process to be reaped
    let exit_status = child.wait().unwrap_or({
        // Process already reaped — treat as success since we got agent_end
        #[cfg(windows)]
        {
            use std::os::windows::process::ExitStatusExt;
            std::process::ExitStatus::from_raw(0)
        }
        #[cfg(not(windows))]
        {
            std::process::ExitStatus::from_raw(0)
        }
    });

    // If we saw agent_end, the kill was intentional — override non-zero exit code
    let exit_status = if ended_flag.load(Ordering::Relaxed) && !exit_status.success() {
        #[cfg(windows)]
        {
            use std::os::windows::process::ExitStatusExt;
            std::process::ExitStatus::from_raw(0)
        }
        #[cfg(not(windows))]
        {
            std::process::ExitStatus::from_raw(0)
        }
    } else {
        exit_status
    };

    Ok(PiAgentOutput {
        exit_status,
        stdout,
        stderr,
    })
}

/// Generate `~/.pi/agent/models.json` with LM Studio provider config.
fn generate_pi_models_json(
    model: &str,
    context_length: Option<u32>,
    reserved_output_tokens: Option<u32>,
    reasoning_enabled: bool,
) -> Result<(), String> {
    let model_id = model.trim().trim_end_matches('/').trim_end_matches('\\');
    if model_id.is_empty() {
        return Err("LM Studio model is required".into());
    }

    let context_limit = context_length.unwrap_or(8192).clamp(1024, 262_144);
    let output_limit = reserved_output_tokens
        .unwrap_or_else(|| (context_limit / 4).max(256))
        .clamp(128, context_limit.saturating_sub(128).max(128));

    let models_dir = pi_agent_dir()?;
    fs::create_dir_all(&models_dir).map_err(|e| format!("failed to create pi agent dir: {e}"))?;

    let models_json = json!({
        "providers": {
            "lmstudio": {
                "baseUrl": LM_STUDIO_OPENAI_BASE_URL,
                "api": "openai-completions",
                "apiKey": "lm-studio",
                "compat": {
                    "supportsDeveloperRole": false,
                    "supportsReasoningEffort": false
                },
                "models": [
                    {
                        "id": model_id,
                        "name": model_id,
                        "reasoning": reasoning_enabled,
                        "input": ["text"],
                        "contextWindow": context_limit,
                        "maxTokens": output_limit,
                        "cost": {
                            "input": 0,
                            "output": 0,
                            "cacheRead": 0,
                            "cacheWrite": 0
                        }
                    }
                ]
            }
        }
    });

    let path = models_dir.join("models.json");
    let content =
        serde_json::to_string_pretty(&models_json).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| format!("failed to write models.json: {e}"))?;

    Ok(())
}

/// Returns `~/.pi/agent/` directory path.
fn pi_agent_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "failed to resolve home directory".to_string())?;
    Ok(PathBuf::from(home).join(".pi").join("agent"))
}

/// Scan `~/.pi/agent/sessions/` for `.jsonl` session files.
fn list_pi_sessions_sync(project_path: String) -> Result<String, String> {
    let _cwd = resolve_workspace_path(project_path.trim())?;
    let sessions_dir = pi_agent_dir()?.join("sessions");

    if !sessions_dir.is_dir() {
        return Ok("[]".to_string());
    }

    let mut sessions = Vec::new();
    let entries =
        fs::read_dir(&sessions_dir).map_err(|e| format!("failed to read sessions dir: {e}"))?;

    for entry in entries.map_while(Result::ok) {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            let metadata = fs::metadata(&path).ok();
            let file_name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

            sessions.push(json!({
                "id": file_name,
                "path": path.to_string_lossy(),
                "fileName": path.file_name().and_then(|s| s.to_str()).unwrap_or_default(),
                "modified": modified,
                "size": size,
            }));
        }
    }

    sessions.sort_by(|a, b| {
        let a_mod = a.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_mod = b.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        b_mod.cmp(&a_mod)
    });

    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

/// Send a `switch_session` command to a running Pi RPC process.
/// NOTE: This only works if a Pi RPC process is already running for this
/// session. For now, we store stdin handles in the running processes map
/// so we can send commands later.
fn switch_pi_session_sync(session_path: String) -> Result<(), String> {
    let path = PathBuf::from(session_path.trim());
    if !path.exists() {
        return Err("session file does not exist".into());
    }

    // For Pi, switching sessions means the next run should use this session file.
    // Since Pi uses --no-session by default, session switching is handled at
    // the prompt level. We just validate the path exists.
    Ok(())
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

fn register_agent_process(session_id: &str, pid: u32) {
    RUNNING_AGENT_PIDS
        .lock()
        .insert(session_id.to_string(), pid);
}

fn unregister_agent_process(session_id: &str) {
    RUNNING_AGENT_PIDS.lock().remove(session_id);
}

fn kill_agent_process(session_id: &str) {
    if let Some(pid) = RUNNING_AGENT_PIDS.lock().remove(session_id) {
        kill_pid(pid);
    }
    RUNNING_AGENT_STDIN.lock().remove(session_id);
}

fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn resolve_workspace_path(project_path: &str) -> Result<PathBuf, String> {
    if project_path.is_empty() {
        return std::env::current_dir()
            .map_err(|error| format!("failed to resolve default workspace: {error}"));
    }

    if project_path.contains('\0') {
        return Err("workspace path is invalid".into());
    }

    let path = PathBuf::from(project_path);
    let canonical = path
        .canonicalize()
        .map_err(|_| "workspace path must be an existing directory".to_string())?;

    if !canonical.is_dir() {
        return Err("workspace path must be an existing directory".into());
    }

    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------


