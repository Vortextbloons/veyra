use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpencodeAgentInput {
    pub session_id: String,
    pub mode: String,
    pub project_path: String,
    pub prompt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeRunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[tauri::command]
pub fn check_opencode_available() -> bool {
    run_opencode_command(None, &["--version"]).is_ok_and(|output| output.status.success())
}

#[tauri::command]
pub fn run_opencode_agent(input: StartOpencodeAgentInput) -> Result<OpencodeRunResult, String> {
    let mode = input.mode.trim();
    let project_path = input.project_path.trim();
    let prompt = input.prompt.trim();

    if input.session_id.trim().is_empty() {
        return Err("agent session id is required".into());
    }

    if !matches!(mode, "plan" | "review" | "build" | "debug" | "refactor") {
        return Err("agent mode is not supported".into());
    }

    if prompt.is_empty() {
        return Err("agent prompt is required".into());
    }

    let cwd = resolve_workspace_path(project_path)?;
    if !cwd.is_dir() {
        return Err(
            "workspace path must be an existing directory; empty folders are supported".into(),
        );
    }

    let output = run_opencode_command(Some(&cwd), &["run", "--agent", mode, prompt])?;

    Ok(OpencodeRunResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

fn resolve_workspace_path(project_path: &str) -> Result<PathBuf, String> {
    if project_path.is_empty() {
        return std::env::current_dir()
            .map_err(|error| format!("failed to resolve default workspace: {error}"));
    }

    Ok(PathBuf::from(project_path))
}

fn run_opencode_command(cwd: Option<&Path>, args: &[&str]) -> Result<Output, String> {
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

fn shell_args(args: &[&str]) -> Vec<String> {
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
