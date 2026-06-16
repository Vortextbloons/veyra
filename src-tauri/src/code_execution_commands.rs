use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 300;
const OUTPUT_CHAR_LIMIT: usize = 20_000;
const PYTHON_PROBE_SNIPPET: &str = "import sys; print(sys.version.split()[0])";
const TEMP_DIR_NAME: &str = "veyra-python-exec";
const CLEANUP_AGE_LIMIT: Duration = Duration::from_secs(24 * 60 * 60);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

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

struct PythonCommandSpec {
    program: String,
    args: Vec<String>,
    source: String,
    display_path: String,
}

struct PythonDetectedCandidate {
    program: String,
    args: Vec<String>,
    source: String,
    display_path: String,
    version: String,
}

struct TempScriptGuard {
    path: PathBuf,
}

impl Drop for TempScriptGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

#[tauri::command]
pub async fn check_python_available(python_path: Option<String>) -> Result<PythonAvailabilityResult, String> {
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
) -> Result<PythonExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || execute_python_code_sync(code, timeout_secs, python_path))
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
) -> Result<PythonExecutionResult, String> {
    let code = code.trim();
    if code.is_empty() {
        return Err("Python code is required".into());
    }

    scan_python_code(code)?;

    let timeout_secs = timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .clamp(1, MAX_TIMEOUT_SECS);

    let current_dir = std::env::current_dir().map_err(|error| format!("failed to resolve working directory: {error}"))?;
    let preferred = python_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let resolved = resolve_python(preferred, preferred.is_some())
        .ok_or_else(|| "Python interpreter not found. Set a custom path in settings or click auto-detect.".to_string())?;

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
            child
                .wait()
                .map_err(|wait_error| format!("failed waiting for Python after timeout: {wait_error}"))?
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

fn resolve_python(preferred: Option<&str>, exact_only: bool) -> Option<PythonDetectedCandidate> {
    if let Some(candidate) = preferred.and_then(parse_user_python_path) {
        if let Some(spec) = probe_python_candidate(candidate) {
            return Some(spec);
        }
        if exact_only {
            return None;
        }
    }

    for candidate in search_python_candidates() {
        if let Some(spec) = probe_python_candidate(candidate) {
            return Some(spec);
        }
    }

    None
}

fn parse_user_python_path(value: &str) -> Option<PythonCommandSpec> {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'');
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.eq_ignore_ascii_case("py") || trimmed.eq_ignore_ascii_case("py.exe") {
        return Some(PythonCommandSpec {
            program: if cfg!(windows) { "py".to_string() } else { trimmed.to_string() },
            args: vec!["-3".to_string()],
            source: "custom path".to_string(),
            display_path: if cfg!(windows) { "py -3".to_string() } else { trimmed.to_string() },
        });
    }

    if trimmed.eq_ignore_ascii_case("python") || trimmed.eq_ignore_ascii_case("python.exe") {
        return Some(PythonCommandSpec {
            program: if cfg!(windows) { "python".to_string() } else { trimmed.to_string() },
            args: Vec::new(),
            source: "custom path".to_string(),
            display_path: trimmed.to_string(),
        });
    }

    Some(PythonCommandSpec {
        program: trimmed.to_string(),
        args: Vec::new(),
        source: "custom path".to_string(),
        display_path: trimmed.to_string(),
    })
}

fn search_python_candidates() -> Vec<PythonCommandSpec> {
    let mut candidates = vec![
        PythonCommandSpec {
            program: "py".to_string(),
            args: vec!["-3".to_string()],
            source: "py launcher".to_string(),
            display_path: "py -3".to_string(),
        },
        PythonCommandSpec {
            program: "python".to_string(),
            args: Vec::new(),
            source: "PATH".to_string(),
            display_path: "python".to_string(),
        },
        PythonCommandSpec {
            program: "python3".to_string(),
            args: Vec::new(),
            source: "PATH".to_string(),
            display_path: "python3".to_string(),
        },
    ];

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(PythonCommandSpec {
            program: PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Python")
                .join("Launcher")
                .join("py.exe")
                .to_string_lossy()
                .to_string(),
            args: vec!["-3".to_string()],
            source: "known path".to_string(),
            display_path: PathBuf::from(local_app_data)
                .join("Programs")
                .join("Python")
                .join("Launcher")
                .join("py.exe")
                .to_string_lossy()
                .to_string(),
        });
    }

    candidates.extend(known_python_install_paths().into_iter().map(|path| PythonCommandSpec {
        program: path.to_string_lossy().to_string(),
        args: Vec::new(),
        source: "known path".to_string(),
        display_path: path.to_string_lossy().to_string(),
    }));

    candidates
}

