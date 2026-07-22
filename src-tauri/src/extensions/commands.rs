use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use url::Url;

const MAX_SKILL_FILE_BYTES: u64 = 512 * 1024;
const MAX_SKILL_PACKAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_SKILL_FILES: usize = 200;
const SKILLS_DIR: &str = "extensions/skills";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSnapshot {
    pub snapshot_id: String,
    pub skill_md: String,
    pub content_hash: String,
    pub files: Vec<String>,
    pub veyra_json: Option<String>,
}

fn skill_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?.join(SKILLS_DIR);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn safe_relative(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("skill package contains an unsafe path".into());
    }
    Ok(())
}

fn validate_skill_asset(path: &Path, contents: &[u8]) -> Result<(), String> {
    if path.extension().and_then(|value| value.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("svg")) {
        let svg = std::str::from_utf8(contents).map_err(|_| "SVG assets must be UTF-8 text".to_string())?.to_ascii_lowercase();
        if ["<script", "<foreignobject", "javascript:", "onload=", "onclick=", "onerror="].iter().any(|needle| svg.contains(needle)) {
            return Err("Skill SVG asset contains unsupported active content".into());
        }
    }
    Ok(())
}

fn walk_skill_source(root: &Path, current: &Path, files: &mut Vec<(PathBuf, PathBuf)>, bytes: &mut u64) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() { return Err("skill packages cannot contain symbolic links".into()); }
        let path = entry.path();
        if file_type.is_dir() {
            walk_skill_source(root, &path, files, bytes)?;
            continue;
        }
        if !file_type.is_file() { return Err("skill package contains an unsupported file type".into()); }
        let relative = path.strip_prefix(root).map_err(|_| "skill path escaped its package root".to_string())?.to_path_buf();
        safe_relative(&relative)?;
        let size = entry.metadata().map_err(|error| error.to_string())?.len();
        if size > MAX_SKILL_FILE_BYTES { return Err("a skill file exceeds the 512 KB limit".into()); }
        *bytes = bytes.checked_add(size).ok_or_else(|| "skill package is too large".to_string())?;
        if *bytes > MAX_SKILL_PACKAGE_BYTES { return Err("skill package exceeds the 5 MB limit".into()); }
        validate_skill_asset(&relative, &fs::read(&path).map_err(|error| error.to_string())?)?;
        files.push((path, relative));
        if files.len() > MAX_SKILL_FILES { return Err("skill package contains more than 200 files".into()); }
    }
    Ok(())
}

/// Copies a user-selected directory into Veyra-managed storage after validating every path.
/// Source files are never executed; scripts and binaries remain inert snapshot content.
#[tauri::command]
pub fn snapshot_skill_directory(app: AppHandle, source_path: String) -> Result<SkillSnapshot, String> {
    let source = PathBuf::from(source_path);
    if !source.is_dir() { return Err("select a Skill package folder".into()); }
    let canonical = source.canonicalize().map_err(|error| error.to_string())?;
    let mut files = Vec::new();
    let mut bytes = 0;
    walk_skill_source(&canonical, &canonical, &mut files, &mut bytes)?;
    let skill_entry = files.iter().find(|(_, relative)| relative == Path::new("SKILL.md")).ok_or_else(|| "Skill package must contain SKILL.md at its root".to_string())?;
    let skill_md = fs::read_to_string(&skill_entry.0).map_err(|_| "SKILL.md must be valid UTF-8 text".to_string())?;
    let mut hasher = Sha256::new();
    for (source_file, relative) in &files {
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(source_file).map_err(|error| error.to_string())?);
        hasher.update([0]);
    }
    let content_hash = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    let snapshot_id = format!("skill-{}", &content_hash[..16]);
    let target = skill_root(&app)?.join(&snapshot_id);
    if !target.exists() {
        fs::create_dir_all(&target).map_err(|error| error.to_string())?;
        for (source_file, relative) in &files {
            let destination = target.join(relative);
            if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
            fs::copy(source_file, destination).map_err(|error| error.to_string())?;
        }
    }
    let veyra_json = files.iter().find(|(_, relative)| relative == Path::new("veyra.json")).map(|(path, _)| fs::read_to_string(path).map_err(|_| "veyra.json must be valid UTF-8 text".to_string())).transpose()?;
    Ok(SkillSnapshot { snapshot_id, skill_md, content_hash, files: files.into_iter().map(|(_, relative)| relative.to_string_lossy().into_owned()).collect(), veyra_json })
}

