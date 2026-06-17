use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

static RUNNING_AGENT_PIDS: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const AGENT_PROCESS_TIMEOUT: Duration = Duration::from_secs(2 * 60 * 60);
const AGENT_POLL_INTERVAL: Duration = Duration::from_millis(100);

use crate::constants::LM_STUDIO_OPENAI_BASE_URL;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpencodeAgentInput {
    pub session_id: String,
    pub mode: String,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub context_length: Option<u32>,
    pub reserved_output_tokens: Option<u32>,
    pub provider_id: Option<String>,
    pub opencode_session_id: Option<String>,
    pub reasoning_enabled: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeRunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeRunFinishedEvent {
    pub session_id: String,
    pub result: OpencodeRunResult,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeRunEvent {
    pub session_id: String,
    pub stream: String,
    pub line: String,
}

#[tauri::command]
pub async fn list_opencode_project_sessions(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_opencode_project_sessions_sync(app, project_path)
    })
    .await
    .map_err(|error| format!("opencode task failed: {error}"))?
}

fn list_opencode_project_sessions_sync(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<String, String> {
    let cwd = resolve_workspace_path(project_path.trim())?;
    let args = vec![
        "session".to_string(),
        "list".to_string(),
        "--format".to_string(),
        "json".to_string(),
        "--max-count".to_string(),
        "50".to_string(),
    ];
    let output = run_opencode_command(Some(&app), None, Some(&cwd), &args, false, None)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|error| error.to_string())?;
    let cwd = normalize_path_for_compare(&cwd);
    let filtered = sessions
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| !is_archived_session(item))
                .filter(|item| {
                    item.get("directory")
                        .and_then(|value| value.as_str())
                        .map(|directory| normalize_path_for_compare(Path::new(directory)) == cwd)
                        .unwrap_or(true)
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    serde_json::to_string(&filtered).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn export_opencode_session(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_opencode_session_sync(app, project_path, session_id)
    })
    .await
    .map_err(|error| format!("opencode task failed: {error}"))?
}

fn export_opencode_session_sync(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    let cwd = resolve_workspace_path(project_path.trim())?;
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("opencode session id is required".into());
    }
    let args = vec!["export".to_string(), session_id.to_string()];
    let output = run_opencode_command(Some(&app), None, Some(&cwd), &args, false, None)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn delete_opencode_session(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        delete_opencode_session_sync(app, project_path, session_id)
    })
    .await
    .map_err(|error| format!("opencode task failed: {error}"))?
}

