use rusqlite::{params_from_iter, types::Value, Connection};

use crate::shared::db_utils::parse_json_array;

use super::claims::list_claims_for_run;
use super::contradictions::list_contradictions_for_run;
use super::evidence::list_evidence_for_run;
use super::runs::get_run;
use super::sources::list_sources_for_run;
use super::steps::list_steps_for_run;
use super::types::{
    generate_id, CreateResearchReportInput, ResearchReportRow, ResearchRunWithRelations,
    UpdateResearchReportInput,
};

const REPORT_SELECT_COLS: &str = "id, run_id, title, content_markdown, citation_map, source_ids, evidence_ids, word_count, format, exported_to_document_id, exported_to_memory_ids, created_at, updated_at";

fn row_to_report(row: &rusqlite::Row) -> rusqlite::Result<ResearchReportRow> {
    let citation_map_str: String = row.get("citation_map")?;
    let source_ids_str: String = row.get("source_ids")?;
    let evidence_ids_str: String = row.get("evidence_ids")?;
    let exported_to_memory_ids_str: String = row.get("exported_to_memory_ids")?;
    let citation_map: std::collections::HashMap<String, String> =
        serde_json::from_str(&citation_map_str).unwrap_or_default();
    Ok(ResearchReportRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        title: row.get("title")?,
        content_markdown: row.get("content_markdown")?,
        citation_map,
        source_ids: parse_json_array(&source_ids_str),
        evidence_ids: parse_json_array(&evidence_ids_str),
        word_count: row.get("word_count")?,
        format: row.get("format")?,
        exported_to_document_id: row.get("exported_to_document_id")?,
        exported_to_memory_ids: parse_json_array(&exported_to_memory_ids_str),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create_report(conn: &Connection, input_json: String) -> Result<ResearchReportRow, String> {
    let input: CreateResearchReportInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_report input: {}", e))?;
    if input.title.is_empty() {
        return Err("create_report requires title".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("report"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or_else(|| now.clone());
    let updated_at = input.updated_at.unwrap_or(now);
    let citation_map_json = serde_json::to_string(&input.citation_map)
        .map_err(|e| format!("failed to serialize citation_map: {}", e))?;
    let source_ids_json = serde_json::to_string(&input.source_ids)
        .map_err(|e| format!("failed to serialize source_ids: {}", e))?;
    let evidence_ids_json = serde_json::to_string(&input.evidence_ids)
        .map_err(|e| format!("failed to serialize evidence_ids: {}", e))?;
    let exported_to_memory_ids_json = serde_json::to_string(&Vec::<String>::new())
        .map_err(|e| format!("failed to serialize exported_to_memory_ids: {}", e))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_report transaction failed: {}", e))?;

    tx.execute(
        "DELETE FROM research_reports WHERE run_id = ?1",
        [&input.run_id],
    )
    .map_err(|e| format!("delete existing research_report failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_reports
           (id, run_id, title, content_markdown, citation_map, source_ids, evidence_ids, word_count, format, exported_to_memory_ids, created_at, updated_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            id,
            input.run_id,
            input.title,
            input.content_markdown,
            citation_map_json,
            source_ids_json,
            evidence_ids_json,
            input.word_count,
            input.format,
            exported_to_memory_ids_json,
            created_at,
            updated_at,
        ],
    )
    .map_err(|e| format!("insert research_report failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_reports WHERE id = ?1",
                REPORT_SELECT_COLS
            ),
            [&id],
            row_to_report,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_report transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_report(conn: &Connection, input_json: String) -> Result<ResearchReportRow, String> {
    let input: UpdateResearchReportInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_report input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_report requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.title {
        sets.push(format!("title = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.content_markdown {
        sets.push(format!("content_markdown = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.citation_map {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize citation_map: {}", e))?;
        sets.push(format!("citation_map = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.source_ids {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize source_ids: {}", e))?;
        sets.push(format!("source_ids = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.evidence_ids {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize evidence_ids: {}", e))?;
        sets.push(format!("evidence_ids = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.word_count {
        sets.push(format!("word_count = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.exported_to_document_id {
        sets.push(format!("exported_to_document_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.exported_to_memory_ids {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize exported_to_memory_ids: {}", e))?;
        sets.push(format!("exported_to_memory_ids = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.updated_at {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_report requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_reports SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_report failed: {}", e))?;

    conn.query_row(
        &format!(
            "SELECT {} FROM research_reports WHERE id = ?1",
            REPORT_SELECT_COLS
        ),
        [&input.id],
        row_to_report,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn get_report_for_run(conn: &Connection, run_id: String) -> Result<ResearchReportRow, String> {
    conn.query_row(
            &format!("SELECT {} FROM research_reports WHERE run_id = ?1 ORDER BY updated_at DESC, created_at DESC LIMIT 1", REPORT_SELECT_COLS),
        [&run_id],
        row_to_report,
    )
    .map_err(|e| format!("get_report_for_run failed: {}", e))
}

// ── Relations ──────────────────────────────────────────────────────────────────

pub fn get_run_with_relations(
    conn: &Connection,
    run_id: String,
) -> Result<ResearchRunWithRelations, String> {
    let run = get_run(conn, run_id.clone())?;
    let steps = list_steps_for_run(conn, run_id.clone())?;
    let sources = list_sources_for_run(conn, run_id.clone())?;
    let evidence = list_evidence_for_run(conn, run_id.clone())?;
    let claims = list_claims_for_run(conn, run_id.clone())?;
    let contradictions = list_contradictions_for_run(conn, run_id.clone())?;
    let report = get_report_for_run(conn, run_id).ok();

    Ok(ResearchRunWithRelations {
        run,
        steps,
        sources,
        evidence,
        claims,
        contradictions,
        report,
    })
}
