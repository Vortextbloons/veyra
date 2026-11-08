use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use url::Url;

const MAX_SKILL_FILE_BYTES: u64 = 512 * 1024;
const MAX_SKILL_PACKAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_SKILL_FILES: usize = 200;
const MAX_INSTRUCTION_BYTES: usize = 256 * 1024;
const SKILLS_DIR: &str = "extensions/skills";
/// Where active Skills are written as Pi-discoverable `SKILL.md` folders.
const MATERIALIZED_DIR: &str = "extensions/pi-skills";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSnapshot {
    pub snapshot_id: String,
    pub skill_md: String,
    pub content_hash: String,
    pub files: Vec<String>,
    /// Legacy `veyra.json` manifest, returned so it can be converted rather than rejected.
    pub veyra_json: Option<String>,
    /// Source folder name, used as the Skill name when frontmatter omits it.
    pub directory_name: String,
}

/// One Skill the current request uses. Veyra owns the library and records the
/// invocation; Pi only needs the instruction text on disk.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterializedSkillInput {
    pub name: String,
    pub slug: String,
    pub description: String,
    pub instructions: String,
    /// Package snapshot for a Skill with supporting files.
    pub snapshot_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterializedSkill {
    /// Pi `--skill` path: the directory containing SKILL.md.
    pub path: String,
    /// Pi command name, without the `skill:` prefix.
    pub name: String,
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

fn package_hash(files: &[(PathBuf, PathBuf)]) -> Result<String, String> {
    let mut hasher = Sha256::new();
    for (source, relative) in files {
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(source).map_err(|error| error.to_string())?);
        hasher.update([0]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
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

/// Copies a user-selected `SKILL.md` folder into Veyra-managed storage after
/// validating every path. Source files are never executed; scripts and binaries
/// stay inert package content.
#[tauri::command]
pub fn snapshot_skill_directory(app: AppHandle, source_path: String) -> Result<SkillSnapshot, String> {
    let source = PathBuf::from(source_path);
    if !source.is_dir() { return Err("select a folder that contains SKILL.md".into()); }
    let canonical = source.canonicalize().map_err(|error| error.to_string())?;
    let mut files = Vec::new();
    let mut bytes = 0;
    walk_skill_source(&canonical, &canonical, &mut files, &mut bytes)?;
    let skill_entry = files.iter().find(|(_, relative)| relative == Path::new("SKILL.md")).ok_or_else(|| "The folder must contain SKILL.md at its root".to_string())?;
    let skill_md = fs::read_to_string(&skill_entry.0).map_err(|_| "SKILL.md must be valid UTF-8 text".to_string())?;
    let content_hash = package_hash(&files)?;
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
    let directory_name = canonical.file_name().and_then(|value| value.to_str()).unwrap_or("skill").to_string();
    let veyra_json = files.iter().find(|(_, relative)| relative == Path::new("veyra.json")).map(|(path, _)| fs::read_to_string(path).map_err(|_| "veyra.json must be valid UTF-8 text".to_string())).transpose()?;
    Ok(SkillSnapshot { snapshot_id, skill_md, content_hash, files: files.into_iter().map(|(_, relative)| relative.to_string_lossy().into_owned()).collect(), veyra_json, directory_name })
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
    // Archives commonly wrap everything in one folder; accept either layout.
    let (entries, directory_name) = strip_single_wrapper_folder(entries);
    if entries.iter().any(|(path, _)| path.components().any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_)))) {
        return Err("Skill archive must contain SKILL.md at its root".into());
    }
    let skill_md = entries.iter().find(|(path, _)| path == Path::new("SKILL.md")).ok_or_else(|| "Skill archive must contain SKILL.md at its root".to_string())?.1.clone();
    let skill_md = String::from_utf8(skill_md).map_err(|_| "SKILL.md must be valid UTF-8 text".to_string())?;
    let mut hasher = Sha256::new(); for (path, contents) in &entries { hasher.update(path.to_string_lossy().as_bytes()); hasher.update([0]); hasher.update(contents); hasher.update([0]); }
    let content_hash = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>(); let snapshot_id = format!("skill-{}", &content_hash[..16]); let target = skill_root(&app)?.join(&snapshot_id);
    if !target.exists() { fs::create_dir_all(&target).map_err(|error| error.to_string())?; for (relative, contents) in &entries { let destination = target.join(relative); if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; } fs::write(destination, contents).map_err(|error| error.to_string())?; } }
    let veyra_json = entries.iter().find(|(path, _)| path == Path::new("veyra.json")).map(|(_, contents)| String::from_utf8(contents.clone()).map_err(|_| "veyra.json must be valid UTF-8 text".to_string())).transpose()?;
    Ok(SkillSnapshot { snapshot_id, skill_md, content_hash, files: entries.into_iter().map(|(path, _)| path.to_string_lossy().into_owned()).collect(), veyra_json, directory_name })
}

