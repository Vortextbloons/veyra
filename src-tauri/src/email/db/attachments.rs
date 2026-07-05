use rusqlite::{params, Connection};

use super::gmail::refresh_gmail_token;
use super::helpers::now_ms;
use super::types::FullEmailAttachmentRow;

pub fn list_attachments(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<FullEmailAttachmentRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, thread_id, message_id, provider_attachment_id,
                    filename, mime_type, size, local_path, download_status,
                    extract_status, extracted_text, extracted_text_chars,
                    error, created_at, updated_at
             FROM email_attachments WHERE message_id = ?1 ORDER BY filename",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![message_id], |row| {
            Ok(FullEmailAttachmentRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                thread_id: row.get(2)?,
                message_id: row.get(3)?,
                provider_attachment_id: row.get(4)?,
                filename: row.get(5)?,
                mime_type: row.get(6)?,
                size: row.get(7)?,
                local_path: row.get(8)?,
                download_status: row.get(9)?,
                extract_status: row.get(10)?,
                extracted_text: row.get(11)?,
                extracted_text_chars: row.get(12)?,
                error: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_attachment_row(
    conn: &Connection,
    attachment_id: &str,
) -> Result<FullEmailAttachmentRow, String> {
    conn.query_row(
        "SELECT id, account_id, thread_id, message_id, provider_attachment_id,
                filename, mime_type, size, local_path, download_status,
                extract_status, extracted_text, extracted_text_chars,
                error, created_at, updated_at
         FROM email_attachments WHERE id = ?1",
        params![attachment_id],
        |row| {
            Ok(FullEmailAttachmentRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                thread_id: row.get(2)?,
                message_id: row.get(3)?,
                provider_attachment_id: row.get(4)?,
                filename: row.get(5)?,
                mime_type: row.get(6)?,
                size: row.get(7)?,
                local_path: row.get(8)?,
                download_status: row.get(9)?,
                extract_status: row.get(10)?,
                extracted_text: row.get(11)?,
                extracted_text_chars: row.get(12)?,
                error: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        },
    )
    .map_err(|e| format!("attachment not found: {e}"))
}

pub fn download_attachment(
    conn: &Connection,
    attachment_id: &str,
    app_data_dir: &std::path::Path,
) -> Result<FullEmailAttachmentRow, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.download_status == "downloaded" {
        return Ok(att);
    }
    let provider_att_id = att
        .provider_attachment_id
        .as_ref()
        .ok_or("attachment has no provider_attachment_id")?;
    let now = now_ms();
    conn.execute(
        "UPDATE email_attachments SET download_status = 'downloading', error = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, attachment_id],
    )
    .map_err(|e| e.to_string())?;

    let result = (|| -> Result<FullEmailAttachmentRow, String> {
        let token = refresh_gmail_token(conn, &att.account_id)?;
        let provider_message_id: String = conn
            .query_row(
                "SELECT provider_message_id FROM email_messages WHERE id = ?1",
                params![att.message_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("failed to look up provider_message_id: {e}"))?;
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/attachments/{}",
            provider_message_id, provider_att_id
        );
        let value: serde_json::Value = reqwest::blocking::Client::new()
            .get(&url)
            .bearer_auth(&token)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .map_err(|e| e.to_string())?;
        let data_b64 = value
            .get("data")
            .and_then(serde_json::Value::as_str)
            .ok_or("Gmail attachment response missing data field")?;
        let bytes = base64::Engine::decode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            data_b64,
        )
        .map_err(|e| format!("failed to decode attachment base64: {e}"))?;

        let dir = app_data_dir
            .join("email_attachments")
            .join(&att.account_id)
            .join(&att.message_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create attachment dir {:?}: {e}", dir))?;
        let safe_filename = att
            .filename
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let safe_name = format!("{}_{}", attachment_id, safe_filename);
        let file_path = dir.join(&safe_name);
        std::fs::write(&file_path, &bytes)
            .map_err(|e| format!("failed to write attachment {:?}: {e}", file_path))?;

        let local_path_str = file_path.to_string_lossy().to_string();
        let now = now_ms();
        conn.execute(
            "UPDATE email_attachments SET download_status = 'downloaded', local_path = ?1, error = NULL, updated_at = ?2 WHERE id = ?3",
            params![local_path_str, now, attachment_id],
        )
        .map_err(|e| e.to_string())?;

        get_attachment_row(conn, attachment_id)
    })();

    match result {
        Ok(row) => Ok(row),
        Err(err) => {
            let now = now_ms();
            let _ = conn.execute(
                "UPDATE email_attachments SET download_status = 'failed', error = ?1, updated_at = ?2 WHERE id = ?3",
                params![err, now, attachment_id],
            );
            Err(err)
        }
    }
}

pub fn extract_attachment_text(
    conn: &Connection,
    attachment_id: &str,
) -> Result<FullEmailAttachmentRow, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.extract_status == "extracted" {
        return Ok(att);
    }
    if att.download_status != "downloaded" {
        return Err("attachment must be downloaded before extraction".into());
    }
    let local_path = att.local_path.as_ref().ok_or("attachment has no local_path")?;
    let now = now_ms();
    conn.execute(
        "UPDATE email_attachments SET extract_status = 'extracting', error = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, attachment_id],
    )
    .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(String, i64), String> {
        let mime = att.mime_type.to_lowercase();
        let path = std::path::Path::new(local_path);

        let text = if mime.starts_with("text/")
            || mime == "application/json"
            || mime == "application/xml"
            || mime == "application/javascript"
            || mime == "application/csv"
            || mime.ends_with("+xml")
            || mime.ends_with("+json")
        {
            std::fs::read_to_string(path)
                .map_err(|e| format!("failed to read text file: {e}"))?
        } else if mime == "application/pdf" {
            pdf_extract::extract_text(path)
                .map_err(|e| format!("PDF extraction failed: {e}"))?
        } else if mime
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            || att.filename.to_lowercase().ends_with(".docx")
        {
            extract_docx_text(path)?
        } else if mime
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            || att.filename.to_lowercase().ends_with(".xlsx")
        {
            extract_xlsx_text(path)?
        } else if mime == "text/csv" || att.filename.to_lowercase().ends_with(".csv") {
            std::fs::read_to_string(path)
                .map_err(|e| format!("failed to read CSV file: {e}"))?
        } else {
            return Err(format!("unsupported mime type: {mime}"));
        };

        let trimmed = text.trim().to_string();
        let chars = trimmed.chars().count() as i64;
        Ok((trimmed, chars))
    })();

    match result {
        Ok((text, chars)) => {
            let now = now_ms();
            conn.execute(
                "UPDATE email_attachments SET extract_status = 'extracted', extracted_text = ?1, extracted_text_chars = ?2, error = NULL, updated_at = ?3 WHERE id = ?4",
                params![text, chars, now, attachment_id],
            )
            .map_err(|e| e.to_string())?;
            get_attachment_row(conn, attachment_id)
        }
        Err(err) => {
            let status = if err.starts_with("unsupported mime type") {
                "unsupported"
            } else {
                "failed"
            };
            let now = now_ms();
            let _ = conn.execute(
                "UPDATE email_attachments SET extract_status = ?1, error = ?2, updated_at = ?3 WHERE id = ?4",
                params![status, err, now, attachment_id],
            );
            Err(err)
        }
    }
}

