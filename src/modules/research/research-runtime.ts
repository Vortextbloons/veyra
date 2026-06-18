import { useResearchStore } from "./research-store";
import { aiScheduler } from "@/lib/ai-scheduler";
import type { ResearchRun, ResearchRuntimeEvent } from "./research-types";
import { createResearchRuntimeContext, type ResearchRunOverride } from "./research-runtime-context";
import { planPhase } from "./research-plan-phase";
import { searchPhase } from "./research-search-phase";
import { readPhase } from "./research-read-phase";
import { extractPhase } from "./research-extract-phase";
import { verifyPhase, validatePhase } from "./research-verify-phase";
import { gapPhase } from "./research-gap-phase";
import { synthesisPhase } from "./research-synthesis-phase";
import { nowIso } from "./research-source-utils";
import { clearClaimSimilarityCaches } from "./research-claim-similarity";

export type { ResearchRuntimeEvent, ResearchRunOverride };

// ── Per-run overrides ──────────────────────────────────────────────────────

/** Per-run overrides keyed by run id — survives pause/resume within a session. */
const perRunOverrideByRunId = new Map<string, ResearchRunOverride>();

// ── Public API ─────────────────────────────────────────────────────────────

export type ResumePhase = "plan" | "search" | "read" | "validate" | "extract" | "verify" | "gap" | "synthesize";

export function enqueueResearchRunJob(
  run: ResearchRun,
  mode: "start" | "resume",
  perRunOverride?: ResearchRunOverride,
): void {
  if (mode === "start" && perRunOverride && Object.keys(perRunOverride).length > 0) {
    perRunOverrideByRunId.set(run.id, perRunOverride);
  }
  const effectiveOverride =
    perRunOverride ?? (mode === "resume" ? perRunOverrideByRunId.get(run.id) : undefined);

  const title = mode === "resume"
    ? `Resume: ${run.question}`
    : `Research: ${run.question}`;

  aiScheduler.enqueueAiJob({
    type: "research_run",
    priority: 0,
    title,
    description: run.question.length > 80 ? `${run.question.slice(0, 80)}…` : run.question,
    run: async (jobSignal) => {
      const pauseController = new AbortController();
      useResearchStore.getState().setActiveController(pauseController);
      const combined = AbortSignal.any([jobSignal, pauseController.signal]);
      const onEvent = (event: ResearchRuntimeEvent) => {
        useResearchStore.getState().applyRuntimeEvent(event);
      };
      try {
        if (mode === "resume") {
          await resumeResearchRun(run, combined, onEvent, effectiveOverride);
        } else {
          await executeResearchRun(run, combined, onEvent, undefined, effectiveOverride);
        }
      } finally {
        useResearchStore.getState().setActiveController(null);
        useResearchStore.setState({
          isPausing: false,
          validateProgress: { done: 0, total: 0 },
          extractProgress: { done: 0, total: 0 },
          contradictionProgress: { done: 0, total: 0 },
          auditProgress: { done: 0, total: 0 },
          filteredEvidenceCount: { lowSignificance: 0, tooShort: 0, emptyContent: 0 },
        });
      }
    },
  });
}

export async function enqueueResearchResume(runId: string): Promise<void> {
  const store = useResearchStore.getState();
  await store.loadRun(runId);
  const run = store.activeRun?.run;
  if (!run) return;
  enqueueResearchRunJob(run, "resume", perRunOverrideByRunId.get(run.id));
}

