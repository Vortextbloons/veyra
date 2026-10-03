use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    name: String,
    directory: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListing {
    entries: Vec<WorkspaceEntry>,
    content: Option<String>,
    truncated: bool,
}

fn inspect(root: &Path, relative_path: &str) -> Result<WorkspaceListing, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "Project folder is unavailable")?;
    let target = root
        .join(relative_path)
        .canonicalize()
        .map_err(|_| "Path is unavailable")?;
    if !target.starts_with(&root) {
        return Err("Path must stay inside the project".into());
    }
    if target.is_dir() {
        let mut entries = Vec::new();
        let mut truncated = false;
        for item in std::fs::read_dir(target).map_err(|error| error.to_string())? {
            let item = item.map_err(|error| error.to_string())?;
            // Do not traverse links or expose their targets outside this workspace.
            let kind = item.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() {
                continue;
            }
            if entries.len() == 300 {
                truncated = true;
                break;
            }
            entries.push(WorkspaceEntry {
                name: item.file_name().to_string_lossy().into_owned(),
                directory: kind.is_dir(),
            });
        }
        entries.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(WorkspaceListing {
            entries,
            content: None,
            truncated,
        })
    } else {
        if !target.is_file() {
            return Err("Only regular files can be previewed".into());
        }
        use std::io::Read;
        let file = std::fs::File::open(target).map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        file.take(65_537)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        let truncated = bytes.len() > 65_536;
        bytes.truncate(65_536);
        if bytes.contains(&0) {
            return Err("Binary files cannot be previewed".into());
        }
        let content = String::from_utf8_lossy(&bytes).into_owned();
        Ok(WorkspaceListing {
            entries: Vec::new(),
            content: Some(content),
            truncated,
        })
    }
}

#[tauri::command]
pub async fn inspect_agent_workspace(
    project_path: String,
    relative_path: String,
) -> Result<WorkspaceListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = super::sessions::resolve_workspace_path(project_path.trim())?;
        inspect(&root, &relative_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_paths_outside_project() {
        let root = std::env::temp_dir().join(format!("veyra-inspect-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        assert!(inspect(&root, "..")
            .unwrap_err()
            .contains("inside the project"));
        std::fs::write(root.join("source.txt"), "line one\nline two").unwrap();
        assert_eq!(
            inspect(&root, "source.txt").unwrap().content.as_deref(),
            Some("line one\nline two")
        );
        std::fs::write(root.join("binary.bin"), [0, 1, 2]).unwrap();
        assert!(inspect(&root, "binary.bin").unwrap_err().contains("Binary"));
        std::fs::write(root.join("large.txt"), vec![b'x'; 70_000]).unwrap();
        let preview = inspect(&root, "large.txt").unwrap();
        assert!(preview.truncated);
        assert_eq!(preview.content.unwrap().len(), 65_536);
        for name in ["source.txt", "binary.bin", "large.txt"] {
            std::fs::remove_file(root.join(name)).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}