pub fn get_attachment_local_path(
    conn: &Connection,
    attachment_id: &str,
) -> Result<String, String> {
    let att = get_attachment_row(conn, attachment_id)?;
    if att.download_status != "downloaded" {
        return Err("attachment is not downloaded".into());
    }
    att.local_path.ok_or_else(|| "attachment has no local_path".into())
}

fn extract_docx_text(path: &std::path::Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open docx: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("failed to read docx zip: {e}"))?;
    let doc_xml = archive
        .by_name("word/document.xml")
        .map_err(|e| format!("docx missing word/document.xml: {e}"))?;
    let reader = std::io::BufReader::new(doc_xml);
    let mut xml_reader = quick_xml::Reader::from_reader(reader);
    let mut text = String::new();
    let mut buf = Vec::new();
    loop {
        match xml_reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Text(t)) => {
                let decoded = t.unescape().map_err(|e| e.to_string())?;
                text.push_str(&decoded);
                text.push(' ');
            }
            Ok(quick_xml::events::Event::End(ref e))
                if e.name().as_ref() == b"w:p" =>
            {
                text.push('\n');
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("docx xml parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }
    Ok(text)
}

fn extract_xlsx_text(path: &std::path::Path) -> Result<String, String> {
    use calamine::{open_workbook, Reader, Xlsx, Data};
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("failed to open xlsx: {e}"))?;
    let mut text = String::new();
    for sheet_name in workbook.sheet_names().to_owned() {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            text.push_str(&format!("[{sheet_name}]\n"));
            for row in range.rows() {
                for cell in row {
                    match cell {
                        Data::String(s) => text.push_str(s),
                        Data::Float(f) => text.push_str(&f.to_string()),
                        Data::Int(i) => text.push_str(&i.to_string()),
                        Data::Bool(b) => text.push_str(&b.to_string()),
                        Data::Empty => {}
                        _ => {}
                    }
                    text.push('\t');
                }
                text.push('\n');
            }
        }
    }
    Ok(text)
}
