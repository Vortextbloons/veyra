use crate::web_fetch_cache;
use crate::web_fetch_html::strip_html_to_text;
use crate::web_fetch_types::{FetchedPage, MIN_CONTENT_CHARS};
use crate::web_fetch_utils::{
    contains_ole_compound_signature, is_legacy_office_url, is_zip_archive, make_error_page,
    truncate_at_sentence_boundary, url_has_extension,
};
use std::io::Read as _;

pub(crate) fn is_docx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".docx") || lower.contains("officedocument.wordprocessingml")
}

pub(crate) fn is_pptx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".pptx") || lower.contains("officedocument.presentationml")
}

pub(crate) fn is_xlsx_url(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    lower.contains(".xlsx") || lower.contains("officedocument.spreadsheetml")
}

pub(crate) fn is_epub_url(url_str: &str) -> bool {
    url_str.to_lowercase().contains(".epub")
}

pub(crate) fn is_office_url(url_str: &str) -> bool {
    is_docx_url(url_str)
        || is_pptx_url(url_str)
        || is_xlsx_url(url_str)
        || is_legacy_office_url(url_str)
}

fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| format!("PDF extraction failed: {e}"))
}

pub(crate) fn handle_pdf(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_pdf_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "PDF text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some("pdf".into()),
        extraction_method: Some("pdf_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_docx_text(bytes: &[u8]) -> Result<String, String> {
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
                    if !text.is_empty() && !text.ends_with("\n") {
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
                    if let Ok(s) = e.unescape() {
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

    Ok(text)
}

pub(crate) fn handle_docx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_docx_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "DOCX text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some("docx".into()),
        extraction_method: Some("docx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_pptx_text(bytes: &[u8]) -> Result<String, String> {
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
                            if let Ok(s) = e.unescape() {
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

    Ok(text_parts.join("\n\n"))
}

pub(crate) fn handle_pptx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_pptx_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "PPTX text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some("pptx".into()),
        extraction_method: Some("pptx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

pub(crate) fn handle_xlsx(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_xlsx_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "XLSX text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some("xlsx".into()),
        extraction_method: Some("xlsx_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

fn extract_xlsx_text(bytes: &[u8]) -> Result<String, String> {
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

    Ok(text_parts.join("\n\n"))
}

fn extract_epub_text(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("EPUB zip open failed: {e}"))?;

    // Find and parse the OPF container to get the content file
    let mut opf_path = None;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == "META-INF/container.xml" {
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| format!("EPUB container.xml read failed: {e}"))?;
            // Parse the rootfile path from container.xml
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

    // Read the OPF file to find spine items in order
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
        let mut in_manifest = false;
        let mut buf = Vec::new();
        let mut reader = doc;
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(quick_xml::events::Event::Start(ref e))
                | Ok(quick_xml::events::Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = true;
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
                    }
                }
                Ok(quick_xml::events::Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "manifest" {
                        in_manifest = false;
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(e) => return Err(format!("EPUB OPF parse error: {e}")),
                _ => {}
            }
            buf.clear();
        }

        // Parse spine to get ordered itemrefs
        let doc2 = quick_xml::Reader::from_str(&opf_content);
        let mut buf2 = Vec::new();
        let mut reader2 = doc2;
        loop {
            match reader2.read_event_into(&mut buf2) {
                Ok(quick_xml::events::Event::Start(ref e))
                | Ok(quick_xml::events::Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "itemref" {
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            if key == "idref" {
                                let idref = String::from_utf8_lossy(&attr.value).to_string();
                                if let Some(href) = manifest_items.get(&idref) {
                                    spine_hrefs.push(format!("{opf_dir}{href}"));
                                }
                            }
                        }
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf2.clear();
        }
    }

    // Extract text from each spine item (XHTML content files)
    let mut all_text = String::new();
    for href in &spine_hrefs {
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
            if file.name() == href.as_str() {
                let mut content = String::new();
                file.read_to_string(&mut content)
                    .map_err(|e| format!("EPUB content file read failed: {e}"))?;
                let text = strip_html_to_text(&content);
                if !text.trim().is_empty() {
                    if !all_text.is_empty() {
                        all_text.push_str("\n\n");
                    }
                    all_text.push_str(text.trim());
                }
                break;
            }
        }
    }

    if all_text.trim().is_empty() {
        return Err("EPUB contains no extractable text content".into());
    }

    Ok(all_text)
}

pub(crate) fn handle_epub(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extract_epub_text(body_bytes) {
        Ok(t) => t,
        Err(e) => {
            return make_error_page(url, max_chars, "extraction", &e, cache_dir);
        }
    };
    let trimmed = text.trim();
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "EPUB text extraction returned too little content",
            cache_dir,
        );
    }
    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = web_fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: web_fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(e) = web_fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {e}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some("epub".into()),
        extraction_method: Some("epub_extract".into()),
        via_wayback: None,
        char_count: None,
    }
}

pub(crate) fn fetch_office_document(
    url: &str,
    body_bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    if contains_ole_compound_signature(body_bytes) && !is_zip_archive(body_bytes) {
        if is_xlsx_url(url) || url_has_extension(url, ".xls") {
            return handle_xlsx(url, body_bytes, max_chars, cache_dir);
        }
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "Legacy binary Office format (.doc/.ppt) is not supported; try a PDF or DOCX link",
            cache_dir,
        );
    }

    if is_docx_url(url) || is_xlsx_url(url) || is_pptx_url(url) {
        let lower = url.to_lowercase();
        if lower.contains(".docx") {
            return handle_docx(url, body_bytes, max_chars, cache_dir);
        }
        if lower.contains(".xlsx") {
            return handle_xlsx(url, body_bytes, max_chars, cache_dir);
        }
        if lower.contains(".pptx") {
            return handle_pptx(url, body_bytes, max_chars, cache_dir);
        }
    }
    // Fallback: try DOCX first (modern Office Open XML zip archives).
    handle_docx(url, body_bytes, max_chars, cache_dir)
}
