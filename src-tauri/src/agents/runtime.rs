use std::path::PathBuf;
use std::process::Command;

static RESOURCE_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub(crate) fn initialize(path: PathBuf) {
    let _ = RESOURCE_DIR.set(node_resource_path(path));
}

// Tauri canonicalizes release paths. Node's CLI entrypoint resolver cannot
// handle Windows verbatim paths (EISDIR while resolving the drive root).
fn node_resource_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let base = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => Some(PathBuf::from(format!("{}:\\", drive as char))),
                Prefix::VerbatimUNC(server, share) => {
                    let mut base = PathBuf::from(r"\\");
                    base.push(server);
                    base.push(share);
                    Some(base)
                }
                _ => None,
            };
            if let Some(mut base) = base {
                base.push(components.as_path());
                return base;
            }
        }
    }
    path
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn normalizes_release_resource_paths_for_node() {
        for (input, expected) in [
            (r"\\?\C:\Users\Test User\Veyra", r"C:\Users\Test User\Veyra"),
            (r"\\?\UNC\server\share\Veyra", r"\\server\share\Veyra"),
            (r"C:\Veyra", r"C:\Veyra"),
        ] {
            assert_eq!(node_resource_path(PathBuf::from(input)), PathBuf::from(expected));
        }
    }
}

pub(crate) fn root() -> Result<PathBuf, String> {
    let base = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
    } else {
        RESOURCE_DIR.get().ok_or("Application resources unavailable")?.clone()
    };
    let root = base.join("pi");
    if !root.join("node_modules/@earendil-works/pi-coding-agent/dist/cli.js").is_file() {
        return Err("Bundled Pi runtime is missing. Rebuild or reinstall Veyra.".into());
    }
    Ok(root)
}

pub(crate) fn node_command() -> Result<Command, String> {
    let root = root()?;
    let mut command = Command::new(root.join(if cfg!(windows) { "node.exe" } else { "node" }));
    command.env("VEYRA_PI_ROOT", root.join("node_modules/@earendil-works/pi-coding-agent"));
    Ok(command)
}

pub(crate) fn pi_command() -> Result<Command, String> {
    let mut command = node_command()?;
    command.arg(root()?.join("node_modules/@earendil-works/pi-coding-agent/dist/cli.js"));
    Ok(command)
}
