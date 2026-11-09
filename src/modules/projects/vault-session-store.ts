import { create } from "zustand";
import {
  getVaultStatus,
  listUnlockedVaults,
  lockAllProjects,
  lockProject,
  unlockProject,
  type VaultStatus,
} from "@/lib/project-vault";

/**
 * Locked-project session state.
 *
 * This store tracks *which* projects are unlocked in this window and the
 * generation each unlock produced. It never holds a password, a key, or any
 * decrypted project content: content lives in `locked-project-data` and is
 * cleared the moment a project locks.
 *
 * The phase here is a mirror of the Rust lifecycle, not the authority. Every
 * protected call still passes through a backend check, so tampering with this
 * store cannot read a locked project.
 */

export type ProjectLockPhase = "locked" | "unlocking" | "unlocked" | "locking";

type UnlockedSession = {
  generation: number;
  unlockedAt: string;
};

type VaultSessionStore = {
  sessions: Record<string, UnlockedSession>;
  phases: Record<string, ProjectLockPhase>;
  /** Set when an unlock attempt failed, keyed by project id. */
  errors: Record<string, string | undefined>;
  /** True once startup reconciliation with the backend has run. */
  reconciled: boolean;

  phaseFor: (projectId: string) => ProjectLockPhase;
  sessionFor: (projectId: string) => UnlockedSession | undefined;
  isUnlocked: (projectId: string) => boolean;
  generationFor: (projectId: string) => number | null;

  reconcile: () => Promise<void>;
  hydrateStatus: (projectId: string) => Promise<VaultStatus>;
  unlock: (projectId: string, password: string) => Promise<void>;
  registerUnlocked: (projectId: string, session: UnlockedSession) => void;
  lock: (projectId: string) => Promise<void>;
  lockAll: () => Promise<string[]>;
  setPhase: (projectId: string, phase: ProjectLockPhase) => void;
  setError: (projectId: string, error: string | undefined) => void;
  forget: (projectId: string) => void;
};

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export const useVaultSessionStore = create<VaultSessionStore>((set, get) => ({
  sessions: {},
  phases: {},
  errors: {},
  reconciled: false,

  phaseFor: (projectId) => get().phases[projectId] ?? "locked",
  sessionFor: (projectId) => get().sessions[projectId],
  isUnlocked: (projectId) => Boolean(get().sessions[projectId]),
  generationFor: (projectId) => get().sessions[projectId]?.generation ?? null,

  /**
   * Runs once on startup. A restart must always begin locked, so any state the
   * backend reports is adopted rather than assumed, and anything the backend
   * does not know about is dropped.
   */
  reconcile: async () => {
    try {
      const unlocked = new Set(await listUnlockedVaults());
      const sessions: Record<string, UnlockedSession> = {};
      for (const projectId of Object.keys(get().sessions)) {
        if (!unlocked.has(projectId)) continue;
        const status = await getVaultStatus(projectId);
        if (status.phase === "unlocked" && status.generation != null && status.unlockedAt) {
          sessions[projectId] = {
            generation: status.generation,
            unlockedAt: status.unlockedAt,
          };
        }
      }
      set({ sessions, reconciled: true, phases: {} });
    } catch {
      // If the backend cannot answer, nothing is unlocked. Fail closed.
      set({ sessions: {}, reconciled: true, phases: {} });
    }
  },

  hydrateStatus: async (projectId) => {
    const status = await getVaultStatus(projectId);
    set((state) => ({
      phases: { ...state.phases, [projectId]: status.phase },
      sessions:
        status.phase === "unlocked" && status.generation != null && status.unlockedAt
          ? {
              ...state.sessions,
              [projectId]: {
                generation: status.generation,
                unlockedAt: status.unlockedAt,
              },
            }
          : without(state.sessions, projectId),
    }));
    return status;
  },

  unlock: async (projectId, password) => {
    set((state) => ({
      phases: { ...state.phases, [projectId]: "unlocking" },
      errors: { ...state.errors, [projectId]: undefined },
    }));
    try {
      const result = await unlockProject(projectId, password);
      set((state) => ({
        sessions: {
          ...state.sessions,
          [projectId]: { generation: result.generation, unlockedAt: result.unlockedAt },
        },
        phases: { ...state.phases, [projectId]: "unlocked" },
        errors: { ...state.errors, [projectId]: undefined },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: without(state.sessions, projectId),
        phases: { ...state.phases, [projectId]: "locked" },
        errors: { ...state.errors, [projectId]: message },
      }));
      throw error;
    }
  },

  registerUnlocked: (projectId, session) => {
    set((state) => ({
      sessions: { ...state.sessions, [projectId]: session },
      phases: { ...state.phases, [projectId]: "unlocked" },
      errors: { ...state.errors, [projectId]: undefined },
    }));
  },

  lock: async (projectId) => {
    set((state) => ({
      phases: { ...state.phases, [projectId]: "locking" },
    }));
    try {
      await lockProject(projectId);
    } finally {
      // Local state is dropped even if the backend call failed, so no UI path
      // can keep showing a project it no longer has a live session for.
      set((state) => ({
        sessions: without(state.sessions, projectId),
        phases: { ...state.phases, [projectId]: "locked" },
      }));
    }
  },

  lockAll: async () => {
    const ids = Object.keys(get().sessions);
    if (ids.length === 0) return [];
    try {
      return await lockAllProjects();
    } finally {
      set({ sessions: {}, phases: {} });
    }
  },

  setPhase: (projectId, phase) => {
    set((state) => ({ phases: { ...state.phases, [projectId]: phase } }));
  },

  setError: (projectId, error) => {
    set((state) => ({ errors: { ...state.errors, [projectId]: error } }));
  },

  forget: (projectId) => {
    set((state) => ({
      sessions: without(state.sessions, projectId),
      phases: without(state.phases, projectId),
      errors: without(state.errors, projectId),
    }));
  },
}));
