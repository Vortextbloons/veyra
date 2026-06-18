import type { ResearchPlan } from "./research-types";
import { useResearchStore } from "./research-store";
import { listen } from "@tauri-apps/api/event";

const PLAN_APPROVAL_MAX_WAIT_MS = 30 * 60 * 1000;
const PLAN_APPROVAL_POLL_MS = 1500;

function planApprovedRunId(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object" && "runId" in payload) {
    const id = (payload as { runId: unknown }).runId;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  }
  return null;
}

export async function waitForPlanApproval(
  runId: string,
  signal: AbortSignal,
): Promise<ResearchPlan | null> {
  if (signal.aborted) return null;

  const store = useResearchStore.getState();

  return new Promise((resolve) => {
    let settled = false;
    let unlisten: (() => void) | undefined;

    const finish = (plan: ResearchPlan | null) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (pollTimer) clearInterval(pollTimer);
      unlisten?.();
      signal.removeEventListener("abort", onAbort);
      resolve(plan);
    };

    const onAbort = () => finish(null);
    signal.addEventListener("abort", onAbort, { once: true });

    const timeoutTimer = setTimeout(() => finish(null), PLAN_APPROVAL_MAX_WAIT_MS);
    const pollTimer = setInterval(() => {
      void (async () => {
        try {
          await store.loadRun(runId);
          const plan = store.activeRunOrNull()?.run?.plan;
          if (plan?.userApproved) finish(plan);
        } catch {
          // Ignore transient load errors during polling.
        }
      })();
    }, PLAN_APPROVAL_POLL_MS);

    void listen<unknown>("research://plan-approved", async (event) => {
      if (planApprovedRunId(event.payload) !== runId) return;
      try {
        await store.loadRun(runId);
        finish(store.activeRunOrNull()?.run?.plan ?? null);
      } catch (err) {
        console.warn("[research-runtime] Failed to load approved run:", err);
      }
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      console.warn("[research-runtime] Failed to subscribe to plan approval:", err);
    });

  });
}
