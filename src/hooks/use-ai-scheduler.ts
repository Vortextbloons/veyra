import { useSyncExternalStore } from "react";
import { aiScheduler, type AiSchedulerSnapshot } from "@/lib/ai-scheduler";

function subscribe(listener: () => void): () => void {
  return aiScheduler.subscribeToScheduler(listener);
}

function getSnapshot(): AiSchedulerSnapshot {
  return aiScheduler.getSchedulerSnapshot();
}

export function useAiScheduler(): AiSchedulerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
