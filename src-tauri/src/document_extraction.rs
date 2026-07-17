use std::collections::HashMap;
use std::io::Read as _;

#[derive(Clone, Copy)]
pub(crate) enum EpubSpineMode {
    Strict,
    Lenient,
}

pub(crate) fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| format!("PDF extraction failed: {e}"))
}

pub(crate) fn extract_docx_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("DOCX zip open failed: {e}"))?;
    let mut xml = String::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("DOCX zip entry read failed: {e}"))?;
        if file.name() == "word/document.xml" {
            file.read_to_string(&mut xml)
                .map_err(|e| format!("DOCX document.xml read failed: {e}"))?;
            break;
        }
    }
    if xml.is_empty() {
        return Err("DOCX contains no word/document.xml".into());
    }

    let mut reader = quick_xml::Reader::from_str(&xml);
    let mut text = String::new();
    let mut in_text = false;
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(ref event))
            | Ok(quick_xml::events::Event::Empty(ref event)) => {
                if event.name().as_ref() == b"w:p" {
                    if !text.is_empty() && !text.ends_with('\n') {
                        text.push('\n');
                    }
                } else if event.name().as_ref() == b"w:t" {
                    in_text = true;
                }
            }
            Ok(quick_xml::events::Event::End(ref event)) => {
                if event.name().as_ref() == b"w:t" {
                    in_text = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref event)) if in_text => {
                if let Ok(value) = event.decode() {
                    text.push_str(&value);
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(error) => return Err(format!("DOCX XML parse error: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(text)
}

pub(crate) fn extract_xlsx_text(bytes: &[u8]) -> Result<String, String> {
    use calamine::{open_workbook_auto_from_rs, Reader};

    let mut workbook = open_workbook_auto_from_rs(std::io::Cursor::new(bytes))
        .map_err(|e| format!("XLSX open failed: {e}"))?;
    let mut text_parts = Vec::new();
    for name in workbook.sheet_names().to_vec() {
        if let Ok(range) = workbook.worksheet_range(&name) {
            let mut sheet_text = String::new();
            for row in range.rows() {
                let cells = row
                    .iter()
                    .map(|cell| match cell {
                        calamine::Data::Empty => String::new(),
                        calamine::Data::String(value) => value.clone(),
                        calamine::Data::Float(value) if *value == (*value as i64) as f64 => {
                            format!("{}", *value as i64)
                        }
                        calamine::Data::Float(value) => format!("{value}"),
                        calamine::Data::Int(value) => format!("{value}"),
                        calamine::Data::Bool(value) => format!("{value}"),
                        calamine::Data::Error(value) => format!("[{value}]"),
                        calamine::Data::DateTime(value) => format!("{value}"),
                        _ => String::new(),
                    })
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>();
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

pub(crate) fn extract_pptx_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("PPTX zip open failed: {e}"))?;
    let mut text_parts = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("PPTX zip entry read failed: {e}"))?;
        let name = file.name().to_string();
        if !name.starts_with("ppt/slides/slide") || !name.ends_with(".xml") {
            continue;
        }
        let mut xml = String::new();
        file.read_to_string(&mut xml)
            .map_err(|e| format!("PPTX slide XML read failed: {e}"))?;
        let mut reader = quick_xml::Reader::from_str(&xml);
        let mut slide_text = String::new();
        let mut in_text = false;
        let mut buffer = Vec::new();
        loop {
            match reader.read_event_into(&mut buffer) {
                Ok(quick_xml::events::Event::Start(ref event))
                | Ok(quick_xml::events::Event::Empty(ref event)) => {
                    if event.name().as_ref() == b"a:t" {
                        in_text = true;
                    }
                }
                Ok(quick_xml::events::Event::End(ref event)) => {
                    if event.name().as_ref() == b"a:t" {
                        in_text = false;
                    }
                }
                Ok(quick_xml::events::Event::Text(ref event)) if in_text => {
                    if let Ok(value) = event.decode() {
                        slide_text.push_str(&value);
                    }
                }
                Ok(quick_xml::events::Event::Eof) => break,
                Err(error) => return Err(format!("PPTX XML parse error: {error}")),
                _ => {}
            }
            buffer.clear();
        }
        if !slide_text.trim().is_empty() {
            text_parts.push(slide_text.trim().to_string());
        }
    }
    if text_parts.is_empty() {
        return Err("PPTX contains no slides with text".into());
    }
    Ok(text_parts.join("\n\n"))
}

pub(crate) fn extract_epub_text(
    bytes: &[u8],
    strip_html: fn(&str) -> String,
    spine_mode: EpubSpineMode,
) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("EPUB zip open failed: {e}"))?;
    let mut opf_path = None;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() != "META-INF/container.xml" {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("EPUB container.xml read failed: {e}"))?;
        if let Some(rest) = content
            .find("full-path=\"")
            .map(|start| &content[start + 11..])
        {
            if let Some(end) = rest.find('"') {
                opf_path = Some(rest[..end].to_string());
            }
        }
        break;
    }

    let opf_path = opf_path.unwrap_or_else(|| "content.opf".to_string());
    let opf_dir = opf_path
        .rsplit_once('/')
        .map(|(directory, _)| format!("{directory}/"))
        .unwrap_or_default();
    let mut opf = String::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
        if file.name() == opf_path {
            file.read_to_string(&mut opf)
                .map_err(|e| format!("EPUB OPF read failed: {e}"))?;
            break;
        }
    }

    let manifest = parse_epub_manifest(&opf)?;
    let spine = parse_epub_spine(&opf, spine_mode)?;
    let hrefs = spine
        .iter()
        .filter_map(|id| manifest.get(id))
        .map(|href| format!("{opf_dir}{href}"))
        .collect::<Vec<_>>();

    let mut text = String::new();
    for href in hrefs {
        for index in 0..archive.len() {
            let mut file = archive
                .by_index(index)
                .map_err(|e| format!("EPUB zip entry read failed: {e}"))?;
            if file.name() != href {
                continue;
            }
            let mut html = String::new();
            file.read_to_string(&mut html)
                .map_err(|e| format!("EPUB content file read failed: {e}"))?;
            let content = strip_html(&html);
            if !content.trim().is_empty() {
                if !text.is_empty() {
                    text.push_str("\n\n");
                }
                text.push_str(content.trim());
            }
            break;
        }
    }
    Ok(text)
}

