import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { buildDepthConfig, type DepthConfig, type ResearchProfileOverride } from "./research-depth-config";
import type {
  ResearchRun,
  ResearchSource,
  ResearchEvidence,
  ResearchClaim,
  ResearchContradiction,
  ResearchStep,
  ResearchPlan,
  ResearchStepType,
  ResearchStepStatus,
  ResearchRunStatus,
  UpdateResearchRunInput,
} from "./research-types";
import type { CallResearchAiOptions, CallResearchAiResult } from "./research-ai";
import { getErrorMessage } from "./research-json-utils";
import { nowIso, chunkSourceText } from "./research-source-utils";
import { useResearchStore } from "./research-store";

// ── Shared mutable state for one research run ─────────────────────────────

/**
 * Optional per-run override that snapshots the values from the New Research dialog
 * "Advanced" panel. When set, it is merged on top of the user's settings and is
 * used in place of the depth preset's defaults.
 */
export type ResearchRunOverride = ResearchProfileOverride;

export type ResearchEventCallback = (event: import("./research-types").ResearchRuntimeEvent) => void;

export interface ResearchRuntimeContext {
  run: ResearchRun;
  config: DepthConfig;
  signal: AbortSignal;
  store: ReturnType<typeof useResearchStore.getState>;
  onEvent: ResearchEventCallback;

  // Model routing
  researchModelId: string;
  liteModelId: string;
  liteProviderId: string;
  reasoningMode: "disabled" | "low" | "high";
  reasoningEffort: "low" | "medium" | "high";

  // Local arrays (mutated across phases)
  sources: ResearchSource[];
  evidenceList: ResearchEvidence[];
  claims: ResearchClaim[];
  contradictions: ResearchContradiction[];
  searchQueriesUsed: string[];
  tokenUsage: { input: number };
  backgroundContext: string;
  planContextSummary: string;
  activeResearchPlan: ResearchPlan | null;
  clarifiedResearchQuestion: string;

  // Source-chunk cache
  sourceChunks: Map<string, string[]>;
  getSourceChunks(source: ResearchSource): string[];

  // Search error tracking
  firstSearchError: string | null;
  captureSearchError(err: unknown): string;

  // Step management helpers
  checkAbort(): void;
  bundleEnabled: boolean;
  appendUnique(values: string[] | undefined, value: string): string[];
  currentClaim(claim: ResearchClaim): ResearchClaim;
  updateRunStatus(status: ResearchRunStatus, progressPercent: number, extra?: Partial<UpdateResearchRunInput>): Promise<void>;
  createStep(type: ResearchStepType, title: string, detail?: string): Promise<ResearchStep>;
  completeStep(step: ResearchStep, output?: string, tokensUsed?: number): Promise<void>;
  failStep(step: ResearchStep, error: string): Promise<void>;
  runAiStep(
    type: ResearchStepType,
    title: string,
    detail: string | undefined,
    aiCall: () => Promise<CallResearchAiResult>,
    formatOutput?: (value: string) => string | undefined,
  ): Promise<{ value: string; step: ResearchStep }>;
  updateLocalSource(updatedSource: ResearchSource): void;

  // AI options helper
  researchAiOptions(kind: "main" | "lite", extra?: CallResearchAiOptions): CallResearchAiOptions;
}

