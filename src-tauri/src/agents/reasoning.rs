use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tauri::Emitter;

/// Emitted when Pi's models.json changes so the UI can re-read its levels.
pub const REASONING_CHANGED_EVENT: &str = "pi-reasoning-changed";

/// Reading the Pi registry costs about 1.4 seconds, almost all of it importing
/// the SDK and materializing 1600 models. One warm worker answers every lookup
/// in a few milliseconds, so capability reads never run that import again.
const WORKER_START_TIMEOUT: Duration = Duration::from_secs(30);
const WORKER_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelReasoning {
    pub known: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub levels: Vec<String>,
    pub effective_level: Option<String>,
    pub control: Option<String>,
    pub message: String,
}

#[derive(Deserialize)]
struct WorkerReply {
    result: ModelReasoning,
}

/// One long-lived `node` process answering capability lookups over stdin lines.
struct ReasoningWorker {
    child: Child,
    stdin: ChildStdin,
    lines: mpsc::Receiver<String>,
    next_id: u64,
    /// Set when the process is gone or its pipes broke, so the caller retries
    /// with a fresh worker. Timeouts keep the worker alive.
    lost: bool,
}

impl ReasoningWorker {
    fn spawn() -> Result<Self, String> {
        let script = format!("{}\nawait serve();", include_str!("model-capabilities.mjs"));
        let mut command = super::runtime::node_command()?;
        command
            .args(["--input-type=module", "-e", &script])
            .env("PI_OFFLINE", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        crate::shared::process::hide_console(&mut command);
        let mut child = command.spawn().map_err(|_| {
            "Could not start the bundled Pi capability runtime".to_string()
        })?;
        let stdin = child.stdin.take().ok_or("Pi capability worker stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("Pi capability worker stdout unavailable")?;
        // Forward stdout to the requester so a slow lookup cannot block forever.
        let (sender, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        let mut worker = Self { child, stdin, lines, next_id: 0, lost: false };
        worker.read_line(WORKER_START_TIMEOUT)?;
        Ok(worker)
    }

    /// Wait for one reply line, failing fast when the worker exits.
    fn read_line(&mut self, timeout: Duration) -> Result<String, String> {
        let deadline = Instant::now() + timeout;
        loop {
            match self.lines.recv_timeout(Duration::from_millis(50)) {
                Ok(line) => return Ok(line),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    self.lost = true;
                    return Err("Pi model capability worker exited".into());
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if Instant::now() >= deadline {
                        // A slow lookup leaves a late reply queued; the id check
                        // in `lookup` discards it, so the worker can stay alive.
                        return Err("Pi model capability lookup timed out or failed".into());
                    }
                    match self.child.try_wait() {
                        Ok(Some(_)) => {
                            self.lost = true;
                            return Err("Pi model capability worker exited".into());
                        }
                        Ok(None) => {}
                        Err(_) => {
                            self.lost = true;
                            return Err("Pi model capability worker failed".into());
                        }
                    }
                }
            }
        }
    }

    fn lookup(&mut self, input: &serde_json::Value) -> Result<ModelReasoning, String> {
        self.next_id = self.next_id.wrapping_add(1);
        let id = self.next_id;
        let request = format!("{}\n", serde_json::json!({ "id": id, "input": input }));
        if self
            .stdin
            .write_all(request.as_bytes())
            .and_then(|_| self.stdin.flush())
            .is_err()
        {
            self.lost = true;
            return Err("Pi model capability worker stopped".into());
        }
        loop {
            let line = self.read_line(WORKER_REQUEST_TIMEOUT)?;
            let Ok(reply) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            if reply.get("id").and_then(serde_json::Value::as_u64) != Some(id) {
                continue;
            }
            return serde_json::from_value::<WorkerReply>(reply)
                .map(|reply| reply.result)
                .map_err(|_| "Installed Pi did not return valid model capabilities".to_string());
        }
    }
}

impl Drop for ReasoningWorker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// A stale worker is discarded with its process; the next lookup spawns a fresh one.
static WORKER: Mutex<Option<ReasoningWorker>> = Mutex::new(None);

/// Resolve capabilities for one model, starting or reusing the warm worker.
pub(crate) fn inspect_model(
    provider: &str,
    model: &str,
    base_url: &str,
    requested: &str,
    context_length: Option<u32>,
    max_tokens: Option<u32>,
) -> Result<ModelReasoning, String> {
    let base_url = if provider == "lm-studio" && base_url.is_empty() {
        crate::shared::constants::LM_STUDIO_OPENAI_BASE_URL
    } else {
        base_url
    };
    let input = serde_json::json!({
        "providerId": provider,
        "modelId": model,
        "baseUrl": base_url,
        "requested": requested,
        "contextLength": context_length.map(|value| value.to_string()).unwrap_or_default(),
        "maxTokens": max_tokens.map(|value| value.to_string()).unwrap_or_default(),
    });
    let mut guard = WORKER
        .lock()
        .map_err(|_| "Pi model configuration lock failed")?;
    for attempt in 0..2 {
        if guard.is_none() {
            *guard = Some(ReasoningWorker::spawn()?);
        }
        let outcome = match guard.as_mut() {
            Some(worker) => worker.lookup(&input),
            None => Err("Pi model capability worker unavailable".to_string()),
        };
        match outcome {
            Ok(result) => return Ok(result),
            // Only a dropped process needs a replacement; a timeout is reported
            // as-is so a slow model cannot spawn a new worker on every request.
            Err(_) if attempt == 0 && guard.as_ref().is_some_and(|worker| worker.lost) => {
                *guard = None;
            }
            Err(error) => return Err(error),
        }
    }
    Err("Pi model capability lookup failed".into())
}

/// Release the worker process before the app exits. Never blocks shutdown: a
/// lookup in flight owns the lock, and the process exits with the app.
pub fn stop_reasoning_worker() {
    if let Ok(mut guard) = WORKER.try_lock() {
        *guard = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The worker must stay warm: reusing it is what removes the ~1.4s Pi SDK
    /// import from every capability lookup. A per-lookup process would take
    /// seconds for three calls and leave nothing running in between.
    #[test]
    fn reuses_one_warm_worker_across_lookups() {
        let mut guard = WORKER.lock().unwrap_or_else(|error| error.into_inner());
        *guard = None;
        let pid = |guard: &Option<ReasoningWorker>| guard.as_ref().map(|worker| worker.child.id());
        let input = serde_json::json!({
            "providerId": "lm-studio",
            "modelId": "test-model",
            "baseUrl": "http://localhost:1234/v1",
            "requested": "medium",
            "contextLength": "",
            "maxTokens": "",
        });
        let mut elapsed = Vec::new();
        let mut ids = Vec::new();
        for _ in 0..3 {
            if guard.is_none() {
                *guard = Some(ReasoningWorker::spawn().expect("worker starts"));
            }
            let started = Instant::now();
            let result = guard.as_mut().expect("worker present").lookup(&input);
            elapsed.push(started.elapsed());
            ids.push(pid(&guard));
            assert!(result.is_ok(), "lookup failed: {result:?}");
        }
        *guard = None;
        assert_eq!(ids[0], ids[1]);
        assert_eq!(ids[1], ids[2]);
        // Warm lookups are milliseconds; a cold import costs more than a second.
        assert!(
            elapsed[2] < Duration::from_millis(500),
            "third lookup took {:?}, so the worker was not warm",
            elapsed[2]
        );
    }
}

#[tauri::command]
pub async fn inspect_agent_reasoning(
    provider_id: String,
    model: String,
    provider_base_url: Option<String>,
) -> Result<ModelReasoning, String> {
    tauri::async_runtime::spawn_blocking(move || {
        inspect_model(
            &provider_id,
            &model,
            provider_base_url.as_deref().unwrap_or(""),
            "medium",
            None,
            None,
        )
    })
    .await
    .map_err(|_| "Pi model capability task failed")?
}

/// Refresh Pi's persisted catalog once at application launch, off the UI thread.
/// The catalog update runs in its own short-lived process: it downloads from the
/// network, and the warm worker must stay responsive while it runs.
#[tauri::command]
pub async fn refresh_agent_models(app: tauri::AppHandle) -> Result<ModelReasoning, String> {
    let result = tauri::async_runtime::spawn_blocking(refresh_catalog)
        .await
        .map_err(|_| "Pi catalog refresh task failed")??;
    if result.known {
        let _ = app.emit(REASONING_CHANGED_EVENT, ());
    }
    Ok(result)
}

fn refresh_catalog() -> Result<ModelReasoning, String> {
    let script = format!("{}\nawait main();", include_str!("model-capabilities.mjs"));
    let mut command = super::runtime::node_command()?;
    command
        .args([
            "--input-type=module",
            "-e",
            &script,
            "__refresh_catalog__",
            "",
            "",
            "",
            "",
            "",
        ])
        // This is the only spawn allowed to reach the network.
        .env_remove("PI_OFFLINE")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::shared::process::hide_console(&mut command);
    let output = command.output().map_err(|_| {
        "Could not start the bundled Pi capability runtime".to_string()
    })?;
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "Installed Pi did not return valid model capabilities".into())
}

/// Ask the installed Pi SDK where it keeps its model registry.
fn resolve_pi_agent_dir() -> Option<PathBuf> {
    let script = format!(
        "{}\nawait printAgentDir();",
        include_str!("model-capabilities.mjs")
    );
    let mut command = super::runtime::node_command().ok()?;
    command
        .args(["--input-type=module", "-e", &script])
        .env("PI_OFFLINE", "1")
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    crate::shared::process::hide_console(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout);
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

/// Watch Pi's models.json and notify the frontend when it changes. Polling the
/// mtime avoids an extra filesystem-watching dependency and is effectively
/// free at a two-second cadence.
pub fn start_reasoning_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut agent_dir = resolve_pi_agent_dir();
        let mut last_modified: Option<SystemTime> = None;
        let mut ticks: u64 = 0;
        loop {
            if agent_dir.is_none() && ticks % 30 == 0 {
                agent_dir = resolve_pi_agent_dir();
            }
            if let Some(directory) = agent_dir.as_ref() {
                if let Ok(metadata) = std::fs::metadata(directory.join("models.json")) {
                    if let Ok(modified) = metadata.modified() {
                        if last_modified != Some(modified) {
                            let had_baseline = last_modified.is_some();
                            last_modified = Some(modified);
                            if had_baseline {
                                let _ = app.emit(REASONING_CHANGED_EVENT, ());
                            }
                        }
                    }
                }
            }
            ticks = ticks.wrapping_add(1);
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}
