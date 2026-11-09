import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import type { Conversation } from "@/modules/chat/chat-types";
import type { MemoryRecord } from "@/modules/memory/memory-types";
import {
  deleteVaultRecord,
  readVaultJson,
  writeVaultRecord,
  type VaultRecordKind,
} from "@/lib/project-vault";
import { useVaultSessionStore } from "@/modules/projects/vault-session-store";
import {
  addLockedProjectId,
  getLockedProjectIds,
  isLockedProjectId,
  removeLockedProjectId,
  setLockedProjectIds,
  stripLockedConversations,
  stripLockedMemories,
} from "@/modules/projects/locked-project-registry";

export { stripLockedConversations, stripLockedMemories };

/**
 * Partitioning rules for locked projects.
 *
 * A lock-enabled project's conversations and memories must never reach:
 *   * the shared `conversations.enc` snapshot,
 *   * `localStorage` (agent store),
 *   * the shared `memory.json` snapshot,
 *   * global retrieval or background extraction.
 *
 * Instead they are read from and written to the project's own vault, keyed by
 * the project id, and only while that project is unlocked.
 *
 * This module is the single place where a conversation or memory is turned into
 * a vault record or filtered out of a shared collection.
 */

const CONVERSATION_KIND: VaultRecordKind = "conversation";
const MEMORY_KIND: VaultRecordKind = "memory";
const DRAFT_KIND: VaultRecordKind = "draft";

const saveQueueByProject = new Map<string, Promise<void>>();
const lastSavedRevision = new Map<string, number>();

function conversationKey(projectId: string, conversationId: string): string {
  return `conversation:${projectId}:${conversationId}`;
}

function memoryKey(projectId: string, memoryId: string): string {
  return `memory:${projectId}:${memoryId}`;
}

/** Projects that own a vault and therefore must stay out of shared storage. */
export function lockedProjectIds(): Set<string> {
  const { sessions } = useVaultSessionStore.getState();
  // An open vault is unambiguously locked-by-design even if the registry has
  // not caught up yet, so union both sources.
  return new Set([...getLockedProjectIds(), ...Object.keys(sessions)]);
}

export function isLockedProject(projectId: string | undefined): boolean {
  if (!projectId) return false;
  return isLockedProjectId(projectId)
    || Boolean(useVaultSessionStore.getState().sessions[projectId]);
}

/**
 * Registers the authoritative set of lock-enabled projects and removes any
 * protected conversation still sitting in the shared stores.
 */
export function registerLockedProjectIds(ids: Iterable<string>): void {
  const previous = setLockedProjectIds(ids);
  for (const projectId of getLockedProjectIds()) {
    if (previous.has(projectId)) continue;
    purgeProjectFromSharedStores(projectId);
  }
}

export function markProjectLocked(
  projectId: string,
  options: { purgeSharedStores?: boolean } = {},
): void {
  const alreadyLocked = isLockedProjectId(projectId);
  addLockedProjectId(projectId);
  if (!alreadyLocked && (options.purgeSharedStores ?? true)) {
    purgeProjectFromSharedStores(projectId);
  }
}

export function forgetLockedProjectId(projectId: string): void {
  removeLockedProjectId(projectId);
}

/**
 * Immediately removes a project's conversations and sessions from the shared
 * stores. Runs synchronously so the next shared save cannot include them.
 */
function purgeProjectFromSharedStores(projectId: string): void {
  const chat = useChatStore.getState();
  const protectedConversations = chat.conversations.filter(
    (conversation) => conversation.projectId === projectId,
  );
  if (protectedConversations.length > 0) {
    useChatStore.setState({
      conversations: chat.conversations.filter(
        (conversation) => conversation.projectId !== projectId,
      ),
      activeConversationId:
        protectedConversations.some((c) => c.id === chat.activeConversationId)
          ? null
          : chat.activeConversationId,
    });
  }
  useAgentStore.setState((state) => {
    const sessions = state.sessions.filter((session) => session.projectId !== projectId);
    if (sessions.length === state.sessions.length) return state;
    const activeRemoved = state.sessions.some(
      (session) => session.id === state.activeSessionId && session.projectId === projectId,
    );
    return {
      sessions,
      activeSessionId: activeRemoved ? null : state.activeSessionId,
    };
  });
}

// ── Locked conversations ────────────────────────────────────────────────────

/** Reads one locked conversation. Throws when the project is not unlocked. */
export async function readLockedConversation(
  projectId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) {
    throw new Error("Unlock this project to open its conversations.");
  }
  return readVaultJson<Conversation>(projectId, generation, CONVERSATION_KIND, conversationId);
}

export async function listLockedConversations(projectId: string): Promise<Conversation[]> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) {
    throw new Error("Unlock this project to open its conversations.");
  }
  const { listVaultRecords } = await import("@/lib/project-vault");
  const summaries = await listVaultRecords(projectId, generation, CONVERSATION_KIND);
  const conversations: Conversation[] = [];
  for (const summary of summaries) {
    const conversation = await readVaultJson<Conversation>(
      projectId,
      generation,
      CONVERSATION_KIND,
      summary.id,
    );
    if (conversation) conversations.push(conversation);
  }
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * Writes locked conversations to their vault with per-project serialization so
 * two saves cannot interleave and a stale write cannot land after a newer one.
 */