#[tauri::command]
pub fn snapshot_skill_zip(app: AppHandle, source_path: String) -> Result<SkillSnapshot, String> {
    use std::io::Read;
    let file = fs::File::open(&source_path).map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() > MAX_SKILL_PACKAGE_BYTES { return Err("skill archive exceeds the 5 MB limit".into()); }
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "invalid Skill ZIP archive".to_string())?;
    if archive.len() > MAX_SKILL_FILES { return Err("skill archive contains more than 200 files".into()); }
    let mut entries: Vec<(PathBuf, Vec<u8>)> = Vec::new(); let mut total = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = PathBuf::from(entry.name());
        safe_relative(&relative)?;
        if entry.is_dir() { continue; }
        if entry.size() > MAX_SKILL_FILE_BYTES { return Err("a skill file exceeds the 512 KB limit".into()); }
        total = total.checked_add(entry.size()).ok_or_else(|| "skill archive is too large".to_string())?;
        if total > MAX_SKILL_PACKAGE_BYTES { return Err("skill archive exceeds the 5 MB unpacked limit".into()); }
        let mut contents = Vec::with_capacity(entry.size() as usize); entry.read_to_end(&mut contents).map_err(|error| error.to_string())?;
        validate_skill_asset(&relative, &contents)?;
        entries.push((relative, contents));
    }
    let skill_md = entries.iter().find(|(path, _)| path == Path::new("SKILL.md")).ok_or_else(|| "Skill archive must contain SKILL.md at its root".to_string())?.1.clone();
    let skill_md = String::from_utf8(skill_md).map_err(|_| "SKILL.md must be valid UTF-8 text".to_string())?;
    let mut hasher = Sha256::new(); for (path, contents) in &entries { hasher.update(path.to_string_lossy().as_bytes()); hasher.update([0]); hasher.update(contents); hasher.update([0]); }
    let content_hash = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>(); let snapshot_id = format!("skill-{}", &content_hash[..16]); let target = skill_root(&app)?.join(&snapshot_id);
    if !target.exists() { fs::create_dir_all(&target).map_err(|error| error.to_string())?; for (relative, contents) in &entries { let destination = target.join(relative); if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; } fs::write(destination, contents).map_err(|error| error.to_string())?; } }
    let veyra_json = entries.iter().find(|(path, _)| path == Path::new("veyra.json")).map(|(_, contents)| String::from_utf8(contents.clone()).map_err(|_| "veyra.json must be valid UTF-8 text".to_string())).transpose()?;
    Ok(SkillSnapshot { snapshot_id, skill_md, content_hash, files: entries.into_iter().map(|(path, _)| path.to_string_lossy().into_owned()).collect(), veyra_json })
}

fn validate_mcp_endpoint(endpoint: &str) -> Result<(), String> {
    let url = Url::parse(endpoint).map_err(|_| "MCP endpoint must be a valid URL".to_string())?;
    let host = url.host_str().unwrap_or_default();
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !local { return Err("remote MCP endpoints must use HTTPS".into()); }
    if !matches!(url.scheme(), "https" | "http") { return Err("MCP endpoint must use HTTP or HTTPS".into()); }
    Ok(())
}

/// Performs MCP initialization and capability discovery through the official SDK.
/// The connection is intentionally one-shot here; persistent sessions are owned by
/// the host lifecycle state added around configured, enabled servers.
#[tauri::command]
pub async fn discover_streamable_http_mcp(endpoint: String) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::StreamableHttpClientTransport};
    validate_mcp_endpoint(&endpoint)?;
    let transport = StreamableHttpClientTransport::from_uri(endpoint);
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let tools = client.peer().list_tools(Default::default()).await.map_err(|error| format!("MCP tools discovery failed: {error}"))?;
    let resources = client.peer().list_resources(Default::default()).await.ok();
    let prompts = client.peer().list_prompts(Default::default()).await.ok();
    let tools = serde_json::to_value(tools).map_err(|error| error.to_string())?.get("tools").cloned().unwrap_or_default();
    let resources = resources.and_then(|value| serde_json::to_value(value).ok()).and_then(|value| value.get("resources").cloned()).unwrap_or_default();
    let prompts = prompts.and_then(|value| serde_json::to_value(value).ok()).and_then(|value| value.get("prompts").cloned()).unwrap_or_default();
    let result = serde_json::json!({ "tools": tools, "resources": resources, "prompts": prompts });
    let _ = client.close().await;
    Ok(result)
}