fn known_python_install_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let versions = ["314", "313", "312", "311", "310", "39", "38"];

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        for version in versions {
            paths.push(
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("Python")
                    .join(format!("Python{version}"))
                    .join("python.exe"),
            );
        }
    }

    for env_var in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
        if let Ok(program_files) = std::env::var(env_var) {
            for version in versions {
                paths.push(
                    PathBuf::from(&program_files)
                        .join(format!("Python{version}"))
                        .join("python.exe"),
                );
            }
        }
    }

    paths
}

fn probe_python_candidate(candidate: PythonCommandSpec) -> Option<PythonDetectedCandidate> {
    let output = Command::new(&candidate.program)
        .args(&candidate.args)
        .arg("-I")
        .arg("-c")
        .arg(PYTHON_PROBE_SNIPPET)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let mut version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        version = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }

    if version.is_empty() {
        version = "unknown".to_string();
    }

    Some(PythonDetectedCandidate {
        program: candidate.program,
        args: candidate.args,
        source: candidate.source,
        display_path: candidate.display_path,
        version,
    })
}

fn write_temp_script(code: &str) -> Result<TempScriptGuard, String> {
    let root = temp_root_dir();
    fs::create_dir_all(&root).map_err(|error| format!("failed to create temp directory: {error}"))?;
    let path = root.join(unique_temp_script_name());
    fs::write(&path, code).map_err(|error| format!("failed to write temp script: {error}"))?;
    Ok(TempScriptGuard { path })
}

fn temp_root_dir() -> PathBuf {
    std::env::temp_dir().join(TEMP_DIR_NAME)
}

fn unique_temp_script_name() -> String {
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("veyra-python-exec-{nanos}-{counter}.py")
}

fn read_output_lines<R: std::io::Read>(reader: R) -> Vec<String> {
    BufReader::new(reader)
        .lines()
        .map_while(Result::ok)
        .collect::<Vec<_>>()
}

fn truncate_output(input: String) -> String {
    if input.chars().count() <= OUTPUT_CHAR_LIMIT {
        return input;
    }

    let mut truncated: String = input.chars().take(OUTPUT_CHAR_LIMIT).collect();
    truncated.push_str("\n...[truncated]");
    truncated
}

fn wait_with_timeout(
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

fn scan_python_code(code: &str) -> Result<(), String> {
    let (no_comments, no_strings) = strip_comments_and_strings(code);
    let blocked_modules = ["os", "subprocess", "shutil", "ctypes", "socket", "multiprocessing", "tempfile", "builtins"];
    let known_safe_modules = [
        "math", "json", "csv", "re", "collections", "itertools", "functools", "typing",
        "datetime", "random", "statistics", "decimal", "fractions", "string", "textwrap",
        "difflib", "hashlib", "base64", "uuid", "dataclasses", "enum", "heapq", "bisect",
        "array", "struct", "pprint",
    ];
    let _ = known_safe_modules;

    for (line_index, (plain_line, raw_line)) in no_strings.lines().zip(no_comments.lines()).enumerate() {
        let line_no = line_index + 1;
        for statement in plain_line.split(';') {
            let candidate = statement.trim();
            if candidate.is_empty() {
                continue;
            }

            let import_candidate = candidate
                .split(':')
                .next_back()
                .map(str::trim)
                .unwrap_or(candidate);

            if let Some(rest) = import_candidate.strip_prefix("import ") {
                for item in rest.split(',') {
                    let module = item.trim().split_whitespace().next().unwrap_or("");
                    let root = module.split('.').next().unwrap_or(module);
                    if blocked_modules.contains(&root) {
                        return Err(format!("line {line_no}: import of '{root}' is blocked"));
                    }
                }
            } else if let Some(rest) = import_candidate.strip_prefix("from ") {
                if let Some((module, _imports)) = rest.split_once(" import ") {
                    let root = module.trim().split('.').next().unwrap_or(module.trim());
                    if blocked_modules.contains(&root) {
                        return Err(format!("line {line_no}: import from '{root}' is blocked"));
                    }
                }
            }

            if candidate.contains("__import__") {
                return Err(format!("line {line_no}: dynamic import via __import__ is blocked"));
            }
            if candidate.contains("importlib.import_module") {
                return Err(format!("line {line_no}: dynamic import via importlib.import_module is blocked"));
            }
            if candidate.contains("exec(") || candidate == "exec" || candidate.starts_with("exec ") {
                return Err(format!("line {line_no}: exec() is blocked"));
            }
            if candidate.contains("eval(") || candidate == "eval" || candidate.starts_with("eval ") {
                return Err(format!("line {line_no}: eval() is blocked"));
            }
            if candidate.contains("compile(") || candidate == "compile" || candidate.starts_with("compile ") {
                return Err(format!("line {line_no}: compile() is blocked"));
            }

            if let Some(message) = blocked_sys_usage(candidate) {
                return Err(format!("line {line_no}: {message}"));
            }

            if let Some(message) = blocked_pathlib_usage(candidate) {
                return Err(format!("line {line_no}: {message}"));
            }

            if let Some(message) = blocked_open_mode(raw_line) {
                return Err(format!("line {line_no}: {message}"));
            }
        }
    }

    Ok(())
}

fn blocked_sys_usage(line: &str) -> Option<&'static str> {
    let blocked_patterns = [
        "sys.exit",
        "sys.settrace",
        "sys.setprofile",
        "sys.setrecursionlimit",
        "sys.addaudithook",
        "sys.modules",
        "sys.path_hooks",
        "sys.path_importer_cache",
        "sys.meta_path",
        "sys.path =",
    ];

    for pattern in blocked_patterns {
        if line.contains(pattern) {
            return Some("sys usage is restricted to read-only inspection");
        }
    }

    if has_sys_attribute_assignment(line) {
        return Some("sys attribute assignment is blocked");
    }

    None
}

