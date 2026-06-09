export type ResearchDepth = "quick" | "standard" | "deep" | "exhaustive";

export type ResearchRunStatus =
  | "planning"
  | "searching"
  | "reading"
  | "extracting"
  | "verifying"
  | "synthesizing"
  | "completed"
  | "failed"
  | "paused";

export type ResearchStepType =
  | "clarify"
  | "plan"
  | "search"
  | "read"
  | "extract"
  | "verify"
  | "synthesize"
  | "report"
  | "follow_up";

export type ResearchStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type ResearchSourceStatus =
  | "discovered"
  | "fetched"
  | "read"
  | "failed"
  | "skipped";

export type ResearchSourceType =
  | "webpage"
  | "pdf"
  | "news"
  | "docs"
  | "github"
  | "wikipedia"
  | "forum"
  | "package"
  | "unknown";

export type ResearchEvidenceType =
  | "claim"
  | "statistic"
  | "quote"
  | "fact"
  | "opinion"
  | "study";

export type ResearchClaimStatus =
  | "extracted"
  | "verified"
  | "partially_verified"
  | "contradicted"
  | "unverified"
  | "rejected";

export type ResearchReportFormat = "markdown" | "pdf" | "docx";

export interface ResearchRun {
  id: string;
  projectId?: string;
  question: string;
  clarifiedQuestion?: string;
  depth: ResearchDepth;
  status: ResearchRunStatus;
  plan?: ResearchPlan;
  currentStepId?: string;
  progressPercent: number; // 0-100
  createdAt: string; // ISO
  updatedAt: string;
  completedAt?: string;
  error?: string;
  modelUsed?: string;
  providerId?: string;
  totalTokensUsed?: number;
}

export interface ResearchPlan {
  id: string;
  runId: string;
  steps: ResearchPlanStep[];
  userApproved: boolean;
  userEdited: boolean;
  createdAt: string;
}

export interface ResearchPlanStep {
  id: string;
  planId: string;
  stepNumber: number;
  title: string;
  description: string;
  searchQueries?: string[];
  expectedSources?: number;
  dependsOnStepIds?: string[];
  createdAt: string;
}

export interface ResearchStep {
  id: string;
  runId: string;
  type: ResearchStepType;
  status: ResearchStepStatus;
  title: string;
  detail?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  tokensUsed?: number;
  modelUsed?: string;
  createdAt: string;
}

export interface ResearchSource {
  id: string;
  runId: string;
  stepId?: string;
  url: string;
  title: string;
  snippet?: string;
  fullText?: string;
  contentType?: string; // text/html, application/pdf, etc.
  status: ResearchSourceStatus;
  sourceType: ResearchSourceType;
  engine?: string;
  score?: number;
  rank?: number;
  fetchedAt?: string;
  readAt?: string;
  error?: string;
  createdAt: string;
}

export interface ResearchEvidence {
  id: string;
  runId: string;
  sourceId: string;
  stepId?: string;
  type: ResearchEvidenceType;
  content: string; // the extracted snippet
  context: string; // surrounding context
  pageNumber?: number;
  confidence: number; // 0-1
  tags: string[];
  createdAt: string;
}

export interface ResearchClaim {
  id: string;
  runId: string;
  evidenceId: string;
  sourceId: string;
  claim: string; // the normalized claim text
  status: ResearchClaimStatus;
  confidence: number;
  verifiedBy?: string[]; // claimIds that confirm this
  contradictedBy?: string[]; // claimIds that contradict
  verificationReason?: string;
  createdAt: string;
}

export interface ResearchContradiction {
  id: string;
  runId: string;
  claimAId: string;
  claimBId: string;
  claimAConfidence: number;
  claimBConfidence: number;
  reason?: string;
  resolution?: string;
  createdAt: string;
}

export interface ResearchReport {
  id: string;
  runId: string;
  title: string;
  contentMarkdown: string;
  citationMap: Record<string, string>; // key -> sourceId
  sourceIds: string[];
  evidenceIds: string[];
  wordCount: number;
  format: ResearchReportFormat;
  exportedToDocumentId?: string;
  exportedToMemoryIds?: string[];
  createdAt: string;
  updatedAt: string;
}

// Input types for creating
export interface CreateResearchRunInput {
  projectId?: string;
  question: string;
  depth: ResearchDepth;
  modelUsed?: string;
  providerId?: string;
}

export interface UpdateResearchRunInput {
  id: string;
  status?: ResearchRunStatus;
  clarifiedQuestion?: string;
  plan?: ResearchPlan;
  currentStepId?: string;
  progressPercent?: number;
  error?: string;
  completedAt?: string;
  totalTokensUsed?: number;
}

export interface CreateResearchStepInput {
  runId: string;
  type: ResearchStepType;
  title: string;
  detail?: string;
}

export interface UpdateResearchStepInput {
  id: string;
  status?: ResearchStepStatus;
  detail?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  tokensUsed?: number;
  modelUsed?: string;
}

export interface CreateResearchSourceInput {
  runId: string;
  stepId?: string;
  url: string;
  title: string;
  snippet?: string;
  sourceType: ResearchSourceType;
  engine?: string;
  score?: number;
  rank?: number;
}

export interface UpdateResearchSourceInput {
  id: string;
  status?: ResearchSourceStatus;
  fullText?: string;
  contentType?: string;
  fetchedAt?: string;
  readAt?: string;
  error?: string;
}

export interface CreateResearchEvidenceInput {
  runId: string;
  sourceId: string;
  stepId?: string;
  type: ResearchEvidenceType;
  content: string;
  context: string;
  pageNumber?: number;
  confidence: number;
  tags?: string[];
}

export interface CreateResearchClaimInput {
  runId: string;
  evidenceId: string;
  sourceId: string;
  claim: string;
  confidence: number;
}

export interface UpdateResearchClaimInput {
  id: string;
  status?: ResearchClaimStatus;
  confidence?: number;
  verifiedBy?: string[];
  contradictedBy?: string[];
  verificationReason?: string;
}

export interface CreateResearchContradictionInput {
  runId: string;
  claimAId: string;
  claimBId: string;
  claimAConfidence: number;
  claimBConfidence: number;
  reason?: string;
  resolution?: string;
}

export interface CreateResearchReportInput {
  runId: string;
  title: string;
  contentMarkdown: string;
  citationMap: Record<string, string>;
  sourceIds: string[];
  evidenceIds: string[];
  wordCount: number;
  format: ResearchReportFormat;
}

export interface UpdateResearchReportInput {
  id: string;
  title?: string;
  contentMarkdown?: string;
  citationMap?: Record<string, string>;
  sourceIds?: string[];
  evidenceIds?: string[];
  wordCount?: number;
  exportedToDocumentId?: string;
  exportedToMemoryIds?: string[];
}

// Filter / list types
export interface ListResearchRunsFilter {
  projectId?: string;
  status?: ResearchRunStatus[];
  limit?: number;
}

export interface ResearchRunWithRelations {
  run: ResearchRun;
  steps: ResearchStep[];
  sources: ResearchSource[];
  evidence: ResearchEvidence[];
  claims: ResearchClaim[];
  contradictions: ResearchContradiction[];
  report?: ResearchReport;
}