export function createResearchRuntimeContext(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: ResearchEventCallback,
  _resumeFromPhase?: string,
  perRunOverride?: ResearchRunOverride,
): ResearchRuntimeContext {
  const store = useResearchStore.getState();
  const config = buildDepthConfig(run.depth, perRunOverride);

  // Resolve model routing
  const providerState = useProviderStore.getState();
  const mainProviderId = run.providerId ?? providerState.selectedProvider;
  const mainModelId = run.modelUsed ?? providerState.selectedModel;

  function getModelForKind(kind: "main" | "lite"): { providerId: string; modelId: string } | null {
    if (kind === "lite" && config.liteModelId && config.liteModelProviderId) {
      return { providerId: config.liteModelProviderId, modelId: config.liteModelId };
    }
    if (!mainProviderId || !mainModelId) return null;
    return { providerId: mainProviderId, modelId: mainModelId };
  }

  // Populate local arrays from existing run
  const sources: ResearchSource[] = [];
  const evidenceList: ResearchEvidence[] = [];
  const claims: ResearchClaim[] = [];
  const contradictions: ResearchContradiction[] = [];
  const planContextSummary = "";
  const activeResearchPlan: ResearchPlan | null = run.plan ?? null;
  const clarifiedResearchQuestion: string = run.clarifiedQuestion ?? run.question;

  const existingRun = store.activeRunOrNull();
  if (existingRun?.run.id === run.id) {
    sources.push(...existingRun.sources);
    evidenceList.push(...existingRun.evidence);
    claims.push(...existingRun.claims);
    contradictions.push(...existingRun.contradictions);
  }

  const sourceChunks = new Map<string, string[]>();

  const ctx: ResearchRuntimeContext = {
    run,
    config,
    signal,
    store,
    onEvent,
    researchModelId: mainModelId ?? "",
    liteModelId: config.liteModelId,
    liteProviderId: config.liteModelProviderId,
    reasoningMode: config.validateReasoning ? "high" : "disabled",
    reasoningEffort: "high",
    sources,
    evidenceList,
    claims,
    contradictions,
    searchQueriesUsed: [],
    tokenUsage: { input: 0 },
    backgroundContext: "",
    planContextSummary,
    activeResearchPlan,
    clarifiedResearchQuestion,
    sourceChunks,
    getSourceChunks(source: ResearchSource): string[] {
      const cached = sourceChunks.get(source.id);
      if (cached) return cached;
      const text = source.fullText || source.snippet || "";
      const chunks = chunkSourceText(text);
      sourceChunks.set(source.id, chunks);
      return chunks;
    },
    firstSearchError: null,
    captureSearchError(err: unknown): string {
      const msg = getErrorMessage(err);
      if (!ctx.firstSearchError) ctx.firstSearchError = msg;
      return msg;
    },

    checkAbort(): void {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
    },
    bundleEnabled: useSettingsStore.getState().advancedSearchBundleEnabled,
    appendUnique(values: string[] | undefined, value: string): string[] {
      const next = values ? [...values] : [];
      if (!next.includes(value)) next.push(value);
      return next;
    },
    currentClaim(claim: ResearchClaim): ResearchClaim {
      return claims.find((c) => c.id === claim.id) ?? claim;
    },
    async updateRunStatus(
      status: ResearchRunStatus,
      progressPercent: number,
      extra?: Partial<UpdateResearchRunInput>,
    ): Promise<void> {
      await store.updateRun({
        id: run.id,
        status,
        progressPercent,
        ...extra,
      });
    },
    async createStep(
      type: ResearchStepType,
      title: string,
      detail?: string,
    ): Promise<ResearchStep> {
      const step = await store.createStep({
        runId: run.id,
        type,
        title,
        detail,
      });
      await store.updateStep({
        id: step.id,
        status: "running",
        startedAt: nowIso(),
      });
      return { ...step, status: "running" as ResearchStepStatus };
    },
    async completeStep(
      step: ResearchStep,
      output?: string,
      tokensUsed?: number,
    ): Promise<void> {
      await store.updateStep({
        id: step.id,
        status: "completed",
        output,
        completedAt: nowIso(),
        tokensUsed,
      });
    },
    async failStep(
      step: ResearchStep,
      error: string,
    ): Promise<void> {
      await store.updateStep({
        id: step.id,
        status: "failed",
        error,
        completedAt: nowIso(),
      });
    },
    async runAiStep(
      type: ResearchStepType,
      title: string,
      detail: string | undefined,
      aiCall: () => Promise<CallResearchAiResult>,
      formatOutput?: (value: string) => string | undefined,
    ): Promise<{ value: string; step: ResearchStep }> {
      const step = await ctx.createStep(type, title, detail);
      try {
        const result = await aiCall();
        const tot = result.tokens?.totalTokens;
        let tokensUsed: number | undefined;
        if (typeof tot === "number" && tot > 0) {
          tokensUsed = tot;
          ctx.tokenUsage.input += tot;
        }
        const output = formatOutput?.(result.text);
        await ctx.completeStep(step, output, tokensUsed);
        return { value: result.text, step };
      } catch (err) {
        await ctx.failStep(step, getErrorMessage(err));
        throw err;
      }
    },
    updateLocalSource(updatedSource: ResearchSource): void {
      const idx = sources.findIndex((s) => s.id === updatedSource.id);
      if (idx !== -1) sources[idx] = updatedSource;
    },
    researchAiOptions(
      kind: "main" | "lite",
      extra: CallResearchAiOptions = {},
    ): CallResearchAiOptions {
      const routing = getModelForKind(kind);
      return {
        ...extra,
        ...(routing ? { modelId: routing.modelId, providerId: routing.providerId } : {}),
      };
    },
  };

  return ctx;
}
