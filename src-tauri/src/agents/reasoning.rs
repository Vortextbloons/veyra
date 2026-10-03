use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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
) -> Result<ModelReasoning, String> {
    let mut child = Command::new("node")
        .args([
            "--input-type=module",
            "-e",
            &format!("{}\nawait main();", include_str!("model-capabilities.mjs")),
            provider,
            model,
            base_url,
            requested,
        ])
        .env("PI_OFFLINE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| {
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
        )
    })
    .await
    .map_err(|_| "Pi model capability task failed")?
}
