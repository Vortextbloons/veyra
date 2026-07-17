use crate::document_extraction::{
    extract_docx_text, extract_epub_text, extract_pdf_text, extract_pptx_text, extract_xlsx_text,
    EpubSpineMode,
};
use serde::Serialize;

const MAX_EXTRACT_CHARS: usize = 300_000;
const MAX_FILE_BYTES: usize = 30 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileExtractionResult {
    pub text: String,
    pub source_type: String,
    pub char_count: usize,
    pub truncated: bool,
}

#[tauri::command]
pub async fn extract_file_text(
    file_bytes: Vec<u8>,
    mime_type: String,
    file_name: String,
) -> Result<FileExtractionResult, String> {
    if file_bytes.len() > MAX_FILE_BYTES {
        return Err(format!(
            "File exceeds {} MB limit (got {} MB)",
            MAX_FILE_BYTES / (1024 * 1024),
            file_bytes.len() / (1024 * 1024)
        ));
    }

    let ext = file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_lowercase())
        .unwrap_or_default();
    let effective_mime = if mime_type.is_empty() || mime_type == "application/octet-stream" {
        mime_from_extension(&ext)
    } else {
        &mime_type
    };

    let extracted = match effective_mime {
        "application/pdf" => finish_extraction(
            extract_pdf_text(&file_bytes),
            "pdf",
            "PDF text extraction returned no content",
        ),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => {
            finish_extraction(
                extract_docx_text(&file_bytes),
                "docx",
                "DOCX text extraction returned no content",
            )
        }
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => finish_extraction(
            extract_xlsx_text(&file_bytes),
            "xlsx",
            "XLSX contains no data",
        ),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => {
            finish_extraction(
                extract_pptx_text(&file_bytes),
                "pptx",
                "PPTX contains no slides with text",
            )
        }
        "application/epub+zip" => finish_extraction(
            extract_epub_text(&file_bytes, strip_html, EpubSpineMode::Strict),
            "epub",
            "EPUB contains no readable text",
        ),
        mime if mime.starts_with("text/")
            || mime == "application/json"
            || mime == "application/xml" =>
        {
            extract_text_file(&file_bytes)
        }
        _ => Err(format!("Unsupported file type: {effective_mime}")),
    };
    extracted
}

fn mime_from_extension(extension: &str) -> &'static str {
    match extension {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "csv" | "tsv" => "text/csv",
        "json" | "jsonl" => "application/json",
        "xml" | "html" | "htm" => "text/html",
        "md" | "markdown" => "text/markdown",
        "py" | "pyw" => "text/x-python",
        "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs" => "text/javascript",
        "rs" => "text/x-rust",
        "go" => "text/x-go",
        "java" => "text/x-java",
        "c" | "h" => "text/x-c",
        "cpp" | "hpp" | "cc" | "cxx" => "text/x-c++",
        "rb" => "text/x-ruby",
        "php" => "text/x-php",
        "swift" => "text/x-swift",
        "kt" | "kts" => "text/x-kotlin",
        "sql" => "text/x-sql",
        "yaml" | "yml" => "text/x-yaml",
        "toml" => "text/x-toml",
        "sh" | "bash" | "zsh" => "text/x-shellscript",
        "bat" | "cmd" => "text/x-batch",
        "r" => "text/x-r",
        "lua" => "text/x-lua",
        "vim" => "text/x-vim",
        "ex" | "exs" => "text/x-elixir",
        "hs" => "text/x-haskell",
        "scala" => "text/x-scala",
        "dart" => "text/x-dart",
        "vue" => "text/x-vue",
        "svelte" => "text/x-svelte",
        "css" | "scss" | "less" => "text/css",
        "graphql" | "gql" => "text/x-graphql",
        "proto" => "text/x-protobuf",
        "ini" => "text/x-ini",
        "env" => "text/x-env",
        "dockerfile" => "text/x-dockerfile",
        "makefile" => "text/x-makefile",
        "cmake" => "text/x-cmake",
        "gradle" => "text/x-gradle",
        "properties" => "text/x-properties",
        _ => "text/plain",
    }
}

fn extract_text_file(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    let text = String::from_utf8(bytes.to_vec())
        .map_err(|error| format!("Failed to decode file as UTF-8: {error}"))?;
    let truncated = text.len() > MAX_EXTRACT_CHARS;
    Ok(FileExtractionResult {
        text: if truncated {
            truncate_at_boundary(&text, MAX_EXTRACT_CHARS)
        } else {
            text.clone()
        },
        source_type: "text".into(),
        char_count: text.len(),
        truncated,
    })
}

fn finish_extraction(
    extracted: Result<String, String>,
    source_type: &str,
    empty_error: &str,
) -> Result<FileExtractionResult, String> {
    let text = extracted?.trim().to_string();
    if text.is_empty() {
        return Err(empty_error.into());
    }
    let truncated = text.len() > MAX_EXTRACT_CHARS;
    Ok(FileExtractionResult {
        text: if truncated {
            truncate_at_boundary(&text, MAX_EXTRACT_CHARS)
        } else {
            text.clone()
        },
        source_type: source_type.into(),
        char_count: text.len(),
        truncated,
    })
}

fn strip_html(html: &str) -> String {
    let mut text = String::new();
    let mut in_script = false;
    let mut in_style = false;
    let mut reader = quick_xml::Reader::from_str(html);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(ref event))
            | Ok(quick_xml::events::Event::Empty(ref event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_lowercase();
                if tag == "script" {
                    in_script = true;
                } else if tag == "style" {
                    in_style = true;
                } else if matches!(
                    tag.as_str(),
                    "p" | "br" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "tr"
                ) && !text.is_empty()
                    && !text.ends_with('\n')
                {
                    text.push('\n');
                }
            }
            Ok(quick_xml::events::Event::End(ref event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_lowercase();
                if tag == "script" {
                    in_script = false;
                } else if tag == "style" {
                    in_style = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref event)) if !in_script && !in_style => {
                if let Ok(value) = event.decode() {
                    text.push_str(&value);
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            _ => {}
        }
        buffer.clear();
    }
    text
}

fn truncate_at_boundary(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let mut end = max_chars;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    let truncated = &text[..end];
    if let Some(last_newline) = truncated.rfind('\n') {
        format!(
            "{}...\n\n[Truncated — showing {} of {} chars]",
            &truncated[..last_newline],
            end,
            text.len()
        )
    } else {
        format!(
            "{truncated}...\n\n[Truncated — showing {} of {} chars]",
            end,
            text.len()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finalizes_local_results_without_changing_metadata() {
        let result = finish_extraction(Ok("  Veyra marker  ".into()), "docx", "empty").unwrap();
        assert_eq!(result.text, "Veyra marker");
        assert_eq!(result.source_type, "docx");
        assert_eq!(result.char_count, 12);
        assert!(!result.truncated);
    }

    #[test]
    fn preserves_local_empty_content_errors() {
        assert_eq!(
            finish_extraction(Ok(" \n ".into()), "epub", "EPUB contains no readable text")
                .unwrap_err(),
            "EPUB contains no readable text"
        );
    }
}
