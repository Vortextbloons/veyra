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
        .map(|(_, e)| e.to_lowercase())
        .unwrap_or_default();

    let effective_mime = if mime_type.is_empty() || mime_type == "application/octet-stream" {
        match ext.as_str() {
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
            "r" | "R" => "text/x-r",
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
            "makefile" | "Makefile" => "text/x-makefile",
            "cmake" => "text/x-cmake",
            "gradle" => "text/x-gradle",
            "properties" => "text/x-properties",
            _ => "text/plain",
        }
    } else {
        &mime_type
    };

    match effective_mime {
        "application/pdf" => extract_pdf(&file_bytes),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => {
            extract_docx(&file_bytes)
        }
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => {
            extract_xlsx(&file_bytes)
        }
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => {
            extract_pptx(&file_bytes)
        }
        "application/epub+zip" => extract_epub(&file_bytes),
        m if m.starts_with("text/") || m == "application/json" || m == "application/xml" => {
            extract_text_file(&file_bytes)
        }
        _ => Err(format!("Unsupported file type: {effective_mime}")),
    }
}

fn extract_text_file(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    let text = String::from_utf8(bytes.to_vec())
        .map_err(|e| format!("Failed to decode file as UTF-8: {e}"))?;
    let truncated = text.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&text, MAX_EXTRACT_CHARS)
    } else {
        text.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "text".into(),
        char_count: text.len(),
        truncated,
    })
}

fn extract_pdf(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    let text =
        pdf_extract::extract_text_from_mem(bytes).map_err(|e| format!("PDF extraction failed: {e}"))?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("PDF text extraction returned no content".into());
    }
    let truncated = trimmed.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&trimmed, MAX_EXTRACT_CHARS)
    } else {
        trimmed.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "pdf".into(),
        char_count: trimmed.len(),
        truncated,
    })
}

fn extract_docx(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    use std::io::Read;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("DOCX zip open failed: {e}"))?;

    let mut xml_content = String::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("DOCX zip entry read failed: {e}"))?;
        if file.name() == "word/document.xml" {
            file.read_to_string(&mut xml_content)
                .map_err(|e| format!("DOCX document.xml read failed: {e}"))?;
            break;
        }
    }

    if xml_content.is_empty() {
        return Err("DOCX contains no word/document.xml".into());
    }

    let doc = quick_xml::Reader::from_str(&xml_content);
    let mut text = String::new();
    let mut in_text = false;
    let mut buf = Vec::new();

    let mut reader = doc;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e))
            | Ok(quick_xml::events::Event::Empty(ref e)) => {
                if e.name().as_ref() == b"w:p" {
                    if !text.is_empty() && !text.ends_with('\n') {
                        text.push('\n');
                    }
                } else if e.name().as_ref() == b"w:t" {
                    in_text = true;
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if in_text {
                    if let Ok(s) = e.decode() {
                        text.push_str(&s);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("DOCX XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("DOCX text extraction returned no content".into());
    }
    let truncated = trimmed.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&trimmed, MAX_EXTRACT_CHARS)
    } else {
        trimmed.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "docx".into(),
        char_count: trimmed.len(),
        truncated,
    })
}