export function saveLockedConversations(
  projectId: string,
  conversations: Conversation[],
): Promise<void> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) {
    // Locking is intentional: there is no session to write to, so queued work
    // for this project is simply dropped rather than resurrected later.
    return Promise.resolve();
  }
  const previous = saveQueueByProject.get(projectId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const currentGeneration = useVaultSessionStore.getState().generationFor(projectId);
      if (currentGeneration == null) return;
      const scoped = conversations.filter((conversation) => conversation.projectId === projectId);
      const keep = new Set(scoped.map((conversation) => conversation.id));
      // Delete records whose conversations were removed while unlocked.
      const { listVaultRecords } = await import("@/lib/project-vault");
      const existing = await listVaultRecords(projectId, currentGeneration, CONVERSATION_KIND);
      for (const summary of existing) {
        if (!keep.has(summary.id)) {
          await deleteVaultRecord(projectId, currentGeneration, CONVERSATION_KIND, summary.id);
        }
      }
      for (const conversation of scoped) {
        const revision = await writeVaultRecord(
          projectId,
          currentGeneration,
          CONVERSATION_KIND,
          conversation.id,
          conversation,
        );
        lastSavedRevision.set(conversationKey(projectId, conversation.id), revision);
      }
    });
  saveQueueByProject.set(
    projectId,
    next.catch(() => undefined),
  );
  return next;
}

export async function flushLockedConversationSaves(): Promise<void> {
  const pending = [...saveQueueByProject.values()];
  await Promise.all(pending.map((queue) => queue.catch(() => undefined)));
}

export async function deleteLockedConversation(
  projectId: string,
  conversationId: string,
): Promise<void> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return;
  await deleteVaultRecord(projectId, generation, CONVERSATION_KIND, conversationId);
}

// ── Locked memories ─────────────────────────────────────────────────────────

export async function readLockedMemories(projectId: string): Promise<MemoryRecord[]> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) {
    throw new Error("Unlock this project to read its memories.");
  }
  const { listVaultRecords } = await import("@/lib/project-vault");
  const summaries = await listVaultRecords(projectId, generation, MEMORY_KIND);
  const records: MemoryRecord[] = [];
  for (const summary of summaries) {
    const record = await readVaultJson<MemoryRecord>(
      projectId,
      generation,
      MEMORY_KIND,
      summary.id,
    );
    if (record) records.push(record);
  }
  return records;
}

export async function saveLockedMemories(
  projectId: string,
  records: MemoryRecord[],
): Promise<void> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return;
  const previous = saveQueueByProject.get(`memory:${projectId}`) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = useVaultSessionStore.getState().generationFor(projectId);
      if (current == null) return;
      const scoped = records.filter((record) => record.projectId === projectId);
      const keep = new Set(scoped.map((record) => record.id));
      const { listVaultRecords } = await import("@/lib/project-vault");
      const existing = await listVaultRecords(projectId, current, MEMORY_KIND);
      for (const summary of existing) {
        if (!keep.has(summary.id)) {
          await deleteVaultRecord(projectId, current, MEMORY_KIND, summary.id);
        }
      }
      for (const record of scoped) {
        await writeVaultRecord(projectId, current, MEMORY_KIND, record.id, record);
      }
    });
  saveQueueByProject.set(
    `memory:${projectId}`,
    next.catch(() => undefined),
  );
  return next;
}

export async function deleteAllLockedMemories(projectId: string): Promise<void> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return;
  const { listVaultRecords } = await import("@/lib/project-vault");
  const existing = await listVaultRecords(projectId, generation, MEMORY_KIND);
  for (const summary of existing) {
    await deleteVaultRecord(projectId, generation, MEMORY_KIND, summary.id);
  }
}

// ── Drafts ──────────────────────────────────────────────────────────────────

/** Composer drafts are protected content and never go to localStorage. */
export async function readLockedDraft(
  projectId: string,
  draftId: string,
): Promise<string | null> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return null;
  const record = await readVaultJson<{ text: string }>(
    projectId,
    generation,
    DRAFT_KIND,
    draftId,
  );
  return record?.text ?? null;
}

export async function writeLockedDraft(
  projectId: string,
  draftId: string,
  text: string,
): Promise<void> {
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return;
  if (!text.trim()) {
    await deleteVaultRecord(projectId, generation, DRAFT_KIND, draftId);
    return;
  }
  await writeVaultRecord(projectId, generation, DRAFT_KIND, draftId, { text });
}

export function memoryKeyFor(projectId: string, memoryId: string): string {
  return memoryKey(projectId, memoryId);
}

export function conversationKeyFor(projectId: string, conversationId: string): string {
  return conversationKey(projectId, conversationId);
}

/** Clears in-memory bookkeeping when a project is forgotten or deleted. */
export function forgetLockedProject(projectId: string): void {
  forgetLockedProjectId(projectId);
  saveQueueByProject.delete(projectId);
  saveQueueByProject.delete(`memory:${projectId}`);
  for (const key of [...lastSavedRevision.keys()]) {
    if (key.startsWith(`conversation:${projectId}:`)) lastSavedRevision.delete(key);
  }
}
