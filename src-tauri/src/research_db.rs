use parking_lot::Mutex;
use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use crate::db_utils::parse_json_array;

pub struct ResearchDb(pub Mutex<Connection>);

// ── Plan types (serialized as JSON in plan_json column) ──────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlan {
    pub id: String,
    pub run_id: String,
    pub steps: Vec<ResearchPlanStep>,
    pub user_approved: bool,
    pub user_edited: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlanStep {
    pub id: String,
    pub plan_id: String,
    pub step_number: i64,
    pub title: String,
    pub description: String,
    pub search_queries: Option<Vec<String>>,
    pub expected_sources: Option<i64>,
    pub depends_on_step_ids: Option<Vec<String>>,
    pub created_at: String,
}

// ── Row types ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchRunRow {
    pub id: String,
    pub project_id: Option<String>,
    pub question: String,
    pub clarified_question: Option<String>,
    pub depth: String,
    pub status: String,
    pub plan: Option<ResearchPlan>,
    pub current_step_id: Option<String>,
    pub progress_percent: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub error: Option<String>,
    pub model_used: Option<String>,
    pub provider_id: Option<String>,
    pub total_tokens_used: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStepRow {
    pub id: String,
    pub run_id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub status: String,
    pub title: String,
    pub detail: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub tokens_used: Option<i64>,
    pub model_used: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceRow {
    pub id: String,
    pub run_id: String,
    pub step_id: Option<String>,
    pub url: String,
    pub title: String,
    pub snippet: Option<String>,
    pub full_text: Option<String>,
    pub content_type: Option<String>,
    pub status: String,
    pub source_type: String,
    pub engine: Option<String>,
    pub score: Option<f64>,
    pub rank: Option<i64>,
    pub fetched_at: Option<String>,
    pub read_at: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchEvidenceRow {
    pub id: String,
    pub run_id: String,
    pub source_id: String,
    pub step_id: Option<String>,
    #[serde(rename = "type")]
    pub evidence_type: String,
    pub content: String,
    pub context: String,
    pub page_number: Option<i64>,
    pub confidence: f64,
    pub tags: Vec<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchClaimRow {
    pub id: String,
    pub run_id: String,
    pub evidence_id: String,
    pub source_id: String,
    pub claim: String,
    pub status: String,
    pub confidence: f64,
    pub verified_by: Vec<String>,
    pub contradicted_by: Vec<String>,
    pub verification_reason: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchContradictionRow {
    pub id: String,
    pub run_id: String,
    pub claim_a_id: String,
    pub claim_b_id: String,
    pub claim_a_confidence: f64,
    pub claim_b_confidence: f64,
    pub reason: Option<String>,
    pub resolution: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchReportRow {
    pub id: String,
    pub run_id: String,
    pub title: String,
    pub content_markdown: String,
    pub citation_map: HashMap<String, String>,
    pub source_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub word_count: i64,
    pub format: String,
    pub exported_to_document_id: Option<String>,
    pub exported_to_memory_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResearchRunWithRelations {
    pub run: ResearchRunRow,
    pub steps: Vec<ResearchStepRow>,
    pub sources: Vec<ResearchSourceRow>,
    pub evidence: Vec<ResearchEvidenceRow>,
    pub claims: Vec<ResearchClaimRow>,
    pub contradictions: Vec<ResearchContradictionRow>,
    pub report: Option<ResearchReportRow>,
}

// ── Input types ───────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchRunInput {
    pub id: Option<String>,
    pub project_id: Option<String>,
    pub question: String,
    pub depth: String,
    pub model_used: Option<String>,
    pub provider_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResearchRunInput {
    pub id: String,
    pub status: Option<String>,
    pub clarified_question: Option<String>,
    pub plan: Option<ResearchPlan>,
    pub current_step_id: Option<String>,
    pub progress_percent: Option<i64>,
    pub error: Option<String>,
    pub completed_at: Option<String>,
    pub total_tokens_used: Option<i64>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchStepInput {
    pub id: Option<String>,
    pub run_id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub title: String,
    pub detail: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResearchStepInput {
    pub id: String,
    pub status: Option<String>,
    pub detail: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub tokens_used: Option<i64>,
    pub model_used: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchSourceInput {
    pub id: Option<String>,
    pub run_id: String,
    pub step_id: Option<String>,
    pub url: String,
    pub title: String,
    pub snippet: Option<String>,
    pub source_type: String,
    pub engine: Option<String>,
    pub score: Option<f64>,
    pub rank: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResearchSourceInput {
    pub id: String,
    pub status: Option<String>,
    pub full_text: Option<String>,
    pub content_type: Option<String>,
    pub fetched_at: Option<String>,
    pub read_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchEvidenceInput {
    pub id: Option<String>,
    pub run_id: String,
    pub source_id: String,
    pub step_id: Option<String>,
    #[serde(rename = "type")]
    pub evidence_type: String,
    pub content: String,
    pub context: String,
    pub page_number: Option<i64>,
    pub confidence: f64,
    pub tags: Option<Vec<String>>,
    pub created_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchClaimInput {
    pub id: Option<String>,
    pub run_id: String,
    pub evidence_id: String,
    pub source_id: String,
    pub claim: String,
    pub confidence: f64,
    pub created_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResearchClaimInput {
    pub id: String,
    pub status: Option<String>,
    pub confidence: Option<f64>,
    pub verified_by: Option<Vec<String>>,
    pub contradicted_by: Option<Vec<String>>,
    pub verification_reason: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchContradictionInput {
    pub id: Option<String>,
    pub run_id: String,
    pub claim_a_id: String,
    pub claim_b_id: String,
    pub claim_a_confidence: f64,
    pub claim_b_confidence: f64,
    pub reason: Option<String>,
    pub resolution: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateResearchReportInput {
    pub id: Option<String>,
    pub run_id: String,
    pub title: String,
    pub content_markdown: String,
    pub citation_map: HashMap<String, String>,
    pub source_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub word_count: i64,
    pub format: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResearchReportInput {
    pub id: String,
    pub title: Option<String>,
    pub content_markdown: Option<String>,
    pub citation_map: Option<HashMap<String, String>>,
    pub source_ids: Option<Vec<String>>,
    pub evidence_ids: Option<Vec<String>>,
    pub word_count: Option<i64>,
    pub exported_to_document_id: Option<String>,
    pub exported_to_memory_ids: Option<Vec<String>>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListResearchRunsFilter {
    pub project_id: Option<String>,
    pub status: Option<Vec<String>>,
    pub limit: Option<i64>,
}

// ── Schema ─────────────────────────────────────────────────────────────────────

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  question TEXT NOT NULL,
  clarified_question TEXT,
  depth TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_json TEXT,
  current_step_id TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  model_used TEXT,
  provider_id TEXT,
  total_tokens_used INTEGER
);

CREATE TABLE IF NOT EXISTS research_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  output TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  tokens_used INTEGER,
  model_used TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  full_text TEXT,
  content_type TEXT,
  status TEXT NOT NULL,
  source_type TEXT NOT NULL,
  engine TEXT,
  score REAL,
  rank INTEGER,
  fetched_at TEXT,
  read_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  step_id TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  context TEXT NOT NULL,
  page_number INTEGER,
  confidence REAL NOT NULL DEFAULT 0.5,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES research_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_claims (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  claim TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  verified_by TEXT NOT NULL DEFAULT '[]',
  contradicted_by TEXT NOT NULL DEFAULT '[]',
  verification_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES research_evidence(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES research_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_contradictions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  claim_a_id TEXT NOT NULL,
  claim_b_id TEXT NOT NULL,
  claim_a_confidence REAL NOT NULL,
  claim_b_confidence REAL NOT NULL,
  reason TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_a_id) REFERENCES research_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_b_id) REFERENCES research_claims(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  citation_map TEXT NOT NULL DEFAULT '{}',
  source_ids TEXT NOT NULL DEFAULT '[]',
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  word_count INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'markdown',
  exported_to_document_id TEXT,
  exported_to_memory_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_runs_project ON research_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_created ON research_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_research_steps_run ON research_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_run ON research_sources(run_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_status ON research_sources(status);
CREATE INDEX IF NOT EXISTS idx_research_evidence_run ON research_evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_research_evidence_source ON research_evidence(source_id);
CREATE INDEX IF NOT EXISTS idx_research_claims_run ON research_claims(run_id);
CREATE INDEX IF NOT EXISTS idx_research_contradictions_run ON research_contradictions(run_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_run ON research_reports(run_id);
"#;

const SCHEMA_VERSION: i64 = 3;

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        ID_COUNTER.fetch_add(1, Ordering::SeqCst)
    )
}

// ── Init ───────────────────────────────────────────────────────────────────────

impl ResearchDb {
    pub fn init(app: &tauri::AppHandle) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let conn = crate::db_utils::open_app_sqlite(app, "veyra.sqlite")?;
        run_migrations(&conn)?;
        if cfg!(debug_assertions) {
            log::info!(
                "ResearchDb::init completed in {}ms",
                start.elapsed().as_millis()
            );
        }
        Ok(ResearchDb(Mutex::new(conn)))
    }
}

// ── State wrapper ──────────────────────────────────────────────────────────────

pub struct ResearchDbState {
    app: tauri::AppHandle,
    db: Arc<Mutex<Option<Result<Arc<ResearchDb>, String>>>>,
}

impl Clone for ResearchDbState {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            db: Arc::clone(&self.db),
        }
    }
}

impl ResearchDbState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            db: Arc::new(Mutex::new(None)),
        }
    }

    pub fn spawn_background_init(&self) {
        crate::db_utils::spawn_lazy_db_init(
            self.app.clone(),
            Arc::clone(&self.db),
            ResearchDb::init,
            "ResearchDb",
        );
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let db = {
            let mut slot = self.db.lock();
            if slot.is_none() {
                *slot = Some(ResearchDb::init(&self.app).map(Arc::new));
            }
            match slot.as_ref().unwrap() {
                Ok(db) => Arc::clone(db),
                Err(error) => return Err(error.clone()),
            }
        };
        let guard = db.0.lock();
        f(&guard)
    }
}

impl crate::db_utils::DbConnectionState for ResearchDbState {
    fn with_db_connection<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.with_connection(f)
    }
}

// ── Migrations ─────────────────────────────────────────────────────────────────

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let schema_version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);

    if schema_version < SCHEMA_VERSION {
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("research schema migration failed: {}", e))?;

        conn.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))
            .map_err(|e| format!("set schema version failed: {}", e))?;
    }

    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| format!("prepare table_info failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("query table_info failed: {}", e))?;
    for row in rows {
        if row.map_err(|e| format!("table_info row failed: {}", e))? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition),
        [],
    )
    .map_err(|e| format!("add column {}.{} failed: {}", table, column, e))?;
    Ok(())
}

// ── Row mappers ────────────────────────────────────────────────────────────────

fn row_to_run(row: &rusqlite::Row) -> rusqlite::Result<ResearchRunRow> {
    let plan_json: Option<String> = row.get("plan_json")?;
    let plan = plan_json.and_then(|s| serde_json::from_str(&s).ok());
    Ok(ResearchRunRow {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        question: row.get("question")?,
        clarified_question: row.get("clarified_question")?,
        depth: row.get("depth")?,
        status: row.get("status")?,
        plan,
        current_step_id: row.get("current_step_id")?,
        progress_percent: row.get("progress_percent")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        error: row.get("error")?,
        model_used: row.get("model_used")?,
        provider_id: row.get("provider_id")?,
        total_tokens_used: row.get("total_tokens_used")?,
    })
}

fn row_to_step(row: &rusqlite::Row) -> rusqlite::Result<ResearchStepRow> {
    Ok(ResearchStepRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        step_type: row.get("type")?,
        status: row.get("status")?,
        title: row.get("title")?,
        detail: row.get("detail")?,
        output: row.get("output")?,
        error: row.get("error")?,
        started_at: row.get("started_at")?,
        completed_at: row.get("completed_at")?,
        tokens_used: row.get("tokens_used")?,
        model_used: row.get("model_used")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_source(row: &rusqlite::Row) -> rusqlite::Result<ResearchSourceRow> {
    Ok(ResearchSourceRow {
        id: row.get("id")?,
        run_id: row.get("run_id")?,
        step_id: row.get("step_id")?,
        url: row.get("url")?,
        title: row.get("title")?,
        snippet: row.get("snippet")?,
        full_text: row.get("full_text")?,
        content_type: row.get("content_type")?,
        status: row.get("status")?,
        source_type: row.get("source_type")?,
        engine: row.get("engine")?,
        score: row.get("score")?,
        rank: row.get("rank")?,
        fetched_at: row.get("fetched_at")?,
        read_at: row.get("read_at")?,
        error: row.get("error")?,
        created_at: row.get("created_at")?,
    })
}

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

fn row_to_claim(row: &rusqlite::Row) -> rusqlite::Result<ResearchClaimRow> {
    let verified_by_str: String = row.get("verified_by")?;
    let contradicted_by_str: String = row.get("contradicted_by")?;
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
        verification_reason: row.get("verification_reason")?,
        created_at: row.get("created_at")?,
    })
}

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

fn row_to_report(row: &rusqlite::Row) -> rusqlite::Result<ResearchReportRow> {
    let citation_map_str: String = row.get("citation_map")?;
    let source_ids_str: String = row.get("source_ids")?;
    let evidence_ids_str: String = row.get("evidence_ids")?;
    let exported_to_memory_ids_str: String = row.get("exported_to_memory_ids")?;
    let citation_map: HashMap<String, String> =
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

// ── Runs ───────────────────────────────────────────────────────────────────────

const RUN_SELECT_COLS: &str = "id, project_id, question, clarified_question, depth, status, plan_json, current_step_id, progress_percent, created_at, updated_at, completed_at, error, model_used, provider_id, total_tokens_used";

pub fn create_run(conn: &Connection, input_json: String) -> Result<ResearchRunRow, String> {
    let input: CreateResearchRunInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_run input: {}", e))?;
    if input.question.is_empty() {
        return Err("create_run requires question".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("run"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or_else(|| now.clone());
    let updated_at = input.updated_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_run transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_runs
           (id, project_id, question, depth, status, progress_percent, created_at, updated_at, model_used, provider_id)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            input.project_id,
            input.question,
            input.depth,
            "planning",
            0i64,
            created_at,
            updated_at,
            input.model_used,
            input.provider_id,
        ],
    )
    .map_err(|e| format!("insert research_run failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM research_runs WHERE id = ?1", RUN_SELECT_COLS),
            [&id],
            row_to_run,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_run transaction failed: {}", e))?;

    Ok(created)
}

pub fn get_run(conn: &Connection, id: String) -> Result<ResearchRunRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM research_runs WHERE id = ?1", RUN_SELECT_COLS),
        [&id],
        row_to_run,
    )
    .map_err(|e| format!("get_run failed: {}", e))
}

pub fn update_run(conn: &Connection, input_json: String) -> Result<ResearchRunRow, String> {
    let input: UpdateResearchRunInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_run input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_run requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.clarified_question {
        sets.push(format!("clarified_question = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.plan {
        let json =
            serde_json::to_string(&v).map_err(|e| format!("failed to serialize plan: {}", e))?;
        sets.push(format!("plan_json = ?{}", params.len() + 1));
        params.push(Value::Text(json));
    }
    if let Some(v) = input.current_step_id {
        sets.push(format!("current_step_id = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.progress_percent {
        sets.push(format!("progress_percent = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.completed_at {
        sets.push(format!("completed_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.total_tokens_used {
        sets.push(format!("total_tokens_used = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.updated_at {
        sets.push(format!("updated_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_run requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_runs SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_run failed: {}", e))?;

    get_run(conn, input.id)
}

pub fn list_runs(conn: &Connection, filter_json: String) -> Result<Vec<ResearchRunRow>, String> {
    let trimmed = filter_json.trim();
    let filter: ListResearchRunsFilter = if trimmed.is_empty() || trimmed == "null" {
        ListResearchRunsFilter {
            project_id: None,
            status: None,
            limit: None,
        }
    } else {
        serde_json::from_str(trimmed).map_err(|e| format!("invalid list_runs filter: {}", e))?
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(pid) = &filter.project_id {
        conditions.push(format!("project_id = ?{}", params.len() + 1));
        params.push(Value::Text(pid.clone()));
    }
    if let Some(statuses) = &filter.status {
        if !statuses.is_empty() {
            let placeholders: Vec<String> = (1..=statuses.len())
                .map(|i| format!("?{}", params.len() + i))
                .collect();
            conditions.push(format!("status IN ({})", placeholders.join(",")));
            for s in statuses {
                params.push(Value::Text(s.clone()));
            }
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    let limit_placeholder = params.len() + 1;
    params.push(Value::Integer(limit));

    let sql = format!(
        "SELECT {} FROM research_runs{} ORDER BY created_at DESC LIMIT ?{}",
        RUN_SELECT_COLS, where_clause, limit_placeholder
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare list_runs failed: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(params), row_to_run)
        .map_err(|e| format!("query list_runs failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_runs: {}", e))?);
    }
    Ok(out)
}

pub fn delete_run(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM research_runs WHERE id = ?1", [&id])
        .map_err(|e| format!("delete research_run failed: {}", e))?;
    Ok(())
}

// ── Steps ──────────────────────────────────────────────────────────────────────

const STEP_SELECT_COLS: &str = "id, run_id, type, status, title, detail, output, error, started_at, completed_at, tokens_used, model_used, created_at";

pub fn create_step(conn: &Connection, input_json: String) -> Result<ResearchStepRow, String> {
    let input: CreateResearchStepInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_step input: {}", e))?;
    if input.title.is_empty() {
        return Err("create_step requires title".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("step"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_step transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_steps
           (id, run_id, type, status, title, detail, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            input.run_id,
            input.step_type,
            "pending",
            input.title,
            input.detail,
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_step failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM research_steps WHERE id = ?1", STEP_SELECT_COLS),
            [&id],
            row_to_step,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_step transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_step(conn: &Connection, input_json: String) -> Result<ResearchStepRow, String> {
    let input: UpdateResearchStepInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_step input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_step requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.detail {
        sets.push(format!("detail = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.output {
        sets.push(format!("output = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.started_at {
        sets.push(format!("started_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.completed_at {
        sets.push(format!("completed_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.tokens_used {
        sets.push(format!("tokens_used = ?{}", params.len() + 1));
        params.push(Value::Integer(v));
    }
    if let Some(v) = input.model_used {
        sets.push(format!("model_used = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_step requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_steps SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_step failed: {}", e))?;

    conn.query_row(
        &format!("SELECT {} FROM research_steps WHERE id = ?1", STEP_SELECT_COLS),
        [&input.id],
        row_to_step,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_steps_for_run(conn: &Connection, run_id: String) -> Result<Vec<ResearchStepRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_steps WHERE run_id = ?1 ORDER BY created_at ASC",
            STEP_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_steps_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_step)
        .map_err(|e| format!("query list_steps_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_steps_for_run: {}", e))?);
    }
    Ok(out)
}

// ── Sources ────────────────────────────────────────────────────────────────────

const SOURCE_SELECT_COLS: &str = "id, run_id, step_id, url, title, snippet, full_text, content_type, status, source_type, engine, score, rank, fetched_at, read_at, error, created_at";

pub fn create_source(conn: &Connection, input_json: String) -> Result<ResearchSourceRow, String> {
    let input: CreateResearchSourceInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid create_source input: {}", e))?;
    if input.url.is_empty() {
        return Err("create_source requires url".to_string());
    }
    if input.title.is_empty() {
        return Err("create_source requires title".to_string());
    }

    let id = input.id.unwrap_or_else(|| generate_id("source"));
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = input.created_at.unwrap_or(now);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin create_source transaction failed: {}", e))?;

    tx.execute(
        "INSERT INTO research_sources
           (id, run_id, step_id, url, title, snippet, source_type, engine, score, rank, status, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            id,
            input.run_id,
            input.step_id,
            input.url,
            input.title,
            input.snippet,
            input.source_type,
            input.engine,
            input.score,
            input.rank,
            "discovered",
            created_at,
        ],
    )
    .map_err(|e| format!("insert research_source failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM research_sources WHERE id = ?1", SOURCE_SELECT_COLS),
            [&id],
            row_to_source,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_source transaction failed: {}", e))?;

    Ok(created)
}

pub fn update_source(conn: &Connection, input_json: String) -> Result<ResearchSourceRow, String> {
    let input: UpdateResearchSourceInput = serde_json::from_str(&input_json)
        .map_err(|e| format!("invalid update_source input: {}", e))?;
    if input.id.is_empty() {
        return Err("update_source requires id".to_string());
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(v) = input.status {
        sets.push(format!("status = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.full_text {
        sets.push(format!("full_text = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.content_type {
        sets.push(format!("content_type = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.fetched_at {
        sets.push(format!("fetched_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.read_at {
        sets.push(format!("read_at = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }
    if let Some(v) = input.error {
        sets.push(format!("error = ?{}", params.len() + 1));
        params.push(Value::Text(v));
    }

    if sets.is_empty() {
        return Err("update_source requires at least one field to update".to_string());
    }

    let where_placeholder = params.len() + 1;
    let sql = format!(
        "UPDATE research_sources SET {} WHERE id = ?{}",
        sets.join(", "),
        where_placeholder
    );
    params.push(Value::Text(input.id.clone()));

    conn.execute(&sql, params_from_iter(params))
        .map_err(|e| format!("update research_source failed: {}", e))?;

    conn.query_row(
        &format!("SELECT {} FROM research_sources WHERE id = ?1", SOURCE_SELECT_COLS),
        [&input.id],
        row_to_source,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_sources_for_run(conn: &Connection, run_id: String) -> Result<Vec<ResearchSourceRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_sources WHERE run_id = ?1 ORDER BY rank ASC, created_at ASC",
            SOURCE_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_sources_for_run failed: {}", e))?;
    let rows = stmt
        .query_map([&run_id], row_to_source)
        .map_err(|e| format!("query list_sources_for_run failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_sources_for_run: {}", e))?);
    }
    Ok(out)
}

pub fn get_source(conn: &Connection, id: String) -> Result<ResearchSourceRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM research_sources WHERE id = ?1", SOURCE_SELECT_COLS),
        [&id],
        row_to_source,
    )
    .map_err(|e| format!("get_source failed: {}", e))
}

// ── Evidence ───────────────────────────────────────────────────────────────────

const EVIDENCE_SELECT_COLS: &str = "id, run_id, source_id, step_id, type, content, context, page_number, confidence, tags, created_at";

pub fn create_evidence(conn: &Connection, input_json: String) -> Result<ResearchEvidenceRow, String> {
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
            &format!("SELECT {} FROM research_evidence WHERE id = ?1", EVIDENCE_SELECT_COLS),
            [&id],
            row_to_evidence,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_evidence transaction failed: {}", e))?;

    Ok(created)
}

pub fn list_evidence_for_run(conn: &Connection, run_id: String) -> Result<Vec<ResearchEvidenceRow>, String> {
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

pub fn list_evidence_for_source(conn: &Connection, source_id: String) -> Result<Vec<ResearchEvidenceRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM research_evidence WHERE source_id = ?1 ORDER BY created_at ASC",
            EVIDENCE_SELECT_COLS
        ))
        .map_err(|e| format!("prepare list_evidence_for_source failed: {}", e))?;
    let rows = stmt
        .query_map([&source_id], row_to_evidence)
        .map_err(|e| format!("query list_evidence_for_source failed: {}", e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row error in list_evidence_for_source: {}", e))?);
    }
    Ok(out)
}

// ── Claims ─────────────────────────────────────────────────────────────────────

const CLAIM_SELECT_COLS: &str = "id, run_id, evidence_id, source_id, claim, status, confidence, verified_by, contradicted_by, verification_reason, created_at";

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
           (id, run_id, evidence_id, source_id, claim, status, confidence, verified_by, contradicted_by, created_at)
         VALUES
           (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
        ],
    )
    .map_err(|e| format!("insert research_claim failed: {}", e))?;

    let created = tx
        .query_row(
            &format!("SELECT {} FROM research_claims WHERE id = ?1", CLAIM_SELECT_COLS),
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
        &format!("SELECT {} FROM research_claims WHERE id = ?1", CLAIM_SELECT_COLS),
        [&input.id],
        row_to_claim,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn list_claims_for_run(conn: &Connection, run_id: String) -> Result<Vec<ResearchClaimRow>, String> {
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

// ── Contradictions ─────────────────────────────────────────────────────────────

const CONTRADICTION_SELECT_COLS: &str = "id, run_id, claim_a_id, claim_b_id, claim_a_confidence, claim_b_confidence, reason, resolution, created_at";

pub fn create_contradiction(conn: &Connection, input_json: String) -> Result<ResearchContradictionRow, String> {
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
            &format!("SELECT {} FROM research_contradictions WHERE id = ?1", CONTRADICTION_SELECT_COLS),
            [&id],
            row_to_contradiction,
        )
        .map_err(|e| format!("query after insert failed: {}", e))?;

    tx.commit()
        .map_err(|e| format!("commit create_contradiction transaction failed: {}", e))?;

    Ok(created)
}

pub fn list_contradictions_for_run(conn: &Connection, run_id: String) -> Result<Vec<ResearchContradictionRow>, String> {
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

// ── Reports ────────────────────────────────────────────────────────────────────

const REPORT_SELECT_COLS: &str = "id, run_id, title, content_markdown, citation_map, source_ids, evidence_ids, word_count, format, exported_to_document_id, exported_to_memory_ids, created_at, updated_at";

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
            &format!("SELECT {} FROM research_reports WHERE id = ?1", REPORT_SELECT_COLS),
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
        &format!("SELECT {} FROM research_reports WHERE id = ?1", REPORT_SELECT_COLS),
        [&input.id],
        row_to_report,
    )
    .map_err(|e| format!("query after update failed: {}", e))
}

pub fn get_report_for_run(conn: &Connection, run_id: String) -> Result<ResearchReportRow, String> {
    conn.query_row(
        &format!("SELECT {} FROM research_reports WHERE run_id = ?1", REPORT_SELECT_COLS),
        [&run_id],
        row_to_report,
    )
    .map_err(|e| format!("get_report_for_run failed: {}", e))
}

// ── Relations ──────────────────────────────────────────────────────────────────

pub fn get_run_with_relations(conn: &Connection, run_id: String) -> Result<ResearchRunWithRelations, String> {
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
