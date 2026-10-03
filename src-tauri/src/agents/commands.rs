use serde::Deserialize;
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Emitter;

use super::pi_runner::{
    generate_pi_models_json, pi_candidates, resolve_thinking_level, run_pi_agent_blocking,
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
    pub mode: String,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub context_length: Option<u32>,
    pub reserved_output_tokens: Option<u32>,
    pub provider_id: Option<String>,
    pub provider_base_url: Option<String>,
    pub reasoning_enabled: Option<bool>,
    pub reasoning_level: Option<String>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_pi_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        pi_candidates().iter().any(|candidate| {
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
    let reserved_output_tokens = input.reserved_output_tokens;

    // Generate models.json if routing to LM Studio
    let sid = session_id.clone();
    let app_clone = app.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    AGENT_CANCELLATION
        .lock()
        .insert(sid.clone(), cancelled.clone());

    std::thread::spawn(move || {
        let result = (|| {
            if provider_id == "lm-studio" {
                generate_pi_models_json(&model, context_length, reserved_output_tokens)?;
            }
            let capability = inspect_model(
                &provider_id,
                &model,
                input.provider_base_url.as_deref().unwrap_or(""),
                &thinking_level,
            )?;
            if !capability.known {
                return Err(capability.message);
            }
            if cancelled.load(Ordering::Relaxed) {
                return Err("Agent run cancelled".into());
            }
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
                &input.mode,
                capability.effective_level.as_deref().unwrap_or("off"),
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
