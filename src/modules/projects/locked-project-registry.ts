import type { Conversation } from "@/modules/chat/chat-types";
import type { MemoryRecord } from "@/modules/memory/memory-types";

/**
 * Dependency-free registry of lock-enabled project ids.
 *
 * This module deliberately imports only types. `conversation-storage` and the
 * memory store need to filter protected content out of shared snapshots, and
 * both are imported by stores that the richer locked-project module also needs.
 * Keeping the registry free of runtime imports makes the filter safe to use from
 * anywhere without a cycle.
 */

let lockedProjectIds = new Set<string>();

export function setLockedProjectIds(ids: Iterable<string>): Set<string> {
  const previous = lockedProjectIds;
  lockedProjectIds = new Set(ids);
  return previous;
}

export function addLockedProjectId(projectId: string): void {
  lockedProjectIds = new Set(lockedProjectIds).add(projectId);
}

export function removeLockedProjectId(projectId: string): void {
  if (!lockedProjectIds.has(projectId)) return;
  const next = new Set(lockedProjectIds);
  next.delete(projectId);
  lockedProjectIds = next;
}

export function isLockedProjectId(projectId: string | undefined): boolean {
  return Boolean(projectId && lockedProjectIds.has(projectId));
}

export function getLockedProjectIds(): ReadonlySet<string> {
  return lockedProjectIds;
}

/** Drops conversations owned by lock-enabled projects. */
export function stripLockedConversations(conversations: Conversation[]): Conversation[] {
  if (lockedProjectIds.size === 0) return conversations;
  const filtered = conversations.filter(
    (conversation) => !isLockedProjectId(conversation.projectId),
  );
  return filtered.length === conversations.length ? conversations : filtered;
}

/** Drops memory records scoped to lock-enabled projects. */
export function stripLockedMemories(records: MemoryRecord[]): MemoryRecord[] {
  if (lockedProjectIds.size === 0) return records;
  const filtered = records.filter((record) => !isLockedProjectId(record.projectId));
  return filtered.length === records.length ? records : filtered;
}

/** True when a conversation must not be shown or persisted outside its vault. */
export function isProtectedConversation(conversation: Conversation): boolean {
  return isLockedProjectId(conversation.projectId);
}
