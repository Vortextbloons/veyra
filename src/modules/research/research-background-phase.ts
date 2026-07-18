import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import type { PhaseResult } from "./research-plan-phase";

const MAX_BACKGROUND_SNIPPETS = 8;

export async function backgroundPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<PhaseResult> {
  // Skip on resume — background context only matters for plan generation,
  // and if we are resuming the plan already exists.
  if (resumeFromPhase) {
    return { continue: true };
  }

  const { run, signal, onEvent } = ctx;

  ctx.checkAbort();
  const bgStep = await ctx.createStep("background", "Gathering background context");
  onEvent({ type: "phase_start", phase: "background", stepId: bgStep.id });
  await ctx.updateRunStatus("searching", 2);

  try {
    const question = run.question;
    const queries = [question, `${question} overview`];

    const snippets: string[] = [];

    for (const query of queries) {
      ctx.checkAbort();
      try {
        const bundle = await runSearch(query, {
          signal,
          skipFetch: true,
          speedPreset: "normal",
        });

        for (const src of bundle.sources) {
          if (snippets.length >= MAX_BACKGROUND_SNIPPETS) break;
          if (src.title && src.snippet) {
            snippets.push(`${src.title}: ${src.snippet}`);
          }
        }
      } catch {
        // Search failure is non-fatal — plan phase works without background context.
      }

      if (snippets.length >= MAX_BACKGROUND_SNIPPETS) break;
    }

    if (snippets.length > 0) {
      ctx.backgroundContext = snippets.join("\n\n");
      await ctx.completeStep(
        bgStep,
        `Collected ${snippets.length} snippets from background searches`,
      );
    } else {
      await ctx.completeStep(bgStep, "No background context gathered (search returned no results)");
    }

    onEvent({ type: "phase_complete", phase: "background", stepId: bgStep.id });
    return { continue: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.failStep(bgStep, msg);
    // Non-fatal — continue to planning anyway.
    onEvent({ type: "phase_complete", phase: "background", stepId: bgStep.id });
    return { continue: true };
  }
}
