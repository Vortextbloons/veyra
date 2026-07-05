use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const OUTPUT_CHAR_LIMIT: usize = 20_000;
pub(crate) const TEMP_DIR_NAME: &str = "veyra-python-exec";
pub(crate) const CLEANUP_AGE_LIMIT: Duration = Duration::from_secs(24 * 60 * 60);
pub(crate) const POLL_INTERVAL: Duration = Duration::from_millis(50);

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) struct TempScriptGuard {
    pub(crate) path: PathBuf,
}

impl Drop for TempScriptGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub(crate) fn write_temp_script(code: &str) -> Result<TempScriptGuard, String> {
    let root = temp_root_dir();
    fs::create_dir_all(&root)
        .map_err(|error| format!("failed to create temp directory: {error}"))?;
    let path = root.join(unique_temp_script_name());
    fs::write(&path, code).map_err(|error| format!("failed to write temp script: {error}"))?;
    Ok(TempScriptGuard { path })
}

pub(crate) fn temp_root_dir() -> PathBuf {
    std::env::temp_dir().join(TEMP_DIR_NAME)
}

pub(crate) fn unique_temp_script_name() -> String {
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("veyra-python-exec-{nanos}-{counter}.py")
}

pub(crate) fn read_output_lines<R: std::io::Read>(reader: R) -> Vec<String> {
    BufReader::new(reader)
        .lines()
        .map_while(Result::ok)
        .collect::<Vec<_>>()
}

pub(crate) fn truncate_output(input: String) -> String {
    if input.chars().count() <= OUTPUT_CHAR_LIMIT {
        return input;
    }

    let mut truncated: String = input.chars().take(OUTPUT_CHAR_LIMIT).collect();
    truncated.push_str("\n...[truncated]");
    truncated
}

pub(crate) fn wait_with_timeout(
    child: &mut std::process::Child,
    timeout: Duration,
) -> Result<std::process::ExitStatus, std::io::Error> {
    let started_at = Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => return Ok(status),
            None if started_at.elapsed() >= timeout => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "python process timed out",
                ));
            }
            None => std::thread::sleep(POLL_INTERVAL),
        }
    }
}