/// Starts a configured stdio server through the SDK's child-process transport.
/// Arguments are passed as an array to `Command`; Veyra never invokes a shell.
#[tauri::command]
pub async fn discover_stdio_mcp(executable: String, arguments: Vec<String>, working_directory: Option<String>) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::TokioChildProcess};
    if executable.trim().is_empty() || executable.contains('\0') { return Err("MCP executable is invalid".into()); }
    if arguments.len() > 64 || arguments.iter().any(|argument| argument.len() > 8_192 || argument.contains('\0')) { return Err("MCP arguments are invalid".into()); }
    let mut command = tokio::process::Command::new(&executable);
    command.args(&arguments);
    if let Some(directory) = working_directory.filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(directory);
        if !path.is_dir() { return Err("MCP working directory does not exist".into()); }
        command.current_dir(path);
    }
    let transport = TokioChildProcess::new(command).map_err(|error| format!("MCP server could not start: {error}"))?;
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let tools = client.peer().list_tools(Default::default()).await.map_err(|error| format!("MCP tools discovery failed: {error}"))?;
    let resources = client.peer().list_resources(Default::default()).await.ok();
    let prompts = client.peer().list_prompts(Default::default()).await.ok();
    let tools = serde_json::to_value(tools).map_err(|error| error.to_string())?.get("tools").cloned().unwrap_or_default();
    let resources = resources.and_then(|value| serde_json::to_value(value).ok()).and_then(|value| value.get("resources").cloned()).unwrap_or_default();
    let prompts = prompts.and_then(|value| serde_json::to_value(value).ok()).and_then(|value| value.get("prompts").cloned()).unwrap_or_default();
    let result = serde_json::json!({ "tools": tools, "resources": resources, "prompts": prompts });
    let _ = client.close().await;
    Ok(result)
}

