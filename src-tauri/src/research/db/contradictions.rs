use rusqlite::Connection;

use super::types::{
    generate_id, CreateResearchContradictionInput, ResearchContradictionRow,
};

const CONTRADICTION_SELECT_COLS: &str = "id, run_id, claim_a_id, claim_b_id, claim_a_confidence, claim_b_confidence, reason, resolution, created_at";

fn row_to_contradiction(row: &rusqlite::Row) -> rusqlite::Result<ResearchContradictionRow> {
    Ok(ResearchContradictionRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        claim_a_id: row.get("claim_a_id")?,
        claim_b_id: row.get("claim_b_id")?,
        claim_a_confidence: row.get("claim_a_confidence")?,
        claim_b_confidence: row.get("claim_b_confidence")?,
        reason: row.get("reason")?,
        resolution: row.get("resolution")?,
        created_at: row.get("created_at")?,
    })
}

pub fn create_contradiction(
    conn: &Connection,
    input_json: String,
) -> Result<ResearchContradictionRow, String> {
    let input: CreateResearchContradictionInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_contradiction input: {}", e))?;

    let id = input.id.unwrap_or_else(|| generate_id("contradiction"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_contradiction transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_contradictions
           (id, run_id, claim_a_id, claim_b_id, claim_a_confidence, claim_b_confidence, reason, resolution, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            id,
            input.run_id,
            input.claim_a_id,
            input.claim_b_id,
            input.claim_a_confidence,
            input.claim_b_confidence,
            input.reason,
            input.resolution,
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_contradiction failed: {}", e))?;

    let created = tx
        .query_row(
            &format!(
                "SELECT {} FROM research_contradictions WHERE id = ?1",
                CONTRADICTION_SELECT_COLS
            ),
            [&id],
            row_to_contradiction,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_contradiction transaction failed: {}", e))?;

    Ok(created)
}

pub fn list_contradictions_for_run(
    conn: &Connection,
    run_id: String,
) -> Result<Vec<ResearchContradictionRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_contradictions WHERE run_id = ?1 ORDER BY created_at ASC",
            CONTRADICTION_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_contradictions_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_contradiction)
        .map_err(|e| format!("query list_contradictions_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_contradictions_for_run: {}", e))?);
    }
    Ok(out)
}