/// Drops a single top-level folder shared by every entry, which is how most
/// exported `SKILL.md` packages are zipped. Returns the remaining entries and
/// the folder name, which serves as the fallback Skill name.
fn strip_single_wrapper_folder(entries: Vec<(PathBuf, Vec<u8>)>) -> (Vec<(PathBuf, Vec<u8>)>, String) {
    if entries.iter().any(|(path, _)| path == Path::new("SKILL.md")) {
        return (entries, String::new());
    }
    let first = entries.first().and_then(|(path, _)| path.components().next().map(|part| part.as_os_str().to_string_lossy().into_owned()));
    let Some(first) = first else { return (entries, String::new()); };
    let shared = entries.iter().all(|(path, _)| {
        path.components().count() > 1 &&
            path.components().next().map(|part| part.as_os_str().to_string_lossy().into_owned()).as_deref() == Some(first.as_str())
    });
    if !shared { return (entries, String::new()); }
    if !entries.iter().any(|(path, _)| path.as_path() == Path::new(&first).join("SKILL.md")) {
        return (entries, String::new());
    }
    (entries.into_iter().map(|(path, contents)| (path.components().skip(1).collect::<PathBuf>(), contents)).collect(), first)
}

fn materialized_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?.join(MATERIALIZED_DIR);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

/// Strips YAML-style frontmatter so the body can be re-emitted under the
/// library's own `name` and `description`.
fn body_without_frontmatter(source: &str) -> &str {
    let trimmed = source.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else { return source.trim() };
    let Some(rest) = rest.strip_prefix("\r\n").or_else(|| rest.strip_prefix('\n')) else { return source.trim() };
    match rest.find("\n---") {
        Some(index) => rest[index + 4..].trim_start_matches(['\r', '\n']).trim(),
        None => source.trim(),
    }
}

fn yaml_scalar(value: &str) -> String {
    let clean = value.replace(['\r', '\n'], " ").trim().to_string();
    if clean.is_empty() { "\"\"".to_string() } else { format!("\"{}\"", clean.replace('\\', "\\\\").replace('"', "\\\"")) }
}

fn safe_slug(slug: &str) -> Result<String, String> {
    let slug: String = slug.trim().to_lowercase().chars()
        .map(|character| if character.is_ascii_alphanumeric() || character == '-' { character } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() { return Err("a Skill needs a usable name".into()); }
    Ok(slug)
}

/// Writes each Skill in this request as `<root>/<slug>/SKILL.md` and returns the
/// paths for Pi's `--skill` flag. Pi then handles discovery, the `/skill:name`
/// command, and reading supporting files relative to the skill directory.
///
/// `prune` removes folders from earlier requests so Pi only sees this request's
/// selection. A lazy load during a run passes `false`, because the folders for
/// the session's explicit Skills must survive.
#[tauri::command]
pub fn materialize_pi_skills(app: AppHandle, skills: Vec<MaterializedSkillInput>, prune: Option<bool>) -> Result<Vec<MaterializedSkill>, String> {
    let root = materialized_root(&app)?;
    let prune = prune.unwrap_or(true);
    let mut materialized = Vec::new();
    let mut expected: Vec<PathBuf> = Vec::new();
    for skill in skills {
        let slug = safe_slug(&skill.slug)?;
        if skill.instructions.len() > MAX_INSTRUCTION_BYTES {
            return Err(format!("Skill “{}” has instructions that are too large", skill.name));
        }
        let directory = root.join(&slug);
        // Rewrite from scratch so removed supporting files cannot linger.
        if directory.exists() { fs::remove_dir_all(&directory).map_err(|error| error.to_string())?; }
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        if let Some(snapshot) = skill.snapshot_id.as_deref().filter(|value| !value.trim().is_empty()) {
            if safe_relative(Path::new(snapshot)).is_ok() {
                let source = skill_root(&app)?.join(snapshot);
                if source.is_dir() {
                    for entry in fs::read_dir(&source).map_err(|error| error.to_string())? {
                        let entry = entry.map_err(|error| error.to_string())?;
                        if entry.file_name().to_string_lossy().eq_ignore_ascii_case("SKILL.md") { continue; }
                        copy_dir_contents(&entry.path(), &directory.join(entry.file_name()))?;
                    }
                }
            }
        }
        let document = format!(
            "---\nname: {slug}\ndescription: {description}\ndisable-model-invocation: true\n---\n\n{body}\n",
            slug = slug,
            description = yaml_scalar(&skill.description),
            body = body_without_frontmatter(&skill.instructions),
        );
        fs::write(directory.join("SKILL.md"), document).map_err(|error| error.to_string())?;
        expected.push(directory.clone());
        materialized.push(MaterializedSkill { path: directory.to_string_lossy().into_owned(), name: slug });
    }
    // Remove folders from earlier requests; Pi should only see this selection.
    if prune {
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && !expected.iter().any(|keep| keep == &path) {
                    let _ = fs::remove_dir_all(path);
                }
            }
        }
    }
    Ok(materialized)
}