fn has_sys_attribute_assignment(line: &str) -> bool {
    let mut search_start = 0;
    while let Some(index) = find_token(line, "sys.", search_start) {
        let after = &line[index + "sys.".len()..];
        let mut chars = after.chars().peekable();
        let mut saw_identifier = false;

        while let Some(ch) = chars.peek().copied() {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                saw_identifier = true;
                chars.next();
            } else {
                break;
            }
        }

        if !saw_identifier {
            search_start = index + "sys.".len();
            continue;
        }

        while matches!(chars.peek(), Some(ch) if ch.is_ascii_whitespace()) {
            chars.next();
        }

        if matches!(chars.peek(), Some(&'=')) && !matches!(chars.clone().nth(1), Some('=')) {
            return true;
        }

        search_start = index + "sys.".len();
    }

    false
}

fn blocked_pathlib_usage(line: &str) -> Option<&'static str> {
    let blocked_patterns = [
        ".write_text(",
        ".write_bytes(",
        ".touch(",
        ".mkdir(",
        ".rename(",
        ".replace(",
        ".unlink(",
        ".rmdir(",
        ".symlink_to(",
        ".hardlink_to(",
        ".chmod(",
        ".lchmod(",
    ];

    for pattern in blocked_patterns {
        if line.contains(pattern) {
            return Some("pathlib write helpers are blocked; read-only access only");
        }
    }

    None
}

fn blocked_open_mode(line: &str) -> Option<&'static str> {
    let mut search_start = 0;
    while let Some(index) = find_token(line, "open(", search_start) {
        let tail = &line[index + "open(".len()..];
        if let Some(mode) = parse_open_mode(tail) {
            if mode
                .chars()
                .any(|ch| matches!(ch, 'w' | 'a' | 'x' | '+'))
            {
                return Some("file open mode is write-capable; read-only access only");
            }
        } else {
            return Some("open() with a non-literal mode is blocked for safety");
        }
        search_start = index + "open(".len();
    }

    None
}

fn find_token(haystack: &str, needle: &str, start: usize) -> Option<usize> {
    let mut search = start;
    while let Some(index) = haystack[search..].find(needle) {
        let absolute = search + index;
        let is_boundary = haystack[..absolute]
            .chars()
            .next_back()
            .map(|ch| !ch.is_ascii_alphanumeric() && ch != '_')
            .unwrap_or(true);
        if is_boundary {
            return Some(absolute);
        }
        search = absolute + needle.len();
    }
    None
}

