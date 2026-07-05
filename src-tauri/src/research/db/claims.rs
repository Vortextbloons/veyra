use rusqlite::{params_from_iter, types::Value, Connection};

use crate::shared::db_utils::parse_json_array;

use super::types::{
    generate_id, CreateResearchClaimInput, ResearchClaimRow, UpdateResearchClaimInput,
};

const CLAIM_SELECT_COLS: &str = "id, run_id, evidence_id, source_id, claim, status, confidence, verified_by, contradicted_by, verification_reason, created_at, disputed_by, needs_semantic_review";

fn row_to_claim(row: &rusqlite::Row) -> rusqlite::Result<ResearchClaimRow> {
    let verified_by_str: String = row.get("verified_by")?;
    let contradicted_by_str: String = row.get("contradicted_by")?;
    let disputed_by_str: String = row.get("disputed_by").unwrap_or_else(|_| "[]".to_string());
    let needs_semantic_review: i64 = row.get("needs_semantic_review").unwrap_or(0);
    Ok(ResearchClaimRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        evidence_id: row.get("evidence_id")?,
        source_id: row.get("source_id")?,
        claim: row.get("claim")?,
        status: row.get("status")?,
        confidence: row.get("confidence")?,
        verified_by: parse_json_array(&verified_by_str),
        contradicted_by: parse_json_array(&contradicted_by_str),
        disputed_by: parse_json_array(&disputed_by_str),
        needs_semantic_review: needs_semantic_review != 0,
        verification_reason: row.get("verification_reason")?,
        created_at: row.get("created_at")?,
    })
}

pub fn create_claim(conn: &Connection, input_json: String) -> Result<ResearchClaimRow, String> {
    let input: CreateResearchClaimInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_claim input: {}", e))?;
    if input.claim.is_empty() {
        return Err("create_claim requires claim".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("claim"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);
    let verified_by_json = serde_json::to_string(&Vec::<String>::new())
        .map_err(|e| format!("failed to serialize verified_by: {}", e))?;
    let contradicted_by_json = serde_json::to_string(&Vec::<String>::new())
        .map_err(|e| format!("failed to serialize contradicted_by: {}", e))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_claim transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_claims
           (id, run_id, evidence_id, source_id, claim, status, confidence, verified_by, contradicted_by, created_at, needs_semantic_review)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            input.run_id,
            input.evidence_id,
            input.source_id,
            input.claim,
            "extracted",
            input.confidence,
            verified_by_json,
            contradicted_by_json,
            created_at,
            if input.needs_semantic_review.unwrap_or(false) { 1 } else { 0 },
        ],
    )
    .map_err(|e| format!("insert research_claim failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_claims WHERE id = ?1",
                CLAIM_SELECT_COLS
            ),
            [&id],
            row_to_claim,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_claim transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_claim(conn: &Connection, input_json: String) -> Result<ResearchClaimRow, String> {
    let input: UpdateResearchClaimInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_claim input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_claim requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.confidence {
        sets.push(format!("confidence = ?{}", params.len() + 1));
        params.push(Value::Real(v));
    }
    if let Some(v) = input.verified_by {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize verified_by: {}", e))?;
        sets.push(format!("verified_by = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.contradicted_by {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize contradicted_by: {}", e))?;
        sets.push(format!("contradicted_by = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.disputed_by {
        let json = serde_json::to_string(&v)
            .map_err(|e| format!("failed to serialize disputed_by: {}", e))?;
        sets.push(format!("disputed_by = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.needs_semantic_review {
        sets.push(format!("needs_semantic_review = ?{}", params.len() + 1));
        params.push(Value::Integer(if v { 1 } else { 0 }));
    }
    if let Some(v) = input.verification_reason {
        sets.push(format!("verification_reason = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_claim requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_claims SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_claim failed: {}", e))?;

    conn.query_row(
        &format!(
            "SELECT {} FROM research_claims WHERE id = ?1",
            CLAIM_SELECT_COLS
        ),
        [&input.id],
        row_to_claim,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_claims_for_run(
    conn: &Connection,
    run_id: String,
) -> Result<Vec<ResearchClaimRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_claims WHERE run_id = ?1 ORDER BY created_at ASC",
            CLAIM_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_claims_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_claim)
        .map_err(|e| format!("query list_claims_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_claims_for_run: {}", e))?);
    }
    Ok(out)
}
