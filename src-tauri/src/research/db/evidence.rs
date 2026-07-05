use rusqlite::Connection;

use crate::shared::db_utils::parse_json_array;

use super::types::{generate_id, CreateResearchEvidenceInput, ResearchEvidenceRow};

const EVIDENCE_SELECT_COLS: &str = "id, run_id, source_id, step_id, type, content, context, page_number, confidence, tags, created_at";

fn row_to_evidence(row: &rusqlite::Row) -> rusqlite::Result<ResearchEvidenceRow> {
    let tags_str: String = row.get("tags")?;
    Ok(ResearchEvidenceRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        source_id: row.get("source_id")?,
        step_id: row.get("step_id")?,
        evidence_type: row.get("type")?,
        content: row.get("content")?,
        context: row.get("context")?,
        page_number: row.get("page_number")?,
        confidence: row.get("confidence")?,
        tags: parse_json_array(&tags_str),
        created_at: row.get("created_at")?,
    })
}

pub fn create_evidence(
    conn: &Connection,
    input_json: String,
) -> Result<ResearchEvidenceRow, String> {
    let input: CreateResearchEvidenceInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_evidence input: {}", e))?;
    if input.content.is_empty() {
        return Err("create_evidence requires content".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("evidence"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);
    let tags_json = serde_json::to_string(&input.tags.unwrap_or_default())
        .map_err(|e| format!("failed to serialize tags: {}", e))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_evidence transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_evidence
           (id, run_id, source_id, step_id, type, content, context, page_number, confidence, tags, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            input.run_id,
            input.source_id,
            input.step_id,
            input.evidence_type,
            input.content,
            input.context,
            input.page_number,
            input.confidence,
            tags_json,
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_evidence failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_evidence WHERE id = ?1",
                EVIDENCE_SELECT_COLS
            ),
            [&id],
            row_to_evidence,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_evidence transaction failed: {}", e))?;

    Ok(created)
}

pub fn list_evidence_for_run(
    conn: &Connection,
    run_id: String,
) -> Result<Vec<ResearchEvidenceRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_evidence WHERE run_id = ?1 ORDER BY created_at ASC",
            EVIDENCE_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_evidence_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_evidence)
        .map_err(|e| format!("query list_evidence_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_evidence_for_run: {}", e))?);
    }
    Ok(out)
}
