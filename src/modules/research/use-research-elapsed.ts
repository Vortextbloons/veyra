import { useEffect, useState } from "react";
import type { ResearchRun, ResearchRunStatus } from "./research-types";
import { formatElapsedTime } from "./research-duration";

const ACTIVE_STATUSES: ResearchRunStatus[] = [
  "planning",
  "searching",
  "reading",
  "extracting",
  "verifying",
  "synthesizing",
];

function isTerminal(status: ResearchRunStatus): boolean {
  return status === "completed" || status === "failed";
}

function computeElapsed(run: ResearchRun, now: number): string {
  const startMs = new Date(run.createdAt).getTime();
  if (Number.isNaN(startMs)) return "0s";

  let endMs: number;
  if (isTerminal(run.status) && run.completedAt) {
    const ms = new Date(run.completedAt).getTime();
    endMs = Number.isNaN(ms) ? startMs : ms;
  } else if (ACTIVE_STATUSES.includes(run.status) || run.status === "paused") {
    endMs = now;
  } else {
    return "0s";
  }

  if (Number.isNaN(endMs) || endMs < startMs) return "0s";
  return formatElapsedTime((endMs - startMs) / 1000);
}

/**
 * Returns the elapsed time string for a research run, ticking every second
 * while the run is in flight. Stops ticking once the run reaches a terminal
 * state (completed / failed) — paused runs freeze at the time they paused
 * (resumed runs get a fresh `createdAt` so the timer restarts naturally).
 */
export function useResearchElapsed(run: ResearchRun | undefined | null): string {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    if (!run || isTerminal(run.status)) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [run, run?.id, run?.status]);

  if (!run) return "0s";
  return computeElapsed(run, now);
}
