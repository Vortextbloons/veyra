use std::path::PathBuf;
use std::process::Command;

static RESOURCE_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub(crate) fn initialize(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
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
