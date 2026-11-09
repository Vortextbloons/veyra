import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useMemoryStore } from "@/modules/memory/memory-store";
import { aiScheduler } from "@/lib/ai-scheduler";
import { saveConversationSnapshot, flushConversationSave } from "@/lib/conversation-storage";
import { useVaultSessionStore } from "@/modules/projects/vault-session-store";
import {
  flushLockedConversationSaves,
  saveLockedConversations,
  saveLockedMemories,
} from "@/modules/projects/locked-project-storage";
import type { Conversation } from "@/modules/chat/chat-types";

/**
 * Single owner of the lock transition.
 *
 * Locking is a sequence, not a flag:
 *   1. Conceal the project immediately so no render can keep showing content.
 *   2. Prevent further operations: abort streams, agents, queued jobs.
 *   3. Persist the encrypted writes that are still valid.
 *   4. Clear frontend caches and drop the Rust key.
 *
 * Every step is idempotent and safe to run when the project is already locked,
 * because lock triggers (navigation, blur, suspend, quit) can overlap.
 */

export type LockReason =
  | "navigation"
  | "user"
  | "manual"
  | "idle"
  | "blur"
  | "suspend"
  | "os-lock"
  | "quit"
  | "restart";

type LockListener = (projectId: string, reason: LockReason) => void;
const listeners = new Set<LockListener>();

