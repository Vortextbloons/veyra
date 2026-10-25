use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use tauri::Emitter;

/// Emitted when Pi's models.json changes so the UI can re-read its levels.
pub const REASONING_CHANGED_EVENT: &str = "pi-reasoning-changed";

// Inspection may register a missing route; serialize models.json read/modify/write.
static MODEL_CONFIG_LOCK: Mutex<()> = Mutex::new(());

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

pub(crate) fn inspect_model(
    provider: &str,
    model: &str,
    base_url: &str,
    requested: &str,
    context_length: Option<u32>,
    max_tokens: Option<u32>,
) -> Result<ModelReasoning, String> {
    let _guard = MODEL_CONFIG_LOCK
        .lock()
        .map_err(|_| "Pi model configuration lock failed")?;
    let base_url = if provider == "lm-studio" && base_url.is_empty() {
        crate::shared::constants::LM_STUDIO_OPENAI_BASE_URL
    } else {
        base_url
    };
    let mut command = Command::new("node");
    command
        .args([
            "--input-type=module",
            "-e",
            &format!("{}\nawait main();", include_str!("model-capabilities.mjs")),
            provider,
            model,
            base_url,
            requested,
            &context_length.map(|value| value.to_string()).unwrap_or_default(),
            &max_tokens.map(|value| value.to_string()).unwrap_or_default(),
        ])
        .env("PI_OFFLINE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::shared::process::hide_console(&mut command);
    let mut child = command.spawn().map_err(|_| {
        "Node and an installed Pi SDK are required to inspect model capabilities".to_string()
    })?;
    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(40)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Pi model capability lookup timed out or failed".into());
            }
        }
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "Pi model capability lookup failed")?;
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "Installed Pi did not return valid model capabilities".into())
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

/// Ask the installed Pi SDK where it keeps its model registry.
fn resolve_pi_agent_dir() -> Option<PathBuf> {
    let script = format!(
        "{}\nawait printAgentDir();",
        include_str!("model-capabilities.mjs")
    );
    let mut command = Command::new("node");
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