#[tauri::command]
pub async fn call_streamable_http_mcp(endpoint: String, tool_name: String, arguments: serde_json::Map<String, serde_json::Value>, timeout_ms: Option<u64>) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::StreamableHttpClientTransport, model::CallToolRequestParams};
    validate_mcp_endpoint(&endpoint)?;
    if tool_name.trim().is_empty() || tool_name.len() > 256 { return Err("MCP tool name is invalid".into()); }
    let transport = StreamableHttpClientTransport::from_uri(endpoint);
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let request = CallToolRequestParams::new(tool_name).with_arguments(arguments);
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000));
    let result = tokio::time::timeout(timeout, client.peer().call_tool(request)).await.map_err(|_| "MCP tool call timed out".to_string())?.map_err(|error| format!("MCP tool call failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?;
    let _ = client.close().await;
    Ok(value)
}

#[tauri::command]
pub async fn read_streamable_http_mcp_resource(endpoint: String, uri: String) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::StreamableHttpClientTransport, model::ReadResourceRequestParams};
    validate_mcp_endpoint(&endpoint)?;
    if uri.trim().is_empty() || uri.len() > 8_192 { return Err("MCP resource URI is invalid".into()); }
    let transport = StreamableHttpClientTransport::from_uri(endpoint);
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let result = client.peer().read_resource(ReadResourceRequestParams::new(uri)).await.map_err(|error| format!("MCP resource read failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?;
    let _ = client.close().await;
    Ok(value)
}

#[tauri::command]
pub async fn get_streamable_http_mcp_prompt(endpoint: String, name: String, arguments: serde_json::Map<String, serde_json::Value>) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::StreamableHttpClientTransport, model::GetPromptRequestParams};
    validate_mcp_endpoint(&endpoint)?;
    if name.trim().is_empty() || name.len() > 256 { return Err("MCP prompt name is invalid".into()); }
    let transport = StreamableHttpClientTransport::from_uri(endpoint);
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let result = client.peer().get_prompt(GetPromptRequestParams::new(name).with_arguments(arguments)).await.map_err(|error| format!("MCP prompt retrieval failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?;
    let _ = client.close().await;
    Ok(value)
}

#[tauri::command]
pub async fn read_stdio_mcp_resource(executable: String, arguments: Vec<String>, working_directory: Option<String>, uri: String) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::TokioChildProcess, model::ReadResourceRequestParams};
    if executable.trim().is_empty() || uri.trim().is_empty() { return Err("MCP resource configuration is invalid".into()); }
    let mut command = tokio::process::Command::new(executable); command.args(arguments);
    if let Some(directory) = working_directory.filter(|value| !value.trim().is_empty()) { command.current_dir(directory); }
    let transport = TokioChildProcess::new(command).map_err(|error| format!("MCP server could not start: {error}"))?;
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let result = client.peer().read_resource(ReadResourceRequestParams::new(uri)).await.map_err(|error| format!("MCP resource read failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?; let _ = client.close().await; Ok(value)
}

#[tauri::command]
pub async fn get_stdio_mcp_prompt(executable: String, arguments: Vec<String>, working_directory: Option<String>, name: String, prompt_arguments: serde_json::Map<String, serde_json::Value>) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::TokioChildProcess, model::GetPromptRequestParams};
    if executable.trim().is_empty() || name.trim().is_empty() { return Err("MCP prompt configuration is invalid".into()); }
    let mut command = tokio::process::Command::new(executable); command.args(arguments);
    if let Some(directory) = working_directory.filter(|value| !value.trim().is_empty()) { command.current_dir(directory); }
    let transport = TokioChildProcess::new(command).map_err(|error| format!("MCP server could not start: {error}"))?;
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let result = client.peer().get_prompt(GetPromptRequestParams::new(name).with_arguments(prompt_arguments)).await.map_err(|error| format!("MCP prompt retrieval failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?; let _ = client.close().await; Ok(value)
}

#[tauri::command]
pub async fn call_stdio_mcp(executable: String, arguments: Vec<String>, working_directory: Option<String>, tool_name: String, tool_arguments: serde_json::Map<String, serde_json::Value>, timeout_ms: Option<u64>) -> Result<serde_json::Value, String> {
    use rmcp::{ServiceExt, transport::TokioChildProcess, model::CallToolRequestParams};
    if executable.trim().is_empty() || executable.contains('\0') || tool_name.trim().is_empty() { return Err("MCP call configuration is invalid".into()); }
    let mut command = tokio::process::Command::new(&executable);
    command.args(&arguments);
    if let Some(directory) = working_directory.filter(|value| !value.trim().is_empty()) { command.current_dir(PathBuf::from(directory)); }
    let transport = TokioChildProcess::new(command).map_err(|error| format!("MCP server could not start: {error}"))?;
    let mut client = ().serve(transport).await.map_err(|error| format!("MCP initialization failed: {error}"))?;
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000));
    let result = tokio::time::timeout(timeout, client.peer().call_tool(CallToolRequestParams::new(tool_name).with_arguments(tool_arguments))).await.map_err(|_| "MCP tool call timed out".to_string())?.map_err(|error| format!("MCP tool call failed: {error}"))?;
    let value = serde_json::to_value(result).map_err(|error| error.to_string())?;
    let _ = client.close().await;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_archive_traversal_paths() {
        assert!(safe_relative(Path::new("../SKILL.md")).is_err());
        assert!(safe_relative(Path::new("C:\\outside\\SKILL.md")).is_err());
        assert!(safe_relative(Path::new("workflows/plan.md")).is_ok());
    }
    #[test]
    fn rejects_remote_insecure_endpoints() {
        assert!(validate_mcp_endpoint("http://example.com/mcp").is_err());
        assert!(validate_mcp_endpoint("https://example.com/mcp").is_ok());
        assert!(validate_mcp_endpoint("http://localhost:3000/mcp").is_ok());
    }
    #[test]
    fn rejects_active_svg_assets() {
        assert!(validate_skill_asset(Path::new("assets/icon.svg"), br#"<svg><script>alert(1)</script></svg>"#).is_err());
        assert!(validate_skill_asset(Path::new("assets/icon.svg"), br#"<svg><path d='M0 0'/></svg>"#).is_ok());
    }
}