export function subscribeProjectLocked(listener: LockListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyLocked(projectId: string, reason: LockReason): void {
  for (const listener of listeners) {
    try {
      listener(projectId, reason);
    } catch {
      // A listener failure must not abort the rest of the lock sequence.
    }
  }
}

const inFlightLocks = new Map<string, Promise<void>>();

function projectConversations(projectId: string): Conversation[] {
  return useChatStore.getState().conversations.filter(
    (conversation) => conversation.projectId === projectId,
  );
}

function projectMemories(projectId: string) {
  return useMemoryStore.getState().records.filter((record) => record.projectId === projectId);
}

/** Aborts work that belongs to a project so nothing streams into a locked view. */
function abortProjectWork(projectId: string): void {
  // Stop agent sessions scoped to this project (and any whose workspace path is
  // one of the project's folders, which is how Pi identifies its runs).
  const agent = useAgentStore.getState();
  const sessionProjectIds = new Set([projectId]);
  for (const session of agent.sessions) {
    if (session.projectId === projectId) sessionProjectIds.add(session.id);
  }
  for (const session of agent.sessions) {
    if (session.status === "running" && session.projectId === projectId) {
      agent.stopSession(session.id);
    }
  }

  // Cancel queued and active jobs that reference any of this project's
  // conversations. `conversationId` is the only project-adjacent field the
  // scheduler exposes, so both the raw id and the Pi `agent:` scope are tried.
  const snapshot = aiScheduler.getSchedulerSnapshot();
  const conversationIds = new Set(
    projectConversations(projectId).flatMap((conversation) => [
      conversation.id,
      conversation.agentSession?.id ?? "",
    ]).filter(Boolean),
  );
  if (snapshot.activeJob && snapshot.activeJob.conversationId && conversationIds.has(snapshot.activeJob.conversationId)) {
    aiScheduler.cancelAiJob(snapshot.activeJob.id);
  }
  for (const job of snapshot.queuedJobs) {
    if (job.conversationId && conversationIds.has(job.conversationId)) {
      aiScheduler.cancelAiJob(job.id);
    }
  }
}

async function persistBeforeLock(projectId: string): Promise<void> {
  const conversations = projectConversations(projectId);
  const memories = projectMemories(projectId);
  const generation = useVaultSessionStore.getState().generationFor(projectId);
  if (generation == null) return;

  // Encrypted writes that belong to the project, then wait for them so a crash
  // during/after locking still leaves a consistent vault.
  if (conversations.length > 0) {
    await saveLockedConversations(projectId, conversations);
  }
  if (memories.length > 0) {
    await saveLockedMemories(projectId, memories);
  }
  await flushLockedConversationSaves();
}

/**
 * Clears every in-memory copy of the project's content and asks the backend to
 * drop the key. The shared snapshot is also rewritten so the conversations that
 * were just removed from the store cannot survive in `conversations.enc`.
 */
function clearProjectFromFrontend(projectId: string): void {
  const chat = useChatStore.getState();
  const remaining = chat.conversations.filter(
    (conversation) => conversation.projectId !== projectId,
  );
  const activeRemoved = remaining.length !== chat.conversations.length
    && !remaining.some((conversation) => conversation.id === chat.activeConversationId);
  if (remaining.length !== chat.conversations.length) {
    useChatStore.setState({
      conversations: remaining,
      activeConversationId: activeRemoved ? remaining[0]?.id ?? null : chat.activeConversationId,
    });
  }

  useAgentStore.setState((state) => {
    const sessions = state.sessions.filter((session) => session.projectId !== projectId);
    if (sessions.length === state.sessions.length) return state;
    const activeRemoved = !sessions.some((session) => session.id === state.activeSessionId);
    return { sessions, activeSessionId: activeRemoved ? null : state.activeSessionId };
  });

  useMemoryStore.getState().dropLockedMemories(projectId);
}

export async function lockProjectAndConceal(
  projectId: string,
  reason: LockReason,
): Promise<void> {
  const existing = inFlightLocks.get(projectId);
  if (existing) return existing;

  const run = (async () => {
    const sessionStore = useVaultSessionStore.getState();
    if (sessionStore.generationFor(projectId) == null) {
      // Already locked (or never unlocked). Still make sure nothing stale is on
      // screen, then stop.
      clearProjectFromFrontend(projectId);
      return;
    }

    sessionStore.setPhase(projectId, "locking");
    // 1. Conceal first: the UI must not show the project while we persist.
    notifyLocked(projectId, reason);
    // 2. Stop new work and abort what is running.
    abortProjectWork(projectId);

    try {
      // 3. Commit encrypted writes while the key still exists.
      await persistBeforeLock(projectId);
    } catch (error) {
      // A failed save must not be reported as a clean lock, and the good
      // ciphertext on disk must not be overwritten with a partial state. The
      // error is surfaced through the vault session store for the UI banner.
      useVaultSessionStore.getState().setError(
        projectId,
        `Could not save this project before locking: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // 4. Clear content and drop the key. This runs even when the save failed so
    //    no plaintext remains in the window.
    clearProjectFromFrontend(projectId);
    try {
      await sessionStore.lock(projectId);
    } finally {
      // Rewrite the shared snapshot without the project's conversations so the
      // removed content does not linger in `conversations.enc`.
      void saveConversationSnapshot(useChatStore.getState().conversations);
      await flushConversationSave();
      notifyLocked(projectId, reason);
    }
  })().finally(() => {
    inFlightLocks.delete(projectId);
  });

  inFlightLocks.set(projectId, run);
  return run;
}

/** Locks every unlocked project. Used on OS lock/suspend and app quit. */
export async function lockAllProjectsAndConceal(reason: LockReason): Promise<void> {
  const ids = Object.keys(useVaultSessionStore.getState().sessions);
  await Promise.all(ids.map((id) => lockProjectAndConceal(id, reason)));
  await useVaultSessionStore.getState().lockAll();
}

// ── Automatic lock policies ─────────────────────────────────────────────────

/** Idle time after which an unlocked project auto-locks, when enabled. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleEnabled = false;
let activityListener: (() => void) | null = null;

function hasUnlocked(): boolean {
  return Object.keys(useVaultSessionStore.getState().sessions).length > 0;
}

function scheduleIdleLock(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!idleEnabled || !hasUnlocked()) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!idleEnabled || !hasUnlocked()) return;
    void lockAllProjectsAndConceal("idle");
  }, IDLE_LOCK_MS);
}

/** Enables or disables the optional idle auto-lock policy. */
export function setIdleLockEnabled(enabled: boolean): void {
  idleEnabled = enabled;
  if (enabled && typeof window !== "undefined" && !activityListener) {
    activityListener = () => scheduleIdleLock();
    window.addEventListener("pointerdown", activityListener, { passive: true });
    window.addEventListener("keydown", activityListener, { passive: true });
  }
  if (!enabled && activityListener && typeof window !== "undefined") {
    window.removeEventListener("pointerdown", activityListener);
    window.removeEventListener("keydown", activityListener);
    activityListener = null;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    return;
  }
  scheduleIdleLock();
}

/**
 * Registers focus-loss and OS-suspend triggers. Focus loss locks only when the
 * user opted in: losing focus to a menu, a file dialog, or another window is
 * common and must not interrupt ordinary in-project work by default.
 */
export function installLockLifecycleTriggers(options: {
  lockOnBlur?: () => boolean;
} = {}): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // A hidden window is a real "navigated away" signal for the workspace, but
      // it also fires when opening a native dialog. Only lock when the user has
      // explicitly enabled focus-loss locking.
      if (options.lockOnBlur?.() && hasUnlocked()) {
        void lockAllProjectsAndConceal("blur");
      }
    }
  };

  const onPageHide = () => {
    if (hasUnlocked()) void lockAllProjectsAndConceal("suspend");
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
}

/** Session generation guard for late async callbacks. */
export function isCurrentSession(projectId: string, generation: number | null): boolean {
  if (generation == null) return false;
  return useVaultSessionStore.getState().generationFor(projectId) === generation;
}
