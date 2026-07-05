use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

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
    pub search_provider: Option<String>,
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
    pub fetch_status: Option<String>,
    pub source_quality: Option<serde_json::Value>,
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
    pub disputed_by: Vec<String>,
    pub needs_semantic_review: bool,
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
    pub search_provider: Option<String>,
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
    pub fetch_status: Option<String>,
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
    pub source_quality: Option<serde_json::Value>,
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
    pub needs_semantic_review: Option<bool>,
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
    pub disputed_by: Option<Vec<String>>,
    pub needs_semantic_review: Option<bool>,
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

pub const SCHEMA: &str = r#"
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
  total_tokens_used INTEGER,
  search_provider TEXT
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
  fetch_status TEXT,
  source_quality_json TEXT,
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
  disputed_by TEXT NOT NULL DEFAULT '[]',
  needs_semantic_review INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_research_claims_evidence ON research_claims(evidence_id);
CREATE INDEX IF NOT EXISTS idx_research_claims_source ON research_claims(source_id);
CREATE INDEX IF NOT EXISTS idx_research_contradictions_run ON research_contradictions(run_id);
CREATE INDEX IF NOT EXISTS idx_research_contradictions_claim_a ON research_contradictions(claim_a_id);
CREATE INDEX IF NOT EXISTS idx_research_contradictions_claim_b ON research_contradictions(claim_b_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_run ON research_reports(run_id);
"#;

pub const SCHEMA_VERSION: i64 = 6;

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn generate_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        ID_COUNTER.fetch_add(1, Ordering::SeqCst)
    )
}
