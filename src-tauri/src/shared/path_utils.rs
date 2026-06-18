use std::path::{Path, PathBuf};

/// Validates a user-chosen export destination before writing.
/// Blocks relative paths, null bytes, missing parents, and sensitive system directories.
pub fn validate_export_file_path(
    target_path: &str,
    allowed_extensions: &[&str],
) -> Result<PathBuf, String> {
    if target_path.contains('\0') {
        return Err("export path is invalid".into());
    }

    let path = PathBuf::from(target_path);
    if !path.is_absolute() {
        return Err("export path must be absolute".into());
    }

    let _file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .ok_or_else(|| "export path must include a valid file name".to_string())?;

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();

    if !allowed_extensions
        .iter()
        .any(|allowed| extension == *allowed)
    {
        return Err(format!(
            "export path must use one of these extensions: {}",
            allowed_extensions.join(", ")
        ));
    }

    let parent = path
        .parent()
        .ok_or_else(|| "export path must include a parent directory".to_string())?;
    if !parent.exists() {
        return Err("export directory does not exist".into());
    }

    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("cannot resolve export directory: {error}"))?;
    if is_blocked_export_directory(&canonical_parent) {
        return Err("export path is not allowed in protected system directories".into());
    }

    // Reject path components that attempt traversal before canonicalization.
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("export path cannot contain parent directory references".into());
        }
    }

    Ok(path)
}

fn is_blocked_export_directory(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_ascii_lowercase();
    const BLOCKED_SEGMENTS: &[&str] = &[
        "\\windows\\system32",
        "\\windows\\syswow64",
        "\\program files\\windows nt",
        "\\program files (x86)\\windows nt",
        "\\windows\\system",
        "\\windows\\winsxs",
    ];

    BLOCKED_SEGMENTS
        .iter()
        .any(|segment| lower.contains(segment))
}
