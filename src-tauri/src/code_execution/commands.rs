use std::time::{Duration, Instant};
use serde::Serialize;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

const PYTHON_CANDIDATES: &[&str] = &["python", "python3", "py"];

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
    let has_custom = python_path.as_ref().is_some_and(|p| !p.trim().is_empty());
    let candidates: Vec<&str> = if has_custom {
        vec![python_path.as_ref().unwrap().trim()]
    } else {
        PYTHON_CANDIDATES.to_vec()
    };

    for candidate in candidates {
        let Ok(output) = Command::new(candidate)
            .arg("--version")
            .output()
            .await
        else { continue; };

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            let version = if version.is_empty() {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            } else {
                version
            };

            return Ok(PythonAvailabilityResult {
                available: true,
                resolved_path: Some(candidate.to_string()),
                source: Some(if has_custom { "custom" } else { "probe" }.to_string()),
                version: Some(version),
                message: None,
            });
        }
    }

    Ok(PythonAvailabilityResult {
        available: false,
        resolved_path: None,
        source: None,
        version: None,
        message: Some(
            "Python not found. Install Python or provide a custom path in Settings \u{2192} Tools \u{2192} Code Execution."
                .to_string(),
        ),
    })
}

#[tauri::command]
pub async fn execute_python_code(
    code: String,
    timeout_secs: Option<u64>,
    python_path: Option<String>,
    workspace_root: Option<String>,
) -> Result<PythonExecutionResult, String> {
    let python_path = python_path
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "python".to_string());
    let timeout_secs = timeout_secs.unwrap_or(30).max(1).min(300);
    let working_directory = workspace_root
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| ".".to_string());

    let mut child = Command::new(&python_path)
        .arg("-c")
        .arg(&code)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(&working_directory)
        .spawn()
        .map_err(|e| format!("Failed to start Python: {e}"))?;

    let mut child_stdout = child.stdout.take();
    let mut child_stderr = child.stderr.take();
    let start = Instant::now();

    let wait_result = timeout(Duration::from_secs(timeout_secs), child.wait()).await;
    let elapsed = start.elapsed();

    let (exit_code, timed_out) = match wait_result {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => return Err(format!("Python process error: {e}")),
        Err(_) => {
            let _ = child.start_kill();
            let _ = timeout(Duration::from_secs(3), child.wait()).await;
            (None, true)
        }
    };

    let stdout = read_pipe(&mut child_stdout).await;
    let stderr = read_pipe(&mut child_stderr).await;

    Ok(PythonExecutionResult {
        stdout,
        stderr,
        exit_code,
        timed_out,
        python_path,
        duration_ms: elapsed.as_millis(),
        working_directory,
    })
}

async fn read_pipe<R: tokio::io::AsyncRead + Unpin>(reader: &mut Option<R>) -> String {
    match reader {
        Some(ref mut r) => {
            let mut buf = Vec::new();
            let _ = r.read_to_end(&mut buf).await;
            String::from_utf8_lossy(&buf).to_string()
        }
        None => String::new(),
    }
}
