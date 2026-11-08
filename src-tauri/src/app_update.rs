use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const MAX_INSTALLER_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const DOWNLOAD_PROGRESS_EVENT: &str = "app-update-download-progress";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
}

// Backend-owned staging: callers never supply a local executable path.
#[derive(Default)]
pub struct UpdateState(Mutex<Option<PreparedUpdate>>);

struct PreparedUpdate {
    path: PathBuf,
    kind: &'static str,
    sha256: String,
}

fn verify_installer(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| format!("could not open update: {e}"))?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|e| format!("could not verify update: {e}"))?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
        != expected
    {
        return Err("Update verification failed. Download the update again.".into());
    }
    Ok(())
}

fn validate_release_download(download_url: &str, asset_name: &str) -> Result<&'static str, String> {
    let url = url::Url::parse(download_url).map_err(|_| "invalid update download URL")?;
    if url.scheme() != "https" || url.host_str() != Some("github.com") {
        return Err("updates must download from the official GitHub repository".into());
    }

    let segments: Vec<_> = url
        .path_segments()
        .ok_or("invalid update download path")?
        .collect();
    if segments.len() != 6
        || !segments[0].eq_ignore_ascii_case("Vortextbloons")
        || !segments[1].eq_ignore_ascii_case("veyra")
        || segments[2] != "releases"
        || segments[3] != "download"
    {
        return Err("updates must download from the official Veyra releases".into());
    }

    if asset_name.is_empty()
        || asset_name.len() > 255
        || asset_name.contains('/')
        || asset_name.contains('\\')
        || Path::new(asset_name)
            .file_name()
            .and_then(|name| name.to_str())
            != Some(asset_name)
    {
        return Err("invalid update installer name".into());
    }
    let url_asset_name =
        urlencoding::decode(segments[5]).map_err(|_| "invalid update download path")?;
    if url_asset_name != asset_name {
        return Err("the update installer does not match the release download".into());
    }

    let extension = Path::new(asset_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if extension.eq_ignore_ascii_case("exe") {
        Ok("exe")
    } else if extension.eq_ignore_ascii_case("msi") {
        Ok("msi")
    } else {
        Err("the release does not contain a supported Windows installer".into())
    }
}

fn download_installer(
    app: &AppHandle,
    download_url: &str,
    asset_name: &str,
) -> Result<PathBuf, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Veyra-Desktop-Updater")
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|error| format!("could not start the update download: {error}"))?;
    let mut response = client
        .get(download_url)
        .send()
        .map_err(|error| format!("could not download the update: {error}"))?
        .error_for_status()
        .map_err(|error| format!("the update server returned an error: {error}"))?;

    let total_bytes = response.content_length();
    if total_bytes.is_some_and(|size| size > MAX_INSTALLER_BYTES) {
        return Err("the update installer is unexpectedly large".into());
    }

    let update_dir = std::env::temp_dir().join("Veyra").join("updates");
    fs::create_dir_all(&update_dir)
        .map_err(|error| format!("could not create the update directory: {error}"))?;
    let installer_path = update_dir.join(format!("{}-{asset_name}", std::process::id()));
    let partial_path = installer_path.with_extension("download");

    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&partial_path)
            .map_err(|error| format!("could not save the update: {error}"))?;
        let mut downloaded_bytes = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];

        loop {
            let count = response
                .read(&mut buffer)
                .map_err(|error| format!("the update download was interrupted: {error}"))?;
            if count == 0 {
                break;
            }

            downloaded_bytes += count as u64;
            if downloaded_bytes > MAX_INSTALLER_BYTES {
                return Err("the update installer is unexpectedly large".into());
            }
            file.write_all(&buffer[..count])
                .map_err(|error| format!("could not save the update: {error}"))?;
            let _ = app.emit(
                DOWNLOAD_PROGRESS_EVENT,
                DownloadProgress {
                    downloaded_bytes,
                    total_bytes,
                },
            );
        }

        file.flush()
            .map_err(|error| format!("could not finish saving the update: {error}"))?;
        if downloaded_bytes == 0 {
            return Err("the downloaded update installer is empty".into());
        }
        if total_bytes.is_some_and(|expected| downloaded_bytes != expected) {
            return Err("the update download did not complete".into());
        }

        if installer_path.exists() {
            fs::remove_file(&installer_path)
                .map_err(|error| format!("could not replace the previous update: {error}"))?;
        }
        fs::rename(&partial_path, &installer_path)
            .map_err(|error| format!("could not prepare the update installer: {error}"))?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&partial_path);
        return Err(error);
    }

    Ok(installer_path)
}