fn extract_xlsx(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    use calamine::{open_workbook_auto_from_rs, Reader};

    let cursor = std::io::Cursor::new(bytes);
    let mut workbook =
        open_workbook_auto_from_rs(cursor).map_err(|e| format!("XLSX open failed: {e}"))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let mut text_parts: Vec<String> = Vec::new();

    for name in &sheet_names {
        if let Ok(range) = workbook.worksheet_range(name) {
            let mut sheet_text = String::new();
            for row in range.rows() {
                let cells: Vec<String> = row
                    .iter()
                    .map(|cell| match cell {
                        calamine::Data::Empty => String::new(),
                        calamine::Data::String(s) => s.clone(),
                        calamine::Data::Float(f) => {
                            if *f == (*f as i64) as f64 {
                                format!("{}", *f as i64)
                            } else {
                                format!("{f}")
                            }
                        }
                        calamine::Data::Int(i) => format!("{i}"),
                        calamine::Data::Bool(b) => format!("{b}"),
                        calamine::Data::Error(e) => format!("[{e}]"),
                        calamine::Data::DateTime(dt) => format!("{dt}"),
                        _ => String::new(),
                    })
                    .filter(|s| !s.is_empty())
                    .collect();
                if !cells.is_empty() {
                    sheet_text.push_str(&cells.join(" | "));
                    sheet_text.push('\n');
                }
            }
            if !sheet_text.trim().is_empty() {
                text_parts.push(format!("Sheet: {name}\n{sheet_text}"));
            }
        }
    }

    if text_parts.is_empty() {
        return Err("XLSX contains no data".into());
    }

    let combined = text_parts.join("\n\n");
    let trimmed = combined.trim().to_string();
    let truncated = trimmed.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&trimmed, MAX_EXTRACT_CHARS)
    } else {
        trimmed.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "xlsx".into(),
        char_count: trimmed.len(),
        truncated,
    })
}

fn extract_pptx(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    use std::io::Read;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("PPTX zip open failed: {e}"))?;

    let mut text_parts: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("PPTX zip entry read failed: {e}"))?;
        let name = file.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml_content = String::new();
            file.read_to_string(&mut xml_content)
                .map_err(|e| format!("PPTX slide XML read failed: {e}"))?;
            let doc = quick_xml::Reader::from_str(&xml_content);
            let mut slide_text = String::new();
            let mut in_text = false;
            let mut buf = Vec::new();
            let mut reader = doc;
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(quick_xml::events::Event::Start(ref e))
                    | Ok(quick_xml::events::Event::Empty(ref e)) => {
                        if e.name().as_ref() == b"a:t" {
                            in_text = true;
                        }
                    }
                    Ok(quick_xml::events::Event::End(ref e)) => {
                        if e.name().as_ref() == b"a:t" {
                            in_text = false;
                        }
                    }
                    Ok(quick_xml::events::Event::Text(ref e)) => {
                        if in_text {
                            if let Ok(s) = e.decode() {
                                slide_text.push_str(&s);
                            }
                        }
                    }
                    Ok(quick_xml::events::Event::Eof) => break,
                    Err(e) => return Err(format!("PPTX XML parse error: {e}")),
                    _ => {}
                }
                buf.clear();
            }
            if !slide_text.trim().is_empty() {
                text_parts.push(slide_text.trim().to_string());
            }
        }
    }

    if text_parts.is_empty() {
        return Err("PPTX contains no slides with text".into());
    }

    let combined = text_parts.join("\n\n");
    let trimmed = combined.trim().to_string();
    let truncated = trimmed.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&trimmed, MAX_EXTRACT_CHARS)
    } else {
        trimmed.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "pptx".into(),
        char_count: trimmed.len(),
        truncated,
    })
}

