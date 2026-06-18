// ── Character IO Rust helpers ───────────────────────────────────────────────
//
// Provides file I/O for character export/import. The dialog plugin gives us
// the target/source path; these commands read or write the file content.

use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const MAX_TEXT_FILE_BYTES: usize = 20 * 1024 * 1024;
const MAX_BINARY_FILE_BYTES: usize = 25 * 1024 * 1024;
const MAX_AVATAR_BYTES: usize = 4 * 1024 * 1024;
const CHARACTER_AVATAR_DIR: &str = "character-avatars";

fn avatar_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(CHARACTER_AVATAR_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn resolve_avatar_path(
    app: &AppHandle,
    avatar_path: &str,
    must_exist: bool,
) -> Result<PathBuf, String> {
    if avatar_path.is_empty()
        || avatar_path.contains("..")
        || avatar_path.starts_with('/')
        || avatar_path.starts_with('\\')
    {
        return Err("avatar path is outside the avatars directory".into());
    }

    let dir = avatar_dir(app)?;
    let base = dir.canonicalize().map_err(map_io_error)?;
    let candidate = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(avatar_path);

    let resolved = if must_exist {
        candidate.canonicalize().map_err(map_io_error)?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| "invalid avatar path".to_string())?;
        let parent = parent.canonicalize().map_err(map_io_error)?;
        let file_name = candidate
            .file_name()
            .ok_or_else(|| "invalid avatar path".to_string())?;
        parent.join(file_name)
    };

    if !resolved.starts_with(&base) {
        return Err("avatar path is outside the avatars directory".into());
    }
    Ok(resolved)
}

fn map_io_error(error: std::io::Error) -> String {
    error.to_string()
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(map_io_error)?;
    if metadata.len() > MAX_TEXT_FILE_BYTES as u64 {
        return Err(format!(
            "file is too large ({} MB) for character import",
            MAX_TEXT_FILE_BYTES / (1024 * 1024)
        ));
    }
    fs::read_to_string(&path).map_err(map_io_error)
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(&path).map_err(map_io_error)?;
    if metadata.len() > MAX_BINARY_FILE_BYTES as u64 {
        return Err(format!(
            "file is too large ({} MB) for character import",
            MAX_BINARY_FILE_BYTES / (1024 * 1024)
        ));
    }
    fs::read(&path).map_err(map_io_error)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if contents.len() > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "content is too large ({} MB) to write",
            MAX_TEXT_FILE_BYTES / (1024 * 1024)
        ));
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(map_io_error)?;
    }
    fs::write(&path, contents).map_err(map_io_error)
}

#[tauri::command]
pub fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    if contents.len() > MAX_BINARY_FILE_BYTES {
        return Err(format!(
            "content is too large ({} MB) to write",
            MAX_BINARY_FILE_BYTES / (1024 * 1024)
        ));
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(map_io_error)?;
    }
    fs::write(&path, contents).map_err(map_io_error)
}

#[tauri::command]
pub fn export_character_card(
    app: AppHandle,
    character_id: String,
    target_path: String,
    format: String,
) -> Result<(), String> {
    use crate::characters::db::{self as character_db, CharacterDbState};

    // Fetch the character row.
    let character = app
        .state::<CharacterDbState>()
        .with_connection(|conn| character_db::get_character(conn, character_id))?;
    let record = serde_json::to_value(&character).map_err(|e| e.to_string())?;

    match format.as_str() {
        "veyra" | "chara_card_v3" => {
            let text = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
            write_text_file(target_path, text)
        }
        "chara_card_v3_png" => {
            Err("PNG export is performed by the front-end. Use write_binary_file.".into())
        }
        other => Err(format!("unsupported format: {}", other)),
    }
}

#[tauri::command]
pub fn save_character_avatar(
    app: AppHandle,
    character_id: String,
    contents: Vec<u8>,
) -> Result<String, String> {
    if contents.is_empty() {
        return Err("avatar is empty".into());
    }
    if contents.len() > MAX_AVATAR_BYTES {
        return Err(format!(
            "avatar is too large (max {} MB)",
            MAX_AVATAR_BYTES / (1024 * 1024)
        ));
    }
    let ext = detect_image_extension(&contents)
        .ok_or_else(|| "unsupported image format; use PNG, JPEG, GIF, or WebP".to_string())?;
    let dir = avatar_dir(&app)?;
    let file_name = sanitize_avatar_name(&character_id, ext);
    let path = dir.join(&file_name);
    fs::write(&path, &contents).map_err(map_io_error)?;
    Ok(format!("character-avatars/{}", file_name))
}

#[tauri::command]
pub fn delete_character_avatar(app: AppHandle, avatar_path: String) -> Result<(), String> {
    if avatar_path.is_empty() {
        return Ok(());
    }
    let candidate = resolve_avatar_path(&app, &avatar_path, false)?;
    if candidate.exists() {
        fs::remove_file(&candidate).map_err(map_io_error)?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_character_avatar(app: AppHandle, avatar_path: String) -> Result<Vec<u8>, String> {
    if avatar_path.is_empty() {
        return Err("avatar path is empty".into());
    }
    let candidate = resolve_avatar_path(&app, &avatar_path, true)?;
    let metadata = fs::metadata(&candidate).map_err(map_io_error)?;
    if metadata.len() > MAX_AVATAR_BYTES as u64 {
        return Err("avatar is too large".into());
    }
    fs::read(&candidate).map_err(map_io_error)
}

fn detect_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 12 {
        return None;
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    // JPEG: FF D8 FF
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    // GIF: GIF87a or GIF89a
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    // WebP: RIFF....WEBP
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    None
}

fn sanitize_avatar_name(character_id: &str, ext: &str) -> String {
    let safe_id: String = character_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(80)
        .collect();
    let id = if safe_id.is_empty() {
        "character".to_string()
    } else {
        safe_id
    };
    format!("{}.{}", id, ext)
}
