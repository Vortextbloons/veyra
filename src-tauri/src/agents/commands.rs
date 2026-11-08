use serde::Deserialize;
use std::io::Write;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Emitter;

use super::pi_runner::{
    resolve_thinking_level, run_pi_agent_blocking,
    validate_pi_agent_input, PiRunFinishedEvent, PiRunResult,
};
use super::process::AGENT_CANCELLATION;
use super::process::{kill_agent_process, kill_pid, RUNNING_AGENT_PIDS, RUNNING_AGENT_STDIN};
use super::reasoning::inspect_model;
use super::sessions::resolve_workspace_path;

// ---------------------------------------------------------------------------
// Input / event types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StartPiAgentInput {
    pub session_id: String,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub context_length: Option<u32>,
    pub reserved_output_tokens: Option<u32>,
    pub max_tokens: Option<u32>,
    pub provider_id: Option<String>,
    pub provider_base_url: Option<String>,
    pub reasoning_enabled: Option<bool>,
    pub reasoning_level: Option<String>,
    pub images: Option<Vec<serde_json::Value>>,
    pub tools: Option<Vec<serde_json::Value>>,
    /// Directories containing a `SKILL.md` for Pi to load with `--skill`.
    pub skill_paths: Option<Vec<String>>,
    /// User-authored system prompt, resolved from global or per-model settings.
    pub system_prompt: Option<String>,
    /// When true, `system_prompt` replaces the default system prompt entirely.
    pub replace_system_prompt: Option<bool>,
}

#[tauri::command]
pub async fn steer_pi_agent(session_id: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() { return Err("Steering message is required".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let mut streams = RUNNING_AGENT_STDIN.lock();
        let stream = streams.get_mut(&session_id).ok_or("Chat is no longer running")?;
        writeln!(stream, "{}", serde_json::json!({ "type": "steer", "message": message }))
            .map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn respond_pi_ui(session_id: String, request_id: String, value: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let response = serde_json::json!({ "type": "extension_ui_response", "id": request_id,
            "value": value, "confirmed": value.as_deref() == Some("true"), "cancelled": value.is_none() });
        let mut streams = RUNNING_AGENT_STDIN.lock();
        let stream = streams.get_mut(&session_id).ok_or("Chat is no longer running")?;
        writeln!(stream, "{}", response).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_pi_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let Ok(mut command) = super::runtime::pi_command() else { return false; };
        command.arg("--version").stdout(Stdio::null()).stderr(Stdio::null());
        crate::shared::process::hide_console(&mut command);
        command.output().is_ok_and(|output| output.status.success())
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
    let provider_id = input
        .provider_id
        .as_deref()
        .unwrap_or("lm-studio")
        .trim()
        .to_string();
    let thinking_level =
        resolve_thinking_level(input.reasoning_level.as_deref(), input.reasoning_enabled)?
            .to_string();
    let context_length = input.context_length;
    let max_tokens = input.max_tokens;
    let custom_system_prompt = input.system_prompt.clone().unwrap_or_default();
    let replace_system_prompt = input.replace_system_prompt.unwrap_or(false);

    // Resolve and automatically configure the selected Pi route before execution.
    let sid = session_id.clone();
    let app_clone = app.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    AGENT_CANCELLATION
        .lock()
        .insert(sid.clone(), cancelled.clone());

    std::thread::spawn(move || {
        let result = (|| {
            let capability = inspect_model(
                &provider_id,
                &model,
                input.provider_base_url.as_deref().unwrap_or(""),
                &thinking_level,
                context_length,
                max_tokens,
            )?;
            if !capability.known {
                return Err(capability.message);
            }
            if cancelled.load(Ordering::Relaxed) {
                return Err("Agent run cancelled".into());
            }
            let api_key = if provider_id != "lm-studio"
                && capability.provider.as_deref().is_some_and(|provider| provider.starts_with("veyra-"))
            {
                crate::load_provider_credential(provider_id.clone())?
            } else {
                String::new()
            };
            run_pi_agent_blocking(
                &app_clone,
                &sid,
                &cwd,
                capability
                    .model
                    .as_deref()
                    .ok_or("Pi model route is unavailable")?,
                &prompt,
                capability
                    .provider
                    .as_deref()
                    .ok_or("Pi provider route is unavailable")?,
                capability.effective_level.as_deref().unwrap_or("off"),
                &api_key,
                input.images.as_deref().unwrap_or(&[]),
                input.tools.as_deref().unwrap_or(&[]),
                !input.project_path.trim().is_empty(),
                &custom_system_prompt,
                replace_system_prompt,
                input.skill_paths.as_deref().unwrap_or(&[]),
                &cancelled,
            )
        })();
        AGENT_CANCELLATION.lock().remove(&sid);

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
    for flag in AGENT_CANCELLATION.lock().values() {
        flag.store(true, Ordering::Relaxed);
    }
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
