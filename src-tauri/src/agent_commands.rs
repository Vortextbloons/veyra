use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tauri::Emitter;

const LM_STUDIO_OPENAI_BASE_URL: &str = "http://localhost:1234/v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpencodeAgentInput {
    pub session_id: String,
    pub mode: String,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub provider_id: Option<String>,
    pub opencode_session_id: Option<String>,
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

#[tauri::command]
pub fn check_opencode_available() -> bool {
    run_opencode_command(None, &["--version".to_string()], false, None)
        .is_ok_and(|output| output.status.success())
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
            run_opencode_agent_blocking(&input).unwrap_or_else(|error| OpencodeRunResult {
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
    let model = opencode_model_for_selected_model(requested_model, route_to_lm_studio);
    let config_content = route_to_lm_studio
        .then(|| lm_studio_opencode_config_content(requested_model))
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
        _ => "build",
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

fn lm_studio_opencode_config_content(model: &str) -> Result<String, String> {
    let model_id = model.trim().trim_end_matches('/').trim_end_matches('\\');
    if model_id.is_empty() {
        return Err("LM Studio model is required".into());
    }

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
                        "tool_call": true,
                        "temperature": true,
                        "limit": {
                            "context": 8192,
                            "output": 4096
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

    Ok(PathBuf::from(project_path))
}

fn run_opencode_command(
    cwd: Option<&Path>,
    args: &[String],
    route_to_lm_studio: bool,
    config_content: Option<&str>,
) -> Result<Output, String> {
    let mut errors = Vec::new();

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

        if route_to_lm_studio {
            command
                .env("OPENAI_API_KEY", "lm-studio")
                .env("OPENAI_BASE_URL", LM_STUDIO_OPENAI_BASE_URL)
                .env("OPENAI_API_BASE", LM_STUDIO_OPENAI_BASE_URL);
        }

        if let Some(config_content) = config_content {
            command.env("OPENCODE_CONFIG_CONTENT", config_content);
        }

        match command.output() {
            Ok(output) => return Ok(output),
            Err(error) => errors.push(error.to_string()),
        }
    }

    Err(format!(
        "failed to start opencode. Tried opencode command shims and npx fallback. {}",
        errors.join("; ")
    ))
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
        let mut shell_args = vec!["/C".to_string(), "opencode".to_string()];
        shell_args.extend(args.iter().map(|arg| arg.to_string()));
        shell_args
    } else {
        let mut command = "opencode".to_string();
        for arg in args {
            command.push(' ');
            command.push_str(&shell_quote(arg));
        }
        vec!["-c".to_string(), command]
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