fn delete_opencode_session_sync(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    let cwd = resolve_workspace_path(project_path.trim())?;
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("opencode session id is required".into());
    }
    let args = vec![
        "session".to_string(),
        "delete".to_string(),
        session_id.to_string(),
    ];
    let output = run_opencode_command(Some(&app), None, Some(&cwd), &args, false, None)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_opencode_available(app: tauri::AppHandle) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        run_opencode_command(
            Some(&app),
            None,
            None,
            &["--version".to_string()],
            false,
            None,
        )
        .is_ok_and(|output| output.status.success())
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub fn run_opencode_agent(
    app: tauri::AppHandle,
    input: StartOpencodeAgentInput,
) -> Result<(), String> {
    validate_opencode_agent_input(&input)?;
    let session_id = input.session_id.trim().to_string();

    std::thread::spawn(move || {
        let result =
            run_opencode_agent_blocking(&app, &input).unwrap_or_else(|error| OpencodeRunResult {
                stdout: String::new(),
                stderr: error,
                exit_code: Some(1),
            });
        let _ = app.emit(
            "agent://run-finished",
            OpencodeRunFinishedEvent { session_id, result },
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_opencode_agent(session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop_opencode_agent_sync(session_id))
        .await
        .map_err(|error| format!("opencode stop task failed: {error}"))?
}

pub fn stop_all_opencode_agents() {
    let pids = RUNNING_AGENT_PIDS
        .lock()
        .drain()
        .map(|(_, pid)| pid)
        .collect::<Vec<_>>();
    for pid in pids {
        kill_pid(pid);
    }
}

fn stop_opencode_agent_sync(session_id: String) -> Result<(), String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("agent session id is required".into());
    }
    kill_agent_process(session_id);
    Ok(())
}

fn validate_opencode_agent_input(input: &StartOpencodeAgentInput) -> Result<(), String> {
    let mode = input.mode.trim();
    let prompt = input.prompt.trim();

    if input.session_id.trim().is_empty() {
        return Err("agent session id is required".into());
    }

    if !matches!(mode, "ask" | "plan" | "build") {
        return Err("agent mode is not supported".into());
    }

    if prompt.is_empty() {
        return Err("agent prompt is required".into());
    }

    Ok(())
}

fn run_opencode_agent_blocking(
    app: &tauri::AppHandle,
    input: &StartOpencodeAgentInput,
) -> Result<OpencodeRunResult, String> {
    let mode = input.mode.trim();
    let project_path = input.project_path.trim();
    let prompt = input.prompt.trim();

    let cwd = resolve_workspace_path(project_path)?;
    if !cwd.is_dir() {
        return Err(
            "workspace path must be an existing directory; empty folders are supported".into(),
        );
    }

    let opencode_agent = opencode_agent_for_mode(mode);
    let requested_model = input.model.trim();
    let provider_id = input.provider_id.as_deref().unwrap_or_default().trim();
    let route_to_lm_studio = should_route_to_lm_studio(provider_id, requested_model);
    let reasoning_enabled = input.reasoning_enabled.unwrap_or(true);
    let model = opencode_model_for_selected_model(requested_model, route_to_lm_studio);
    let config_content = route_to_lm_studio
        .then(|| {
            lm_studio_opencode_config_content(
                requested_model,
                input.context_length,
                input.reserved_output_tokens,
                reasoning_enabled,
            )
        })
        .transpose()?;
    let opencode_session_id = input
        .opencode_session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut args = vec![
        "run".to_string(),
        "--format".to_string(),
        "json".to_string(),
        "--agent".to_string(),
        opencode_agent.to_string(),
    ];
    if reasoning_enabled {
        args.push("--thinking".to_string());
    }
    if let Some(session_id) = opencode_session_id {
        args.push("--session".to_string());
        args.push(session_id.to_string());
    }
    if let Some(model) = model.as_deref() {
        args.push("--model".to_string());
        args.push(model.to_string());
    }
    args.push(prompt.to_string());

    let output = run_opencode_command(
        Some(app),
        Some(input.session_id.trim()),
        Some(&cwd),
        &args,
        route_to_lm_studio,
        config_content.as_deref(),
    )?;

    Ok(OpencodeRunResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

fn opencode_agent_for_mode(mode: &str) -> &str {
    match mode {
        // The Veyra UI uses Ask as the lightweight default, but opencode does not
        // ship an `ask` agent. Plan is the closest read-only, quick-turn agent.
        "ask" => "plan",
        "plan" => "plan",
        "build" => "build",
        _ => "plan",
    }
}

fn opencode_model_for_selected_model(model: &str, route_to_lm_studio: bool) -> Option<String> {
    if model.is_empty() {
        return None;
    }

    let trimmed = model.trim().trim_end_matches('/').trim_end_matches('\\');
    if trimmed.is_empty() {
        return None;
    }

    if !route_to_lm_studio {
        if let Some((provider, model_id)) = trimmed.split_once('/') {
            if !provider.trim().is_empty() && !model_id.trim().is_empty() {
                return Some(trimmed.to_string());
            }
        }
        return None;
    }

    if let Some((provider, model_id)) = trimmed.split_once('/') {
        if !provider.trim().is_empty() && !model_id.trim().is_empty() {
            return Some(format!("lmstudio/{trimmed}"));
        }
    }

    Some(format!("lmstudio/{trimmed}"))
}

fn should_route_to_lm_studio(provider_id: &str, model: &str) -> bool {
    provider_id == "lm-studio" && !model.trim().is_empty()
}

fn lm_studio_opencode_config_content(
    model: &str,
    context_length: Option<u32>,
    reserved_output_tokens: Option<u32>,
    reasoning_enabled: bool,
) -> Result<String, String> {
    let model_id = model.trim().trim_end_matches('/').trim_end_matches('\\');
    if model_id.is_empty() {
        return Err("LM Studio model is required".into());
    }
    let context_limit = context_length.unwrap_or(4096).clamp(1024, 262_144);
    let output_limit = reserved_output_tokens
        .unwrap_or_else(|| (context_limit / 4).max(256))
        .clamp(128, context_limit.saturating_sub(128).max(128));

    let config = json!({
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "lmstudio": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "LM Studio",
                "options": {
                    "baseURL": LM_STUDIO_OPENAI_BASE_URL,
                    "apiKey": "lm-studio"
                },
                "models": {
                    model_id: {
                        "name": model_id,
                        "reasoning": reasoning_enabled,
                        "tool_call": true,
                        "temperature": true,
                        "limit": {
                            "context": context_limit,
                            "output": output_limit
                        }
                    }
                }
            }
        }
    });

    serde_json::to_string(&config).map_err(|error| error.to_string())
}

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

fn normalize_path_for_compare(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .to_ascii_lowercase()
}

fn is_archived_session(item: &serde_json::Value) -> bool {
    item.get("archived").and_then(|value| value.as_bool()) == Some(true)
        || item.get("archivedAt").is_some()
        || item
            .get("time")
            .and_then(|value| value.get("archived"))
            .is_some()
}

fn run_opencode_command(
    app: Option<&tauri::AppHandle>,
    session_id: Option<&str>,
    cwd: Option<&Path>,
    args: &[String],
    route_to_lm_studio: bool,
    config_content: Option<&str>,
) -> Result<Output, String> {
    let mut errors = Vec::new();
    let data_home = app.map(opencode_data_home).transpose()?;
    let is_agent_run = args.first().map(|arg| arg == "run").unwrap_or(false);

    for candidate in opencode_candidates() {
        let mut command = match candidate {
            OpencodeCommand::Direct(program) => {
                let mut command = Command::new(program);
                command.args(args);
                command
            }
            OpencodeCommand::Npx => {
                let mut command = Command::new(npx_program());
                command.arg("--yes").arg("opencode").args(args);
                command
            }
            OpencodeCommand::Shell => {
                let mut command = Command::new(shell_program());
                command.args(shell_args(args));
                command
            }
        };

        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }
        command
            .env_remove("OPENCODE_CLIENT")
            .env_remove("OPENCODE_SERVER_USERNAME")
            .env_remove("OPENCODE_SERVER_PASSWORD");

        if let Some(data_home) = data_home.as_deref() {
            command.env("XDG_DATA_HOME", data_home);
        }

        if route_to_lm_studio {
            command
                .env("OPENAI_API_KEY", "lm-studio")
                .env("OPENAI_BASE_URL", LM_STUDIO_OPENAI_BASE_URL)
                .env("OPENAI_API_BASE", LM_STUDIO_OPENAI_BASE_URL);
        }

        if let Some(config_content) = config_content {
            command.env("OPENCODE_CONFIG_CONTENT", config_content);
        }

        match run_command(command, app, session_id) {
            Ok(output) if output.status.success() || is_agent_run => return Ok(output),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                errors.push(format!(
                    "candidate exited {}{}{}",
                    output.status.code().map_or_else(|| "without code".to_string(), |code| format!("with code {code}")),
                    if stderr.is_empty() { "" } else { ": " },
                    if stderr.is_empty() { stdout } else { stderr },
                ));
            }
            Err(error) => errors.push(error.to_string()),
        }
    }

    Err(format!(
        "failed to start opencode. Tried opencode command shims and npx fallback. {}",
        errors.join("; ")
    ))
}

