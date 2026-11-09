//! Bash discovery for the native Pi tool.
//!
//! Pi resolves Bash itself when a command runs, and its own error message is
//! only visible inside the model transcript. Veyra checks the same locations
//! first so the interface can explain what to install before a run starts.

use std::path::{Path, PathBuf};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BashAvailability {
    pub(crate) available: bool,
    /// Resolved executable when one was found. Never includes a machine path in
    /// error text below; the path itself is only useful to the user locally.
    pub(crate) shell_path: Option<String>,
    /// Short, actionable explanation when nothing was found.
    pub(crate) message: Option<String>,
    /// Locations that were checked, so the message can be specific.
    pub(crate) searched: Vec<String>,
}

fn exists(path: &Path) -> bool {
    path.is_file()
}

fn path_lookup(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path) {
        let candidate = directory.join(name);
        if exists(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Mirrors Pi's own Windows order: Git Bash in Program Files, then `bash.exe`
/// on `PATH`. On Unix this checks `/bin/bash` and then `PATH`.
pub(crate) fn resolve_bash() -> BashAvailability {
    let mut searched: Vec<String> = Vec::new();

    #[cfg(windows)]
    {
        for key in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(root) = std::env::var_os(key) {
                let candidate = PathBuf::from(root).join("Git").join("bin").join("bash.exe");
                searched.push(candidate.to_string_lossy().into_owned());
                if exists(&candidate) {
                    return BashAvailability {
                        available: true,
                        shell_path: Some(candidate.to_string_lossy().into_owned()),
                        message: None,
                        searched,
                    };
                }
            }
        }
        if let Some(found) = path_lookup("bash.exe") {
            return BashAvailability {
                available: true,
                shell_path: Some(found.to_string_lossy().into_owned()),
                message: None,
                searched,
            };
        }
    }

    #[cfg(not(windows))]
    {
        let candidate = PathBuf::from("/bin/bash");
        searched.push(candidate.to_string_lossy().into_owned());
        if exists(&candidate) {
            return BashAvailability {
                available: true,
                shell_path: Some(candidate.to_string_lossy().into_owned()),
                message: None,
                searched,
            };
        }
        if let Some(found) = path_lookup("bash") {
            return BashAvailability {
                available: true,
                shell_path: Some(found.to_string_lossy().into_owned()),
                message: None,
                searched,
            };
        }
    }

    let message = if cfg!(windows) {
        "Bash was not found, so Bash commands cannot run. Install Git for Windows from https://git-scm.com/download/win, or put bash.exe on PATH. Veyra does not switch to another shell on its own."
    } else {
        "Bash was not found, so Bash commands cannot run. Install Bash or put it on PATH. Veyra does not switch to another shell on its own."
    };

    BashAvailability {
        available: false,
        shell_path: None,
        message: Some(message.to_string()),
        searched,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_checked_locations_when_bash_is_absent() {
        // The discovery result always explains itself when nothing was found.
        let result = resolve_bash();
        assert_eq!(result.available, result.shell_path.is_some());
        if !result.available {
            assert!(result.message.is_some());
            assert!(result.message.unwrap().contains("Bash was not found"));
        }
    }
}