fn extract_epub(bytes: &[u8]) -> Result<FileExtractionResult, String> {
    use std::io::Read;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("EPUB zip open failed: {e}"))?;

    let mut opf_path = None;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == "META-INF/container.xml" {
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| format!("EPUB container.xml read failed: {e}"))?;
            if let Some(start) = content.find("full-path=\"") {
                let rest = &content[start + 11..];
                if let Some(end) = rest.find('\"') {
                    opf_path = Some(rest[..end].to_string());
                }
            }
            break;
        }
    }

    let opf_path = opf_path.unwrap_or_else(|| "content.opf".to_string());
    let opf_dir = opf_path
        .rsplit_once('/')
        .map(|(dir, _)| format!("{dir}/"))
        .unwrap_or_default();

    let mut spine_hrefs: Vec<String> = Vec::new();
    let mut opf_content = String::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == opf_path {
            file.read_to_string(&mut opf_content)
                .map_err(|e| format!("EPUB OPF read failed: {e}"))?;
            break;
        }
    }

    if !opf_content.is_empty() {
        let doc = quick_xml::Reader::from_str(&opf_content);
        let mut manifest_items: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let mut spine_itemrefs: Vec<String> = Vec::new();
        let mut in_manifest = false;
        let mut in_spine = false;
        let mut buf = Vec::new();
        let mut reader = doc;
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(quick_xml::events::Event::Start(ref e))
                | Ok(quick_xml::events::Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = true;
                    } else if tag == "spine" {
                        in_spine = true;
                    } else if tag == "item" && in_manifest {
                        let mut id = String::new();
                        let mut href = String::new();
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            if key == "id" {
                                id = val;
                            } else if key == "href" {
                                href = val;
                            }
                        }
                        if !id.is_empty() && !href.is_empty() {
                            manifest_items.insert(id, href);
                        }
                    } else if tag == "itemref" && in_spine {
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            if key == "idref" {
                                spine_itemrefs.push(val);
                            }
                        }
                    }
                }
                Ok(quick_xml::events::Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = false;
                    } else if tag == "spine" {
                        in_spine = false;
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(e) => return Err(format!("EPUB OPF parse error: {e}")),
                _ => {}
            }
            buf.clear();
        }

        for idref in &spine_itemrefs {
            if let Some(href) = manifest_items.get(idref) {
                let full_path = format!("{opf_dir}{href}");
                spine_hrefs.push(full_path);
            }
        }
    }

    let mut all_text = String::new();
    for href in &spine_hrefs {
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
            if file.name() == href {
                let mut html = String::new();
                file.read_to_string(&mut html)
                    .map_err(|e| format!("EPUB content file read failed: {e}"))?;
                let cleaned = strip_html(&html);
                if !cleaned.trim().is_empty() {
                    if !all_text.is_empty() {
                        all_text.push_str("\n\n");
                    }
                    all_text.push_str(cleaned.trim());
                }
                break;
            }
        }
    }

    if all_text.trim().is_empty() {
        return Err("EPUB contains no readable text".into());
    }

    let trimmed = all_text.trim().to_string();
    let truncated = trimmed.len() > MAX_EXTRACT_CHARS;
    let display_text = if truncated {
        truncate_at_boundary(&trimmed, MAX_EXTRACT_CHARS)
    } else {
        trimmed.clone()
    };
    Ok(FileExtractionResult {
        text: display_text,
        source_type: "epub".into(),
        char_count: trimmed.len(),
        truncated,
    })
}

fn strip_html(html: &str) -> String {
    let doc = quick_xml::Reader::from_str(html);
    let mut text = String::new();
    let mut in_script = false;
    let mut in_style = false;
    let mut buf = Vec::new();
    let mut reader = doc;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e))
            | Ok(quick_xml::events::Event::Empty(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                if tag == "script" {
                    in_script = true;
                } else if tag == "style" {
                    in_style = true;
                } else if tag == "p" || tag == "br" || tag == "div" || tag == "h1"
                    || tag == "h2" || tag == "h3" || tag == "h4" || tag == "h5"
                    || tag == "h6" || tag == "li" || tag == "tr"
                {
                    if !text.is_empty() && !text.ends_with('\n') {
                        text.push('\n');
                    }
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                if tag == "script" {
                    in_script = false;
                } else if tag == "style" {
                    in_style = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if !in_script && !in_style {
                    if let Ok(s) = e.decode() {
                        text.push_str(&s);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            _ => {}
        }
        buf.clear();
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
        format!("{}...\n\n[Truncated — showing {} of {} chars]", &truncated[..last_newline], end, text.len())
    } else {
        format!("{truncated}...\n\n[Truncated — showing {} of {} chars]", end, text.len())
    }
}
