import { useEffect, useRef, useState } from "react";
import { useCharacterAssistStore } from "./ai-assist-store";
import type { CharacterAssistRequest } from "./ai-assist-types";

/**
 * Subscribes to a job and exposes the current streaming buffer. Returns the
 * most recent buffer state, a "running" flag, and a cancel function.
 */
export function useAssistJob(jobId: string | null) {
  const job = useCharacterAssistStore((s) => (jobId ? s.jobs[jobId] : null));
  const cancelJob = useCharacterAssistStore((s) => s.cancelJob);
  const clearJob = useCharacterAssistStore((s) => s.clearJob);

  useEffect(() => {
    return () => {
      if (jobId) {
        // Don't clear while running; just leave it for the consumer to read.
      }
    };
  }, [jobId]);

  return {
    job: job ?? null,
    running: job?.status === "running",
    error: job?.error ?? null,
    result: job?.result ?? null,
    buffer: job?.buffer ?? "",
    cancel: () => jobId && cancelJob(jobId),
    clear: () => jobId && clearJob(jobId),
  };
}

/**
 * Cancel a request when the calling component unmounts.
 */
export function useCancelOnUnmount(jobId: string | null) {
  const cancelJob = useCharacterAssistStore((s) => s.cancelJob);
  const ref = useRef(jobId);
  ref.current = jobId;
  useEffect(() => {
    return () => {
      if (ref.current) cancelJob(ref.current);
    };
  }, [cancelJob]);
}

/**
 * Lightweight hook to start a one-shot assist request and track the job id.
 */
export function useAssistRunner() {
  const [jobId, setJobId] = useState<string | null>(null);
  const startJob = useCharacterAssistStore((s) => s.startJob);
  const cancelJob = useCharacterAssistStore((s) => s.cancelJob);

  const start = (request: CharacterAssistRequest, context: Parameters<typeof startJob>[1]) => {
    cancelJobIfRunning();
    const id = startJob(request, context);
    setJobId(id);
    return id;
  };

  const cancelJobIfRunning = () => {
    if (jobId) cancelJob(jobId);
  };

  const reset = () => setJobId(null);

  return { jobId, start, cancel: cancelJobIfRunning, reset };
}
