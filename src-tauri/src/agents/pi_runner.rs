use serde::Serialize;
use serde_json::json;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;

use super::process::{
    register_agent_process, unregister_agent_process, PiAgentOutput, RUNNING_AGENT_STDIN,
};
use crate::shared::constants::LM_STUDIO_OPENAI_BASE_URL;

// ---------------------------------------------------------------------------
// Input / event types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PiRunEvent {
    pub(crate) session_id: String,
    pub(crate) stream: String,
    pub(crate) line: String,
    pub(crate) sequence: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PiRunResult {
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PiRunFinishedEvent {
    pub(crate) session_id: String,
    pub(crate) result: PiRunResult,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub(crate) fn pi_candidates() -> Vec<&'static str> {
    if cfg!(windows) {
        vec!["pi.cmd", "pi"]
    } else {
        vec!["pi"]
    }
}

pub(crate) fn validate_pi_agent_input(
    input: &super::commands::StartPiAgentInput,
) -> Result<(), String> {
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

/// Returns `~/.pi/agent/` directory path.
pub(crate) fn pi_agent_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "failed to resolve home directory".to_string())?;
    Ok(PathBuf::from(home).join(".pi").join("agent"))
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

const AGENT_PROCESS_TIMEOUT: Duration = Duration::from_secs(2 * 60 * 60);
const AGENT_POLL_INTERVAL: Duration = Duration::from_millis(100);

pub(crate) fn resolve_thinking_level(
    level: Option<&str>,
    enabled: Option<bool>,
) -> Result<&str, String> {
    match level {
        Some(level @ ("off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max")) => {
            Ok(level)
        }
        Some(_) => Err("Invalid agent reasoning level".into()),
        None => Ok(if enabled == Some(false) {
            "off"
        } else {
            "medium"
        }),
    }
}

/// Spawn `pi --mode rpc`, send the prompt, stream stdout events, and wait for
/// the process to finish (or time out).
pub(crate) fn run_pi_agent_blocking(
    app: &tauri::AppHandle,
    session_id: &str,
    cwd: &Path,
    model: &str,
    prompt: &str,
    provider: &str,
    mode: &str,
    thinking_level: &str,
    cancelled: &AtomicBool,
) -> Result<PiAgentOutput, String> {
    let mut args = vec![
        "--mode".to_string(),
        "rpc".to_string(),
        "--no-session".to_string(),
        "--no-context-files".to_string(),
        "--thinking".to_string(),
        thinking_level.to_string(),
    ];

    // Restrict tools based on mode
    if mode == "plan" {
        args.push("--tools".to_string());
        args.push("read,grep,find,ls".to_string());
    }

    args.extend([
        "--provider".to_string(),
        provider.to_string(),
        "--model".to_string(),
        model.to_string(),
    ]);
    if cancelled.load(Ordering::Relaxed) {
        return Err("Agent run cancelled".into());
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
    if cancelled.load(Ordering::Relaxed) {
        let _ = child.kill();
        let _ = child.wait();
        unregister_agent_process(session_id);
        return Err("Agent run cancelled".into());
    }

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Flag to detect when Pi emits agent_end — we kill the process after that
    // since Pi RPC never exits on its own (it waits for more commands).
    let ended_flag = Arc::new(AtomicBool::new(false));

    let event_sequence = Arc::new(AtomicU64::new(0));

    // Spawn thread to stream stdout lines as events
    let stdout_handle = stdout.map(|stdout| {
        let app = app.clone();
        let session_id = session_id.to_string();
        let ended_flag = ended_flag.clone();
        let event_sequence = event_sequence.clone();
        std::thread::spawn(move || {
            let mut lines = Vec::new();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let sequence = event_sequence.fetch_add(1, Ordering::Relaxed);
                let _ = app.emit(
                    "agent://run-event",
                    PiRunEvent {
                        session_id: session_id.clone(),
                        stream: "stdout".to_string(),
                        line: line.clone(),
                        sequence,
                    },
                );
                if line.contains("\"type\":\"agent_end\"")
                    || line.contains("\"type\": \"agent_end\"")
                {
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
        let event_sequence = event_sequence.clone();
        std::thread::spawn(move || {
            let mut lines = Vec::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let sequence = event_sequence.fetch_add(1, Ordering::Relaxed);
                let _ = app.emit(
                    "agent://run-event",
                    PiRunEvent {
                        session_id: session_id.clone(),
                        stream: "stderr".to_string(),
                        line: line.clone(),
                        sequence,
                    },
                );
                lines.push(line);
            }
            lines
        })
    });

    // Send the prompt command over stdin, then keep it alive so Pi doesn't exit
    if let Some(stdin) = stdin {
        let system_instruction = match mode {
            "plan" => "[MODE: PLAN] You are in read-only planning mode. Analyze the codebase, understand the request, and provide a clear plan or strategy. Do NOT write, edit, or modify any files. Do NOT run bash commands. Provide your analysis and plan as text only.\n\n",
            "build" => "[MODE: BUILD] You are in build mode. Read, write, edit files and run commands to implement the requested changes. Follow best practices and verify your work.\n\n",
            _ => "",
        };
        let full_prompt = format!("{}{}", system_instruction, prompt);
        let prompt_cmd = json!({
            "type": "prompt",
            "message": full_prompt
        });
        let line = format!("{}\n", prompt_cmd);
        let mut stdin_owned = stdin;
        if let Err(e) = stdin_owned.write_all(line.as_bytes()) {
            let _ = child.kill();
            let _ = child.wait();
            unregister_agent_process(session_id);
            RUNNING_AGENT_STDIN.lock().remove(session_id);
            let _ = stdout_handle.and_then(|handle| handle.join().ok());
            let _ = stderr_handle.and_then(|handle| handle.join().ok());
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
    let exit_status = child.wait().unwrap_or_else(|_| {
        // Process already reaped — treat as success since we got agent_end
        successful_exit_status()
    });

    // If we saw agent_end, the kill was intentional — override non-zero exit code
    let exit_status = if ended_flag.load(Ordering::Relaxed) && !exit_status.success() {
        successful_exit_status()
    } else {
        exit_status
    };

    Ok(PiAgentOutput {
        exit_status,
        stdout,
        stderr,
    })
}

#[cfg(windows)]
fn successful_exit_status() -> std::process::ExitStatus {
    use std::os::windows::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(0)
}

#[cfg(unix)]
fn successful_exit_status() -> std::process::ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(0)
}

/// Generate `~/.pi/agent/models.json` with LM Studio provider config.
pub(crate) fn generate_pi_models_json(
    model: &str,
    context_length: Option<u32>,
    reserved_output_tokens: Option<u32>,
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
                        "reasoning": false,
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
    let existing = if path.exists() {
        serde_json::from_str(&fs::read_to_string(&path).map_err(|_| "Cannot read Pi models.json")?)
            .map_err(|_| "Pi models.json is invalid; refusing to overwrite it")?
    } else {
        json!({})
    };
    let merged = merge_lm_studio_config(existing, &models_json)?;
    let content = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| format!("failed to write models.json: {e}"))?;

    Ok(())
}

fn merge_lm_studio_config(
    mut config: serde_json::Value,
    defaults: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let root = config
        .as_object_mut()
        .ok_or("Pi models.json must be an object")?;
    let providers = root
        .entry("providers")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or("Pi providers must be an object")?;
    let provider = providers
        .entry("lmstudio")
        .or_insert_with(|| defaults["providers"]["lmstudio"].clone());
    let object = provider
        .as_object_mut()
        .ok_or("Pi LM Studio provider must be an object")?;
    let models = object
        .entry("models")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or("Pi LM Studio models must be an array")?;
    let new_model = &defaults["providers"]["lmstudio"]["models"][0];
    if !models.iter().any(|model| model["id"] == new_model["id"]) {
        models.push(new_model.clone());
    }
    Ok(config)
}

#[cfg(test)]
mod reasoning_tests {
    use super::*;
    #[test]
    fn validates_levels_and_legacy_toggle() {
        assert_eq!(resolve_thinking_level(None, Some(false)).unwrap(), "off");
        assert_eq!(resolve_thinking_level(None, Some(true)).unwrap(), "medium");
        assert_eq!(
            resolve_thinking_level(Some("max"), Some(false)).unwrap(),
            "max"
        );
        assert!(resolve_thinking_level(Some("invalid"), None).is_err());
    }
    #[test]
    fn preserves_custom_pi_provider_and_reasoning_metadata() {
        let existing = json!({"providers":{"custom":{"baseUrl":"https://example.invalid"},"lmstudio":{"compat":{"thinkingFormat":"qwen"},"models":[{"id":"model","reasoning":true,"thinkingLevelMap":{"minimal":null}}]}}});
        let defaults =
            json!({"providers":{"lmstudio":{"models":[{"id":"model","reasoning":false}]}}});
        assert_eq!(
            merge_lm_studio_config(existing.clone(), &defaults).unwrap(),
            existing
        );
        let new_defaults =
            json!({"providers":{"lmstudio":{"models":[{"id":"second","reasoning":false}]}}});
        let merged = merge_lm_studio_config(existing.clone(), &new_defaults).unwrap();
        assert_eq!(
            merged["providers"]["custom"],
            existing["providers"]["custom"]
        );
        assert_eq!(
            merged["providers"]["lmstudio"]["models"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
}