export async function executeResearchRun(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: (event: ResearchRuntimeEvent) => void,
  resumeFromPhase?: ResumePhase,
  perRunOverride?: ResearchRunOverride,
): Promise<void> {
  const store = useResearchStore.getState();

  // Clear module-level caches between runs to prevent stale data bleeding across runs.
  clearClaimSimilarityCaches();

  // Create shared context for this run
  const ctx = createResearchRuntimeContext(run, signal, onEvent, resumeFromPhase, perRunOverride);

  // Mark any "running" steps from a previous aborted execution as failed
  if (resumeFromPhase && store.activeRun) {
    const existing = store.activeRun;
    for (const step of existing.steps) {
      if (step.status === "running") {
        await store.updateStep({ id: step.id, status: "failed", error: "Interrupted — resumed", completedAt: nowIso() });
      }
    }
  }

  try {
    // ── Phase 1: Plan ──────────────────────────────────────────────────────
    const planResult = await planPhase(ctx, resumeFromPhase);
    if (!planResult.continue) return;

    // ── Phase 2: Search ────────────────────────────────────────────────────
    ctx.checkAbort();
    await searchPhase(ctx, planResult.planSteps, resumeFromPhase);

    // ── Phase 3: Read ──────────────────────────────────────────────────────
    ctx.checkAbort();
    await readPhase(ctx, resumeFromPhase);

    // ── Phase 4: Validate ──────────────────────────────────────────────────
    ctx.checkAbort();
    await validatePhase(ctx);

    // ── Phase 5: Extract ────────────────────────────────────────────────────
    ctx.checkAbort();
    await extractPhase(ctx, resumeFromPhase);

    // ── Phase 6: Verify ────────────────────────────────────────────────────
    ctx.checkAbort();
    await verifyPhase(ctx, resumeFromPhase);

    // ── Phase 7: Gap Analysis ──────────────────────────────────────────────
    ctx.checkAbort();
    const activeSources = ctx.sources.filter((s) =>
      s.status === "read" &&
      s.sourceQuality?.relevant !== false &&
      (typeof s.sourceQuality?.quality !== "number" || s.sourceQuality.quality >= ctx.config.minSourceQuality)
    );
    await gapPhase(ctx, activeSources);

    // ── Phase 8: Synthesize ────────────────────────────────────────────────
    ctx.checkAbort();
    await synthesisPhase(ctx, resumeFromPhase);

    // ── Phase 9: Finalize ──────────────────────────────────────────────────
    await ctx.updateRunStatus("completed", 100, {
      completedAt: nowIso(),
      totalTokensUsed: ctx.tokenUsage.input > 0 ? ctx.tokenUsage.input : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isPaused = store.isPausing;
    const status = isPaused ? "paused" : "failed";

    if (isPaused) {
      console.info("[research-runtime] Research run paused:", message);
    } else {
      console.error("[research-runtime] Research run failed:", message, error);
    }

    onEvent({ type: "error", error: message });

    await store.updateRun({
      id: run.id,
      status,
      error: isPaused ? undefined : message,
      completedAt: isPaused ? undefined : nowIso(),
    });

    store.setActiveController(null);
    // Reset isPausing after handling
    if (isPaused) {
      useResearchStore.setState({ isPausing: false });
    }
  }
}

export function resumeResearchRun(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: (event: ResearchRuntimeEvent) => void,
  perRunOverride?: ResearchRunOverride,
): Promise<void> {
  const store = useResearchStore.getState();
  const steps = store.activeRun?.steps ?? [];

  const hasCompleted = (type: string) =>
    steps.some((s) => s.type === type && s.status === "completed");

  let resumePhase: ResumePhase;
  if (hasCompleted("synthesize")) {
    resumePhase = "synthesize";
  } else if (hasCompleted("verify")) {
    resumePhase = "synthesize";
  } else if (hasCompleted("validate")) {
    resumePhase = "extract";
  } else if (hasCompleted("extract")) {
    resumePhase = "verify";
  } else if (hasCompleted("read")) {
    resumePhase = "validate";
  } else if (hasCompleted("search")) {
    resumePhase = "read";
  } else if (hasCompleted("plan")) {
    resumePhase = "search";
  } else {
    resumePhase = "plan";
  }

  console.info(`[research-runtime] Resuming from phase: ${resumePhase}`);
  return executeResearchRun(run, signal, onEvent, resumePhase, perRunOverride);
}
