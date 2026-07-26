use std::path::PathBuf;

pub(crate) fn resolve_workspace_path(project_path: &str) -> Result<PathBuf, String> {
    if project_path.is_empty() {
        return std::env::current_dir()
            .map_err(|error| format!("failed to resolve default workspace: {error}"));
    }

    if project_path.contains('\0') {
        return Err("workspace path is invalid".into());
    }

    let path = PathBuf::from(project_path);
    let canonical = path
        .canonicalize()
        .map_err(|_| "workspace path must be an existing directory".to_string())?;

    if !canonical.is_dir() {
        return Err("workspace path must be an existing directory".into());
    }

    Ok(canonical)
}
