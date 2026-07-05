use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::LazyLock;

pub(crate) static RUNNING_AGENT_PIDS: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Keep stdin handles alive so Pi doesn't exit before the LLM responds.
pub(crate) static RUNNING_AGENT_STDIN: LazyLock<Mutex<HashMap<String, std::process::ChildStdin>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub(crate) struct PiAgentOutput {
    pub(crate) exit_status: std::process::ExitStatus,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

pub(crate) fn register_agent_process(session_id: &str, pid: u32) {
    RUNNING_AGENT_PIDS
        .lock()
        .insert(session_id.to_string(), pid);
}

pub(crate) fn unregister_agent_process(session_id: &str) {
    RUNNING_AGENT_PIDS.lock().remove(session_id);
}

pub(crate) fn kill_agent_process(session_id: &str) {
    if let Some(pid) = RUNNING_AGENT_PIDS.lock().remove(session_id) {
        kill_pid(pid);
    }
    RUNNING_AGENT_STDIN.lock().remove(session_id);
}

pub(crate) fn kill_pid(pid: u32) {
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
