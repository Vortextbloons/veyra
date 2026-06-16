use crate::db_utils::run_db_command;
use crate::document_db::{self, DocumentDbState};
use crate::path_utils::validate_export_file_path;
use tauri::State;

#[tauri::command]
pub async fn create_document(
    input: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::create_document(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn get_document(
    id: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::get_document(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn update_document(
    input: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::update_document(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn list_documents(
    project_id: Option<String>,
    conversation_id: Option<String>,
    state: State<'_, DocumentDbState>,
) -> Result<Vec<document_db::DocumentRow>, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::list_documents(conn, project_id, conversation_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_document(id: String, state: State<'_, DocumentDbState>) -> Result<(), String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::delete_document(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn create_document_version(
    input: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentVersionRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::create_version(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn list_document_versions(
    document_id: String,
    state: State<'_, DocumentDbState>,
) -> Result<Vec<document_db::DocumentVersionRow>, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::list_versions(conn, document_id)
    })
    .await
}

#[tauri::command]
pub async fn get_document_version(
    id: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentVersionRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::get_version(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn restore_document_version(
    version_id: String,
    state: State<'_, DocumentDbState>,
) -> Result<document_db::DocumentRow, String> {
    run_db_command(state.inner(), "document", move |conn| {
        document_db::restore_version(conn, version_id)
    })
    .await
}

#[tauri::command]
pub async fn export_document_markdown(
    document_id: String,
    target_path: String,
    state: State<'_, DocumentDbState>,
) -> Result<(), String> {
    let export_path = validate_export_file_path(&target_path, &["md"])?;
    run_db_command(state.inner(), "document", move |conn| {
        let doc = document_db::get_document(conn, document_id.clone())?;
        std::fs::write(&export_path, &doc.content_markdown)
            .map_err(|e| format!("failed to write markdown file: {}", e))?;
        let now = chrono::Utc::now().to_rfc3339();
        document_db::update_document_exported_at(conn, document_id, now)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn export_document_txt(
    document_id: String,
    target_path: String,
    state: State<'_, DocumentDbState>,
) -> Result<(), String> {
    let export_path = validate_export_file_path(&target_path, &["txt"])?;
    run_db_command(state.inner(), "document", move |conn| {
        let doc = document_db::get_document(conn, document_id.clone())?;
        let plain = strip_markdown(&doc.content_markdown);
        std::fs::write(&export_path, &plain)
            .map_err(|e| format!("failed to write txt file: {}", e))?;
        let now = chrono::Utc::now().to_rfc3339();
        document_db::update_document_exported_at(conn, document_id, now)?;
        Ok(())
    })
    .await
}

fn strip_markdown(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '#' => {
                while chars.peek() == Some(&'#') {
                    chars.next();
                }
                if chars.peek() == Some(&' ') {
                    chars.next();
                }
            }
            '*' | '_' => {
                let marker = ch;
                while chars.peek() == Some(&marker) {
                    chars.next();
                }
            }
            '[' => {
                let mut link_text = String::new();
                let mut found_close = false;
                for inner in chars.by_ref() {
                    if inner == ']' {
                        found_close = true;
                        break;
                    }
                    link_text.push(inner);
                }
                if found_close && chars.peek() == Some(&'(') {
                    chars.next();
                    for inner in chars.by_ref() {
                        if inner == ')' {
                            break;
                        }
                    }
                    result.push_str(&link_text);
                } else {
                    result.push('[');
                    result.push_str(&link_text);
                }
            }
            '!' => {
                if chars.peek() == Some(&'[') {
                    chars.next();
                    for inner in chars.by_ref() {
                        if inner == ']' {
                            break;
                        }
                    }
                    if chars.peek() == Some(&'(') {
                        chars.next();
                        for inner in chars.by_ref() {
                            if inner == ')' {
                                break;
                            }
                        }
                    }
                } else {
                    result.push(ch);
                }
            }
            '`' => {
                let mut backtick_count = 1;
                while chars.peek() == Some(&'`') {
                    backtick_count += 1;
                    chars.next();
                }
                let mut code_content = String::new();
                let mut closed = false;
                if backtick_count == 1 {
                    loop {
                        match chars.next() {
                            Some('`') => {
                                closed = true;
                                break;
                            }
                            Some(c) => code_content.push(c),
                            None => break,
                        }
                    }
                } else {
                    let mut fence_count = 0;
                    loop {
                        match chars.next() {
                            Some('`') => {
                                fence_count += 1;
                                if fence_count >= backtick_count {
                                    closed = true;
                                    break;
                                }
                                code_content.push('`');
                            }
                            Some(c) => {
                                for _ in 0..fence_count {
                                    code_content.push('`');
                                }
                                fence_count = 0;
                                code_content.push(c);
                            }
                            None => break,
                        }
                    }
                }
                result.push_str(&code_content);
                if !closed {
                    for _ in 0..backtick_count {
                        result.push('`');
                    }
                }
            }
            '>' => {
                if chars.peek() == Some(&' ') {
                    chars.next();
                }
            }
            '-' | '+' | '=' => {
                let marker = ch;
                let mut is_hr = true;
                let mut peek_count = 0;
                let saved: Vec<char> = chars.clone().take(10).collect();
                for &c in &saved {
                    if c == marker {
                        peek_count += 1;
                    } else if c == ' ' || c == '\n' {
                        break;
                    } else {
                        is_hr = false;
                        break;
                    }
                }
                if is_hr
                    && peek_count >= 2
                    && (saved.get(peek_count) == Some(&'\n')
                        || saved.get(peek_count).is_none()
                        || saved.get(peek_count) == Some(&' '))
                {
                    for _ in 0..peek_count {
                        chars.next();
                    }
                } else {
                    result.push(ch);
                }
            }
            _ => {
                result.push(ch);
            }
        }
    }

    let mut cleaned = result;
    loop {
        let trimmed = cleaned.replace("\n\n\n", "\n\n");
        if trimmed == cleaned {
            break;
        }
        cleaned = trimmed;
    }
    cleaned.trim().to_string()
}