fn opencode_data_home(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_home = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("opencode-runtime");
    fs::create_dir_all(&data_home).map_err(|error| error.to_string())?;
    Ok(data_home)
}

fn run_command(
    mut command: Command,
    app: Option<&tauri::AppHandle>,
    session_id: Option<&str>,
) -> Result<Output, std::io::Error> {
    if app.is_none() || session_id.is_none() {
        return command.output();
    }

    let app = app.cloned().expect("checked above");
    let session_id = session_id.expect("checked above").to_string();
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    register_agent_process(&session_id, child.id());

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = stdout.map(|stdout| {
        let app = app.clone();
        let session_id = session_id.clone();
        std::thread::spawn(move || read_stream_lines(stdout, app, session_id, "stdout"))
    });
    let stderr_handle = stderr.map(|stderr| {
        let app = app.clone();
        let session_id = session_id.clone();
        std::thread::spawn(move || read_stream_lines(stderr, app, session_id, "stderr"))
    });

    let status = match wait_child_with_timeout(&mut child, AGENT_PROCESS_TIMEOUT) {
        Ok(status) => status,
        Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            let _ = child.kill();
            unregister_agent_process(&session_id);
            return Err(error);
        }
        Err(error) => {
            unregister_agent_process(&session_id);
            return Err(error);
        }
    };

    unregister_agent_process(&session_id);
    let stdout = stdout_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .join("\n")
        .into_bytes();
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .join("\n")
        .into_bytes();

    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

