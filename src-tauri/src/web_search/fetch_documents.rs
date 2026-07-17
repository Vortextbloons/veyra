use crate::document_extraction::{
    extract_docx_text, extract_epub_text, extract_pdf_text, extract_pptx_text, extract_xlsx_text,
    EpubSpineMode,
};
use crate::web_search::fetch_cache;
use crate::web_search::fetch_html::strip_html_to_text;
use crate::web_search::fetch_types::{FetchedPage, MIN_CONTENT_CHARS};
use crate::web_search::fetch_utils::{
    contains_ole_compound_signature, is_legacy_office_url, is_zip_archive, make_error_page,
    truncate_at_sentence_boundary, url_has_extension,
};

#[derive(Clone, Copy)]
enum DocumentKind {
    Pdf,
    Docx,
    Xlsx,
    Pptx,
    Epub,
}

impl DocumentKind {
    fn source_type(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Xlsx => "xlsx",
            Self::Pptx => "pptx",
            Self::Epub => "epub",
        }
    }

    fn extraction_method(self) -> &'static str {
        match self {
            Self::Pdf => "pdf_extract",
            Self::Docx => "docx_extract",
            Self::Xlsx => "xlsx_extract",
            Self::Pptx => "pptx_extract",
            Self::Epub => "epub_extract",
        }
    }

    fn extract(self, bytes: &[u8]) -> Result<String, String> {
        match self {
            Self::Pdf => extract_pdf_text(bytes),
            Self::Docx => extract_docx_text(bytes),
            Self::Xlsx => extract_xlsx_text(bytes),
            Self::Pptx => extract_pptx_text(bytes),
            Self::Epub => extract_epub_text(bytes, strip_html_to_text, EpubSpineMode::Lenient),
        }
    }
}

pub(crate) fn is_docx_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains(".docx") || lower.contains("officedocument.wordprocessingml")
}

pub(crate) fn is_pptx_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains(".pptx") || lower.contains("officedocument.presentationml")
}

pub(crate) fn is_xlsx_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains(".xlsx") || lower.contains("officedocument.spreadsheetml")
}

pub(crate) fn is_epub_url(url: &str) -> bool {
    url.to_lowercase().contains(".epub")
}

pub(crate) fn is_office_url(url: &str) -> bool {
    is_docx_url(url) || is_pptx_url(url) || is_xlsx_url(url) || is_legacy_office_url(url)
}

fn handle_document(
    kind: DocumentKind,
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    finish_document(kind, url, kind.extract(bytes), max_chars, cache_dir)
}

fn finish_document(
    kind: DocumentKind,
    url: &str,
    extracted: Result<String, String>,
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    let text = match extracted {
        Ok(text) => text,
        Err(error) => return make_error_page(url, max_chars, "extraction", &error, cache_dir),
    };
    let trimmed = text.trim();
    if trimmed.is_empty() && matches!(kind, DocumentKind::Epub) {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "EPUB contains no extractable text content",
            cache_dir,
        );
    }
    if trimmed.len() < MIN_CONTENT_CHARS {
        return make_error_page(
            url,
            max_chars,
            "extraction",
            &format!(
                "{} text extraction returned too little content",
                kind.source_type().to_uppercase()
            ),
            cache_dir,
        );
    }

    let content = truncate_at_sentence_boundary(trimmed, max_chars);
    let entry = fetch_cache::CachedEntry {
        url: url.to_string(),
        fetched_at_unix: fetch_cache::now_unix_static(),
        ttl_secs: 24 * 60 * 60,
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content.clone()),
        error_reason: None,
        max_chars,
    };
    if let Err(error) = fetch_cache::write(url, max_chars, &entry, cache_dir) {
        eprintln!("[web_fetch] cache write failed: {error}");
    }
    FetchedPage {
        url: url.to_string(),
        status: "ok".into(),
        title: Some(url.to_string()),
        content: Some(content),
        error_reason: None,
        source_type: Some(kind.source_type().into()),
        extraction_method: Some(kind.extraction_method().into()),
        via_wayback: None,
        char_count: None,
    }
}

pub(crate) fn handle_pdf(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    handle_document(DocumentKind::Pdf, url, bytes, max_chars, cache_dir)
}

pub(crate) fn handle_docx(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    handle_document(DocumentKind::Docx, url, bytes, max_chars, cache_dir)
}

pub(crate) fn handle_xlsx(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    handle_document(DocumentKind::Xlsx, url, bytes, max_chars, cache_dir)
}

pub(crate) fn handle_pptx(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    handle_document(DocumentKind::Pptx, url, bytes, max_chars, cache_dir)
}

pub(crate) fn handle_epub(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    handle_document(DocumentKind::Epub, url, bytes, max_chars, cache_dir)
}

pub(crate) fn fetch_office_document(
    url: &str,
    bytes: &[u8],
    max_chars: usize,
    cache_dir: &std::path::Path,
) -> FetchedPage {
    if contains_ole_compound_signature(bytes) && !is_zip_archive(bytes) {
        if is_xlsx_url(url) || url_has_extension(url, ".xls") {
            return handle_xlsx(url, bytes, max_chars, cache_dir);
        }
        return make_error_page(
            url,
            max_chars,
            "extraction",
            "Legacy binary Office format (.doc/.ppt) is not supported; try a PDF or DOCX link",
            cache_dir,
        );
    }

    let lower = url.to_lowercase();
    if is_docx_url(url) || is_xlsx_url(url) || is_pptx_url(url) {
        if lower.contains(".docx") {
            return handle_docx(url, bytes, max_chars, cache_dir);
        }
        if lower.contains(".xlsx") {
            return handle_xlsx(url, bytes, max_chars, cache_dir);
        }
        if lower.contains(".pptx") {
            return handle_pptx(url, bytes, max_chars, cache_dir);
        }
    }
    handle_docx(url, bytes, max_chars, cache_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn cache_dir() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "veyra-fetch-documents-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn finalizes_and_caches_web_document_results() {
        let cache_dir = cache_dir();
        let url = "https://example.com/report.docx";
        let text = format!("Veyra marker. {}", "supporting text ".repeat(20));
        let page = finish_document(DocumentKind::Docx, url, Ok(text), 120, &cache_dir);

        assert_eq!(page.status, "ok");
        assert_eq!(page.source_type.as_deref(), Some("docx"));
        assert_eq!(page.extraction_method.as_deref(), Some("docx_extract"));
        assert!(page.content.as_deref().unwrap().len() <= 120);
        let cached = fetch_cache::read(url, 120, &cache_dir).unwrap();
        assert_eq!(cached.content, page.content);
        std::fs::remove_dir_all(cache_dir).unwrap();
    }

    #[test]
    fn preserves_web_empty_content_errors() {
        let cache_dir = cache_dir();
        let epub = finish_document(
            DocumentKind::Epub,
            "https://example.com/book.epub",
            Ok(String::new()),
            1_000,
            &cache_dir,
        );
        assert_eq!(
            epub.error_reason.as_deref(),
            Some("EPUB contains no extractable text content")
        );

        let docx = finish_document(
            DocumentKind::Docx,
            "https://example.com/report.docx",
            Ok(String::new()),
            1_000,
            &cache_dir,
        );
        assert_eq!(
            docx.error_reason.as_deref(),
            Some("DOCX text extraction returned too little content")
        );
        std::fs::remove_dir_all(cache_dir).unwrap();
    }
}
