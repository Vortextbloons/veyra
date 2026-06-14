// ── Character IO Rust helpers ───────────────────────────────────────────────
//
// Provides file I/O for character export/import. The dialog plugin gives us
// the target/source path; these commands read or write the file content.

use std::fs;
use tauri::AppHandle;
use tauri::Manager;

const MAX_TEXT_FILE_BYTES: usize = 20 * 1024 * 1024;
const MAX_BINARY_FILE_BYTES: usize = 25 * 1024 * 1024;

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
    use crate::character_db::{self, CharacterDbState};

    // Fetch the character row.
    let character = app
        .state::<CharacterDbState>()
        .with_connection(|conn| character_db::get_character(conn, character_id))?;
    let record = serde_json::to_value(&character).map_err(|e| e.to_string())?;

    match format.as_str() {
        "veyra" | "chara_card_v3" => {
            // For Veyra JSON: serialize the full row. For CCv3 JSON: convert.
            let text = if format == "veyra" {
                serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?
            } else {
                // The Rust side has the row; the JSON is small enough that we
                // expect the caller to use the TS-side converter for the
                // field mapping. Fall back to sending the row back as JSON
                // and let the TS side reformat.
                serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?
            };
            write_text_file(target_path, text)
        }
        "chara_card_v3_png" => {
            // PNG export requires an existing source PNG. The TS side embeds
            // the CCv3 chunk and writes via write_binary_file. Here we just
            // return a marker error so the caller knows to do it client-side.
            Err("PNG export is performed by the front-end. Use write_binary_file.".into())
        }
        other => Err(format!("unsupported format: {}", other)),
    }
}
