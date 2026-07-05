use std::path::PathBuf;
use std::process::{Command, Stdio};

const PYTHON_PROBE_SNIPPET: &str = "import sys; print(sys.version.split()[0])";

pub(crate) struct PythonCommandSpec {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
    pub(crate) source: String,
    pub(crate) display_path: String,
}

pub(crate) struct PythonDetectedCandidate {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
    pub(crate) source: String,
    pub(crate) display_path: String,
    pub(crate) version: String,
}

pub(crate) fn resolve_python(
    preferred: Option<&str>,
    exact_only: bool,
) -> Option<PythonDetectedCandidate> {
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
            program: if cfg!(windows) {
                "py".to_string()
            } else {
                trimmed.to_string()
            },
            args: vec!["-3".to_string()],
            source: "custom path".to_string(),
            display_path: if cfg!(windows) {
                "py -3".to_string()
            } else {
                trimmed.to_string()
            },
        });
    }

    if trimmed.eq_ignore_ascii_case("python") || trimmed.eq_ignore_ascii_case("python.exe") {
        return Some(PythonCommandSpec {
            program: if cfg!(windows) {
                "python".to_string()
            } else {
                trimmed.to_string()
            },
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

    candidates.extend(
        known_python_install_paths()
            .into_iter()
            .map(|path| PythonCommandSpec {
                program: path.to_string_lossy().to_string(),
                args: Vec::new(),
                source: "known path".to_string(),
                display_path: path.to_string_lossy().to_string(),
            }),
    );

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
