type MemoryDeletion = { sourceType: "chat" | "agent"; sourceId: string } | { projectId: string };
const deletedSources = new Set<string>();
const deletedProjects = new Set<string>();
const listeners = new Set<() => void>();

export function isMemorySourceDeleted(sourceType: "chat" | "agent", sourceId: string, projectId?: string): boolean {
  return deletedSources.has(JSON.stringify([sourceType, sourceId])) || Boolean(projectId && deletedProjects.has(projectId));
}

export function subscribeMemoryDeletion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidatePendingMemoryExtraction(): void {
  for (const listener of listeners) listener();
}

/** Invalidate pending work synchronously, before asynchronous encrypted cleanup. */
export function notifyMemoryDeletion(deletion: MemoryDeletion): void {
  if ("projectId" in deletion) deletedProjects.add(deletion.projectId);
  else deletedSources.add(JSON.stringify([deletion.sourceType, deletion.sourceId]));
  invalidatePendingMemoryExtraction();
  void import("./memory-store").then(async ({ useMemoryStore, removeMemoriesBySource }) => {
    if ("projectId" in deletion) await useMemoryStore.getState().clearMemories(deletion.projectId);
    else await removeMemoriesBySource(deletion.sourceType, deletion.sourceId);
  }).catch(() => {
    // The store retains the persistence error for the memory settings screen.
  });
}
