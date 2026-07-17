use serde::Serialize;

pub const CODE_EXECUTION_DISABLED_MESSAGE: &str =
    "Native Python execution is disabled because it is not isolated from the host operating system. Veyra will re-enable code execution only with an OS-enforced sandbox.";

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
    _python_path: Option<String>,
) -> Result<PythonAvailabilityResult, String> {
    Ok(PythonAvailabilityResult {
        available: false,
        resolved_path: None,
        source: None,
        version: None,
        message: Some(CODE_EXECUTION_DISABLED_MESSAGE.to_string()),
    })
}

#[tauri::command]
pub async fn execute_python_code(
    _code: String,
    _timeout_secs: Option<u64>,
    _python_path: Option<String>,
    _workspace_root: Option<String>,
) -> Result<PythonExecutionResult, String> {
    Err(CODE_EXECUTION_DISABLED_MESSAGE.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_message_names_the_missing_security_boundary() {
        assert!(CODE_EXECUTION_DISABLED_MESSAGE.contains("not isolated"));
        assert!(CODE_EXECUTION_DISABLED_MESSAGE.contains("OS-enforced sandbox"));
    }
}