fn parse_open_mode(args: &str) -> Option<String> {
    let mut current = String::new();
    let mut args_list = Vec::new();
    let mut depth = 0usize;
    let mut string_quote: Option<char> = None;
    let mut escaped = false;

    for ch in args.chars() {
        if let Some(quote) = string_quote {
            current.push(ch);
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                c if c == quote => string_quote = None,
                _ => {}
            }
            continue;
        }

        match ch {
            '(' | '[' | '{' => {
                depth += 1;
                current.push(ch);
            }
            ')' if depth == 0 => {
                if !current.trim().is_empty() {
                    args_list.push(current.trim().to_string());
                }
                break;
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                args_list.push(current.trim().to_string());
                current.clear();
            }
            '"' | '\'' => {
                string_quote = Some(ch);
                current.push(ch);
            }
            _ => current.push(ch),
        }
    }

    if args_list.is_empty() {
        return None;
    }

    for arg in args_list.iter().skip(1) {
        if let Some(value) = arg.strip_prefix("mode=") {
            return extract_string_literal(value.trim());
        }
    }

    if let Some(second) = args_list.get(1) {
        let second = second.trim();
        if second.contains('=') {
            return Some("r".to_string());
        }
        return extract_string_literal(second);
    }

    Some("r".to_string())
}

fn extract_string_literal(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() < 2 {
        return None;
    }

    let mut chars = trimmed.chars();
    let quote = chars.next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    if !trimmed.ends_with(quote) {
        return None;
    }

    Some(trimmed[1..trimmed.len() - 1].to_string())
}

fn strip_comments_and_strings(code: &str) -> (String, String) {
    let mut no_comments = String::with_capacity(code.len());
    let mut no_strings = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '#' => {
                while let Some(next) = chars.next() {
                    if next == '\n' {
                        no_comments.push('\n');
                        no_strings.push('\n');
                        break;
                    }
                }
            }
            '\'' | '"' => {
                let quote = ch;
                let triple = chars.peek() == Some(&quote) && {
                    let mut clone = chars.clone();
                    clone.next();
                    clone.peek() == Some(&quote)
                };

                no_comments.push(ch);
                no_strings.push(' ');
                if triple {
                    for _ in 0..2 {
                        if let Some(next) = chars.next() {
                            no_comments.push(next);
                            no_strings.push(' ');
                        }
                    }
                }

                let mut escaped = false;
                loop {
                    let Some(next) = chars.next() else { break; };
                    no_comments.push(next);
                    no_strings.push(if next == '\n' { '\n' } else { ' ' });

                    if escaped {
                        escaped = false;
                        continue;
                    }
                    if next == '\\' {
                        escaped = true;
                        continue;
                    }

                    if triple {
                        if next == quote && chars.peek() == Some(&quote) {
                            let mut clone = chars.clone();
                            clone.next();
                            if clone.peek() == Some(&quote) {
                                if let Some(second) = chars.next() {
                                    no_comments.push(second);
                                    no_strings.push(' ');
                                }
                                if let Some(third) = chars.next() {
                                    no_comments.push(third);
                                    no_strings.push(' ');
                                }
                                break;
                            }
                        }
                    } else if next == quote {
                        break;
                    }
                }
            }
            _ => {
                no_comments.push(ch);
                no_strings.push(ch);
            }
        }
    }

    (no_comments, no_strings)
}

#[cfg(test)]
mod tests {
    use super::scan_python_code;

    #[test]
    fn allows_safe_imports() {
        let code = r#"
import json
from math import sqrt
value = sqrt(9)
"#;
        assert!(scan_python_code(code).is_ok());
    }

    #[test]
    fn blocks_dangerous_imports() {
        let code = r#"import os
"#;
        let error = scan_python_code(code).unwrap_err();
        assert!(error.contains("os"));
    }

    #[test]
    fn blocks_exec_bypass() {
        let code = r#"exec("import os")"#;
        let error = scan_python_code(code).unwrap_err();
        assert!(error.contains("exec"));
    }

    #[test]
    fn blocks_write_open_mode() {
        let code = "with open('x.txt', 'w') as f:\n    f.write('nope')";
        let error = scan_python_code(code).unwrap_err();
        assert!(error.contains("write-capable"));
    }

    #[test]
    fn blocks_pathlib_writes() {
        let code = "from pathlib import Path\nPath('x.txt').write_text('hello')";
        let error = scan_python_code(code).unwrap_err();
        assert!(error.contains("pathlib"));
    }
}
