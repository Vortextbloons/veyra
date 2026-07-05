import type { ResearchRun, ResearchRunWithRelations, ResearchStep, ResearchSource, ResearchEvidence, ResearchClaim, ResearchContradiction, ResearchReport } from "./research-types";

export type ResearchStoreState = {
  runs: ResearchRun[];
  activeRunId: string | null;
  activeRun: ResearchRunWithRelations | null;
  isLoading: boolean;
  error: string | null;
  hydrationState: "loading" | "ready";
  activeController: AbortController | null;
  isPausing: boolean;
  validateProgress: { done: number; total: number };
  extractProgress: { done: number; total: number };
  contradictionProgress: { done: number; total: number };
  auditProgress: { done: number; total: number };
  filteredEvidenceCount: { lowSignificance: number; tooShort: number; emptyContent: number };
};

export const selectRuns = (s: ResearchStoreState) => s.runs;
export const selectActiveRunId = (s: ResearchStoreState) => s.activeRunId;
export const selectActiveRun = (s: ResearchStoreState) => s.activeRun;
export const selectIsLoading = (s: ResearchStoreState) => s.isLoading;
export const selectError = (s: ResearchStoreState) => s.error;
export const selectHydrationState = (s: ResearchStoreState) => s.hydrationState;
export const selectIsPausing = (s: ResearchStoreState) => s.isPausing;
export const selectValidateProgress = (s: ResearchStoreState) => s.validateProgress;
export const selectExtractProgress = (s: ResearchStoreState) => s.extractProgress;
export const selectContradictionProgress = (s: ResearchStoreState) => s.contradictionProgress;
export const selectAuditProgress = (s: ResearchStoreState) => s.auditProgress;
export const selectFilteredEvidenceCount = (s: ResearchStoreState) => s.filteredEvidenceCount;

export const selectRunById = (s: ResearchStoreState, id: string): ResearchRun | undefined =>
  s.runs.find((r) => r.id === id);

export const selectActiveRunSteps = (s: ResearchStoreState): ResearchStep[] =>
  s.activeRun?.steps ?? [];

export const selectActiveRunSources = (s: ResearchStoreState): ResearchSource[] =>
  s.activeRun?.sources ?? [];

export const selectActiveRunEvidence = (s: ResearchStoreState): ResearchEvidence[] =>
  s.activeRun?.evidence ?? [];

export const selectActiveRunClaims = (s: ResearchStoreState): ResearchClaim[] =>
  s.activeRun?.claims ?? [];

export const selectActiveRunContradictions = (s: ResearchStoreState): ResearchContradiction[] =>
  s.activeRun?.contradictions ?? [];

export const selectActiveRunReport = (s: ResearchStoreState): ResearchReport | null =>
  s.activeRun?.report ?? null;

export const selectActiveRunStatus = (s: ResearchStoreState) =>
  s.activeRun?.run.status ?? null;
