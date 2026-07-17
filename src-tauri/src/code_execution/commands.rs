use crate::code_execution::process_utils::*;
use crate::code_execution::python_resolver::resolve_python;
use crate::code_execution::security_scanner::scan_python_code;
use serde::Serialize;
use std::fs;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonAvailabilityResult {
    pub available: bool,
    pub resolved_path: Option<String>,
    pub source: Option<String>,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub python_path: String,
    pub duration_ms: u128,
    pub working_directory: String,
}

#[tauri::command]
pub async fn check_python_available(
    python_path: Option<String>,
) -> Result<PythonAvailabilityResult, String> {
    let preferred = python_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    tauri::async_runtime::spawn_blocking(move || {
        resolve_python(preferred.as_deref(), false).map_or_else(
            || {
                Ok(PythonAvailabilityResult {
                    available: false,
                    resolved_path: None,
                    source: None,
                    version: None,
                    message: Some(
                        "Python 3 was not found. Install Python or set a custom path in settings."
                            .to_string(),
                    ),
                })
            },
            |probe| {
                Ok(PythonAvailabilityResult {
                    available: true,
                    resolved_path: Some(probe.display_path.clone()),
                    source: Some(probe.source),
                    version: Some(probe.version),
                    message: Some(format!("Python available at {}", probe.display_path)),
                })
            },
        )
    })
    .await
    .map_err(|error| format!("python detection task failed: {error}"))?
}

#[tauri::command]
pub async fn execute_python_code(
    code: String,
    timeout_secs: Option<u64>,
    python_path: Option<String>,
    workspace_root: Option<String>,
) -> Result<PythonExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_python_code_sync(code, timeout_secs, python_path, workspace_root)
    })
    .await
    .map_err(|error| format!("python execution task failed: {error}"))?
}

pub fn cleanup_stale_temp_files() {
    let root = temp_root_dir();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !name.starts_with("veyra-python-exec-") || !name.ends_with(".py") {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let modified = match metadata.modified() {
            Ok(modified) => modified,
            Err(_) => continue,
        };
        let is_stale = SystemTime::now()
            .duration_since(modified)
            .map(|age| age >= CLEANUP_AGE_LIMIT)
            .unwrap_or(true);
        if is_stale {
            let _ = fs::remove_file(&path);
        }
    }
}

fn execute_python_code_sync(
    code: String,
    timeout_secs: Option<u64>,
    python_path: Option<String>,
    workspace_root: Option<String>,
) -> Result<PythonExecutionResult, String> {
    let code = code.trim();
    if code.is_empty() {
        return Err("Python code is required".into());
    }

    let ws_root = workspace_root
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(std::path::Path::new)
        .map(std::fs::canonicalize)
        .transpose()
        .map_err(|error| format!("failed to resolve workspace directory: {error}"))?;
    if ws_root.as_ref().is_some_and(|path| !path.is_dir()) {
        return Err("workspace path must be an existing directory".into());
    }

    scan_python_code(code, ws_root.as_deref())?;

    let timeout_secs = timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .clamp(1, MAX_TIMEOUT_SECS);

    let current_dir = match ws_root {
        Some(path) => path,
        None => std::env::current_dir()
            .map_err(|error| format!("failed to resolve working directory: {error}"))?,
    };
    let preferred = python_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let resolved = resolve_python(preferred, preferred.is_some()).ok_or_else(|| {
        "Python interpreter not found. Set a custom path in settings or click auto-detect."
            .to_string()
    })?;

    cleanup_stale_temp_files();
    let temp_script = write_temp_script(code)?;
    let started_at = Instant::now();

    let mut command = Command::new(&resolved.program);
    command
        .args(&resolved.args)
        .arg("-I")
        .arg("-B")
        .arg("-X")
        .arg("utf8")
        .arg(&temp_script.path)
        .current_dir(&current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start Python: {error}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_handle = stdout.map(|stdout| std::thread::spawn(move || read_output_lines(stdout)));
    let stderr_handle = stderr.map(|stderr| std::thread::spawn(move || read_output_lines(stderr)));

    let mut timed_out = false;
    let exit_status = match wait_with_timeout(&mut child, Duration::from_secs(timeout_secs)) {
        Ok(status) => status,
        Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            timed_out = true;
            let _ = child.kill();
            child.wait().map_err(|wait_error| {
                format!("failed waiting for Python after timeout: {wait_error}")
            })?
        }
        Err(error) => {
            let _ = child.kill();
            return Err(format!("failed while running Python: {error}"));
        }
    };

    let stdout = stdout_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .join("\n");
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .join("\n");

    Ok(PythonExecutionResult {
        stdout: truncate_output(stdout),
        stderr: truncate_output(stderr),
        exit_code: exit_status.code(),
        timed_out,
        python_path: resolved.display_path,
        duration_ms: started_at.elapsed().as_millis(),
        working_directory: current_dir.to_string_lossy().to_string(),
    })
}