fn read_stream_lines<R: std::io::Read>(
    reader: R,
    app: tauri::AppHandle,
    session_id: String,
    stream: &'static str,
) -> Vec<String> {
    let mut lines = Vec::new();
    for line in BufReader::new(reader).lines().map_while(Result::ok) {
        let _ = app.emit(
            "agent://run-event",
            OpencodeRunEvent {
                session_id: session_id.clone(),
                stream: stream.to_string(),
                line: line.clone(),
            },
        );
        lines.push(line);
    }
    lines
}

enum OpencodeCommand {
    Direct(&'static str),
    Npx,
    Shell,
}

fn opencode_candidates() -> Vec<OpencodeCommand> {
    if cfg!(windows) {
        vec![
            OpencodeCommand::Direct("opencode.cmd"),
            OpencodeCommand::Shell,
            OpencodeCommand::Npx,
        ]
    } else {
        vec![OpencodeCommand::Direct("opencode"), OpencodeCommand::Npx]
    }
}

fn npx_program() -> &'static str {
    if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn shell_program() -> &'static str {
    if cfg!(windows) {
        "cmd"
    } else {
        "sh"
    }
}

fn shell_args(args: &[String]) -> Vec<String> {
    if cfg!(windows) {
        let mut command = "opencode".to_string();
        for arg in args {
            command.push(' ');
            command.push_str(&cmd_arg_quote(arg));
        }
        vec!["/C".to_string(), command]
    } else {
        let mut command = "opencode".to_string();
        for arg in args {
            command.push(' ');
            command.push_str(&shell_quote(arg));
        }
        vec!["-c".to_string(), command]
    }
}

fn cmd_arg_quote(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }

    let is_safe = value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '/' | '\\' | ':'));
    if is_safe {
        return value.to_string();
    }

    let mut quoted = String::from("\"");
    for ch in value.chars() {
        if ch == '"' || ch == '\\' {
            quoted.push('\\');
        }
        quoted.push(ch);
    }
    quoted.push('"');
    quoted
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

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

fn wait_child_with_timeout(
    child: &mut std::process::Child,
    timeout: Duration,
) -> Result<std::process::ExitStatus, std::io::Error> {
    let start = Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => return Ok(status),
            None if start.elapsed() >= timeout => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "opencode process timed out",
                ));
            }
            None => std::thread::sleep(AGENT_POLL_INTERVAL),
        }
    }
}