fn parse_epub_manifest(opf: &str) -> Result<HashMap<String, String>, String> {
    let mut manifest = HashMap::new();
    let mut in_manifest = false;
    let mut reader = quick_xml::Reader::from_str(opf);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(ref event))
            | Ok(quick_xml::events::Event::Empty(ref event)) => {
                let tag = event.name();
                if tag.as_ref() == b"manifest" {
                    in_manifest = true;
                } else if tag.as_ref() == b"item" && in_manifest {
                    let mut id = String::new();
                    let mut href = String::new();
                    for attribute in event.attributes().flatten() {
                        let key = attribute.key;
                        let value = String::from_utf8_lossy(&attribute.value).to_string();
                        if key.as_ref() == b"id" {
                            id = value;
                        } else if key.as_ref() == b"href" {
                            href = value;
                        }
                    }
                    if !id.is_empty() && !href.is_empty() {
                        manifest.insert(id, href);
                    }
                }
            }
            Ok(quick_xml::events::Event::End(ref event))
                if event.name().as_ref() == b"manifest" =>
            {
                in_manifest = false;
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(error) => return Err(format!("EPUB OPF parse error: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(manifest)
}

fn parse_epub_spine(opf: &str, mode: EpubSpineMode) -> Result<Vec<String>, String> {
    let mut spine = Vec::new();
    let mut in_spine = false;
    let mut reader = quick_xml::Reader::from_str(opf);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(ref event))
            | Ok(quick_xml::events::Event::Empty(ref event)) => {
                let tag = event.name();
                if tag.as_ref() == b"spine" {
                    in_spine = true;
                } else if tag.as_ref() == b"itemref"
                    && (in_spine || matches!(mode, EpubSpineMode::Lenient))
                {
                    for attribute in event.attributes().flatten() {
                        if attribute.key.as_ref() == b"idref" {
                            spine.push(String::from_utf8_lossy(&attribute.value).to_string());
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::End(ref event)) if event.name().as_ref() == b"spine" => {
                in_spine = false;
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) if matches!(mode, EpubSpineMode::Lenient) => break,
            Err(error) => return Err(format!("EPUB OPF parse error: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(spine)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};

    fn zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn pdf() -> Vec<u8> {
        let content = "BT /F1 12 Tf 72 720 Td (Veyra PDF marker) Tj ET";
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_string(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
            format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
        ];
        let mut pdf = b"%PDF-1.4\n".to_vec();
        let mut offsets = Vec::new();
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            write!(pdf, "{} 0 obj\n{object}\nendobj\n", index + 1).unwrap();
        }
        let xref = pdf.len();
        write!(pdf, "xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).unwrap();
        for offset in offsets {
            writeln!(pdf, "{offset:010} 00000 n ").unwrap();
        }
        write!(
            pdf,
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .unwrap();
        pdf
    }

    fn xlsx() -> Vec<u8> {
        zip(&[
            (
                "[Content_Types].xml",
                r#"<?xml version="1.0"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>"#,
            ),
            (
                "_rels/.rels",
                r#"<?xml version="1.0"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>"#,
            ),
            (
                "xl/workbook.xml",
                r#"<?xml version="1.0"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
                </workbook>"#,
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<?xml version="1.0"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                </Relationships>"#,
            ),
            (
                "xl/worksheets/sheet1.xml",
                r#"<?xml version="1.0"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData><row r="1">
                    <c r="A1" t="inlineStr"><is><t>Veyra XLSX marker</t></is></c>
                    <c r="B1"><v>42</v></c>
                  </row></sheetData>
                </worksheet>"#,
            ),
        ])
    }

    fn identity_html(html: &str) -> String {
        html.to_string()
    }

    #[test]
    fn extracts_supported_document_formats() {
        assert!(extract_pdf_text(&pdf())
            .unwrap()
            .contains("Veyra PDF marker"));

        let docx = zip(&[(
            "word/document.xml",
            "<w:document><w:body><w:p><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>",
        )]);
        assert_eq!(extract_docx_text(&docx).unwrap(), "First\nSecond");

        let spreadsheet = extract_xlsx_text(&xlsx()).unwrap();
        assert!(spreadsheet.contains("Sheet: Data"));
        assert!(spreadsheet.contains("Veyra XLSX marker | 42"));

        let pptx = zip(&[
            (
                "ppt/slides/slide1.xml",
                "<p:sld><a:t>Slide one</a:t></p:sld>",
            ),
            (
                "ppt/slides/slide2.xml",
                "<p:sld><a:t>Slide two</a:t></p:sld>",
            ),
        ]);
        assert_eq!(extract_pptx_text(&pptx).unwrap(), "Slide one\n\nSlide two");

        let epub = zip(&[
            (
                "META-INF/container.xml",
                r#"<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>"#,
            ),
            (
                "OPS/content.opf",
                r#"<package><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>"#,
            ),
            ("OPS/chapter.xhtml", "<p>Veyra EPUB marker</p>"),
        ]);
        assert_eq!(
            extract_epub_text(&epub, identity_html, EpubSpineMode::Strict).unwrap(),
            "<p>Veyra EPUB marker</p>"
        );
    }

    #[test]
    fn reports_corrupt_archives_without_panicking() {
        let corrupt = b"not a zip archive";
        assert!(extract_docx_text(corrupt)
            .unwrap_err()
            .starts_with("DOCX zip open failed:"));
        assert!(extract_xlsx_text(corrupt)
            .unwrap_err()
            .starts_with("XLSX open failed:"));
        assert!(extract_pptx_text(corrupt)
            .unwrap_err()
            .starts_with("PPTX zip open failed:"));
        assert!(
            extract_epub_text(corrupt, identity_html, EpubSpineMode::Strict)
                .unwrap_err()
                .starts_with("EPUB zip open failed:")
        );
    }
}