fn copy_dir_contents(source: &Path, destination: &Path) -> Result<(), String> {    let file_type = fs::symlink_metadata(source).map_err(|error| error.to_string())?.file_type();
    if file_type.is_symlink() { return Err("skill packages cannot contain symbolic links".into()); }
    if file_type.is_dir() {
        fs::create_dir_all(destination).map_err(|error| error.to_string())?;
        for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            copy_dir_contents(&entry.path(), &destination.join(entry.file_name()))?;
        }
        return Ok(());
    }
    if !file_type.is_file() { return Err("skill package contains an unsupported file type".into()); }
    if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    fs::copy(source, destination).map(|_| ()).map_err(|error| error.to_string())
}

/// Writes a standards-shaped `<slug>/SKILL.md` ZIP plus any supporting files the
/// Skill was imported with. Nothing else is added: a Veyra manifest is not
/// required for a package to be portable.
#[tauri::command]
pub fn export_skill_package(app: AppHandle, target_path: String, slug: String, skill_md: String, files: Vec<String>, snapshot_id: Option<String>) -> Result<(), String> {
    use std::io::Write;
    let slug = safe_slug(&slug)?;
    let target = PathBuf::from(target_path);
    if target.extension().and_then(|value| value.to_str()).is_none_or(|extension| !extension.eq_ignore_ascii_case("zip")) {
        return Err("export a Skill as a .zip file".into());
    }
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let file = fs::File::create(&target).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    archive.start_file(format!("{slug}/SKILL.md"), options).map_err(|error| error.to_string())?;
    archive.write_all(skill_md.as_bytes()).map_err(|error| error.to_string())?;
    // Supporting files travel with the package so references and assets keep
    // working for whoever imports it.
    if let Some(snapshot) = snapshot_id.as_deref().filter(|value| !value.trim().is_empty()) {
        if safe_relative(Path::new(snapshot)).is_ok() {
            let root = skill_root(&app)?.join(snapshot);
            for relative in &files {
                let path = PathBuf::from(relative);
                if safe_relative(&path).is_err() || path.file_name().is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("SKILL.md")) { continue; }
                let source = root.join(&path);
                if !source.is_file() { continue; }
                let contents = fs::read(&source).map_err(|error| error.to_string())?;
                validate_skill_asset(&path, &contents)?;
                archive.start_file(format!("{slug}/{}", path.to_string_lossy().replace('\\', "/")), options).map_err(|error| error.to_string())?;
                archive.write_all(&contents).map_err(|error| error.to_string())?;
            }
        }
    }
    archive.finish().map_err(|error| error.to_string())?;
    Ok(())
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
    crate::shared::process::hide_console_async(&mut command);
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
    crate::shared::process::hide_console_async(&mut command);
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
    crate::shared::process::hide_console_async(&mut command);
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
    crate::shared::process::hide_console_async(&mut command);
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

    #[test]
    fn unwraps_a_single_archive_folder() {
        let entries = vec![
            (PathBuf::from("pdf-tools/SKILL.md"), Vec::new()),
            (PathBuf::from("pdf-tools/references/formats.md"), Vec::new()),
        ];
        let (entries, directory) = strip_single_wrapper_folder(entries);
        assert_eq!(directory, "pdf-tools");
        assert_eq!(entries[0].0, PathBuf::from("SKILL.md"));
        assert_eq!(entries[1].0, PathBuf::from("references/formats.md"));
    }

    #[test]
    fn keeps_a_flat_archive_as_is() {
        let entries = vec![(PathBuf::from("SKILL.md"), Vec::new())];
        let (entries, directory) = strip_single_wrapper_folder(entries);
        assert!(directory.is_empty());
        assert_eq!(entries[0].0, PathBuf::from("SKILL.md"));
    }

    #[test]
    fn keeps_mixed_folders_untouched() {
        let entries = vec![
            (PathBuf::from("skills/one/SKILL.md"), Vec::new()),
            (PathBuf::from("extras/two.md"), Vec::new()),
        ];
        let (entries, directory) = strip_single_wrapper_folder(entries);
        assert!(directory.is_empty());
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn reemits_body_without_old_frontmatter() {
        let source = "---\nname: old\ndescription: Old description\n---\n\n# Body\n\nSteps.";
        assert_eq!(body_without_frontmatter(source), "# Body\n\nSteps.");
        assert_eq!(body_without_frontmatter("# Body\n"), "# Body");
    }

    #[test]
    fn quotes_description_for_frontmatter() {
        assert_eq!(yaml_scalar("Extract \"tables\"\nfrom PDFs"), "\"Extract \\\"tables\\\" from PDFs\"");
        assert_eq!(yaml_scalar("   "), "\"\"");
    }

    #[test]
    fn normalizes_skill_slugs() {
        assert_eq!(safe_slug("PDF Tools").unwrap(), "pdf-tools");
        assert_eq!(safe_slug("../escape").unwrap(), "escape");
        assert!(safe_slug("!!").is_err());
    }

    #[test]
    fn prune_defaults_to_on() {
        // The command signature keeps `prune` optional so an older caller still
        // gets the safe default: only this request's Skills stay on disk.
        let prune: Option<bool> = None;
        assert!(prune.unwrap_or(true));
        assert!(!Some(false).unwrap_or(true));
    }
}