fn launch_installer(installer_path: &Path, installer_kind: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = if installer_kind == "msi" {
            let mut command = Command::new("msiexec.exe");
            command.arg("/i").arg(installer_path).args([
                "/passive",
                "/norestart",
                "AUTOLAUNCHAPP=True",
            ]);
            command
        } else {
            let mut command = Command::new(installer_path);
            // Tauri NSIS update protocol; NSIS remembers the installed location.
            command.args(["/S", "/UPDATE", "/R"]);
            command
        };

        crate::shared::process::hide_console(&mut command);
        command
            .spawn()
            .map_err(|error| format!("could not launch the update installer: {error}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (installer_path, installer_kind);
        Err("direct updates are currently supported on Windows only".into())
    }
}

#[tauri::command]
pub async fn prepare_app_update(
    app: AppHandle,
    download_url: String,
    asset_name: String,
    sha256: String,
) -> Result<(), String> {
    let kind = validate_release_download(&download_url, &asset_name)?;
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(
            "This release has no valid SHA-256 checksum. Open releases to update manually.".into(),
        );
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<UpdateState>();
        let mut staged = state
            .0
            .try_lock()
            .map_err(|_| "An update operation is already running")?;
        let sha256 = sha256.to_ascii_lowercase();
        if let Some(update) = staged.as_ref() {
            if update.sha256 == sha256 && verify_installer(&update.path, &sha256).is_ok() {
                return Ok(());
            }
        }
        let path = download_installer(&app, &download_url, &asset_name)?;
        if let Err(error) = verify_installer(&path, &sha256) {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        if let Some(previous) = staged.take() {
            if previous.path != path {
                let _ = fs::remove_file(previous.path);
            }
        }
        *staged = Some(PreparedUpdate { path, kind, sha256 });
        Ok(())
    })
    .await
    .map_err(|e| format!("update preparation failed: {e}"))?
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<UpdateState>();
        let staged = state
            .0
            .try_lock()
            .map_err(|_| "An update operation is already running")?;
        let update = staged
            .as_ref()
            .ok_or("Download the update before restarting")?;
        verify_installer(&update.path, &update.sha256)?;
        if let Some(state) = app.try_state::<crate::web_search::engine::SearchEngineState>() {
            state.stop_now();
        }
        launch_installer(&update.path, update.kind)?;
        crate::agents::commands::stop_all_pi_agents();
        crate::agents::reasoning::stop_reasoning_worker();
        app.exit(0);
        Ok(())
    })
    .await
    .map_err(|e| format!("update installation failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_staged_bytes_and_rejects_modified_files() {
        let path = std::env::temp_dir().join(format!("veyra-update-test-{}", std::process::id()));
        fs::write(&path, b"abc").unwrap();
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(verify_installer(&path, expected).is_ok());
        fs::write(&path, b"changed").unwrap();
        assert!(verify_installer(&path, expected).is_err());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn accepts_official_windows_release_installers() {
        assert_eq!(
            validate_release_download(
                "https://github.com/Vortextbloons/veyra/releases/download/v1.2.0/Veyra-setup.exe",
                "Veyra-setup.exe",
            ),
            Ok("exe")
        );
        assert_eq!(
            validate_release_download(
                "https://github.com/vortextbloons/VEYRA/releases/download/v1.2.0/Veyra.msi",
                "Veyra.msi",
            ),
            Ok("msi")
        );
    }

    #[test]
    fn rejects_untrusted_or_unsupported_downloads() {
        assert!(validate_release_download(
            "https://example.com/Veyra-setup.exe",
            "Veyra-setup.exe"
        )
        .is_err());
        assert!(validate_release_download(
            "https://github.com/another/repo/releases/download/v1.2.0/Veyra-setup.exe",
            "Veyra-setup.exe"
        )
        .is_err());
        assert!(validate_release_download(
            "https://github.com/Vortextbloons/veyra/releases/download/v1.2.0/Veyra.zip",
            "Veyra.zip"
        )
        .is_err());
    }
}
