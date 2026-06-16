import type { ResearchRun, ResearchRunStatus, ResearchStepStatus } from "./research-types";
import { updateResearchRun as apiUpdateRun, getResearchRun as apiGetRun, updateResearchStep as apiUpdateStep } from "./research-storage";

export const ACTIVE_RESEARCH_RUN_STATUSES: ResearchRunStatus[] = [
  "planning",
  "searching",
  "reading",
  "extracting",
  "verifying",
  "synthesizing",
];

export const RESEARCH_INTERRUPTED_MESSAGE =
  "Research was interrupted when the app closed. Resume to continue.";

export function isActiveResearchRunStatus(status: ResearchRunStatus): boolean {
  return ACTIVE_RESEARCH_RUN_STATUSES.includes(status);
}

async function pauseRunInDatabase(run: ResearchRun): Promise<ResearchRun> {
  try {
    const full = await apiGetRun(run.id);
    const runningSteps = full.steps.filter((step) => step.status === "running");
    await Promise.all(
      runningSteps.map((step) =>
        apiUpdateStep({
          id: step.id,
          status: "failed" as ResearchStepStatus,
          error: "Interrupted when the app closed",
          completedAt: new Date().toISOString(),
        }),
      ),
    );
  } catch (err) {
    console.warn("[research-lifecycle] Failed to reconcile steps for run", run.id, err);
  }

  return apiUpdateRun({
    id: run.id,
    status: "paused",
    error: RESEARCH_INTERRUPTED_MESSAGE,
  });
}

/** Mark a single run paused when it was left active after an unclean exit. */
export async function reconcileStaleResearchRun(run: ResearchRun): Promise<ResearchRun> {
  if (!isActiveResearchRunStatus(run.status)) return run;
  return pauseRunInDatabase(run);
}

/** Mark in-flight runs as paused after an unclean exit or failed shutdown. */
export async function reconcileInterruptedResearchRuns(
  runs: ResearchRun[],
): Promise<ResearchRun[]> {
  const stale = runs.filter((run) => isActiveResearchRunStatus(run.status));
  if (stale.length === 0) return runs;

  const pausedById = new Map<string, ResearchRun>();
  await Promise.all(
    stale.map(async (run) => {
      try {
        pausedById.set(run.id, await pauseRunInDatabase(run));
      } catch (err) {
        console.warn("[research-lifecycle] Failed to pause stale run", run.id, err);
        pausedById.set(run.id, {
          ...run,
          status: "paused",
          error: RESEARCH_INTERRUPTED_MESSAGE,
        });
      }
    }),
  );

  return runs.map((run) => pausedById.get(run.id) ?? run);
}
