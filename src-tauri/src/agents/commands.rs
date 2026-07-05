use serde::Deserialize;
use std::fs;
use std::process::{Command, Stdio};
use tauri::Emitter;

use super::pi_runner::{
    generate_pi_models_json, pi_candidates, run_pi_agent_blocking, validate_pi_agent_input,
    PiRunFinishedEvent, PiRunResult,
};
use super::process::{kill_agent_process, kill_pid, RUNNING_AGENT_PIDS, RUNNING_AGENT_STDIN};
use super::sessions::{
    list_pi_sessions_sync, resolve_pi_session_file, resolve_workspace_path, switch_pi_session_sync,
};

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
            &input.mode,
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
        let path = resolve_pi_session_file(&session_path)?;
        fs::remove_file(&path).map_err(|e| format!("failed to delete session: {e}"))
    })
    .await
    .map_err(|e| format!("pi delete session task failed: {e}"))?
}
