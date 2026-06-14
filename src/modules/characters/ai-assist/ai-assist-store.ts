// ── AI assist store (Zustand) ────────────────────────────────────────────────
//
// Holds in-flight assist jobs, pending changes, and director sessions.
// Persistence is opt-in (director sessions only); everything else is in-memory.

import { create } from "zustand";
import { newId, nowIso } from "@/lib/id";
import { runCharacterAssist } from "./ai-assist-orchestrator";
import type {
  CharacterAssistAction,
  CharacterAssistChunk,
  CharacterAssistLog,
  CharacterAssistRequest,
  CharacterAssistResult,
  CharacterAssistTelemetryEvent,
  CharacterDirectorMessage,
  CharacterDirectorSession,
  CharacterLorebookTestRun,
  CharacterPendingChange,
} from "./ai-assist-types";
import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "../character-types";
import { evaluateLorebook } from "../lorebook";

const STORAGE_KEY = "veyra.character.assist.directorSessions.v1";
const TELEMETRY_STORAGE_KEY = "veyra.character.assist.telemetry.v1";
const TELEMETRY_MAX_EVENTS = 200;

type JobStatus = "idle" | "running" | "done" | "error" | "cancelled";

interface AssistJob {
  id: string;
  request: CharacterAssistRequest;
  status: JobStatus;
  result: CharacterAssistResult | null;
  error: string | null;
  buffer: string;
  startedAt: string;
  finishedAt?: string;
  controller: AbortController;
}

type DirectorList = Record<string, CharacterDirectorSession>;

interface AssistState {
  jobs: Record<string, AssistJob>;
  pendingChanges: Record<string, CharacterPendingChange>;
  directorSessions: DirectorList;
  telemetryLog: CharacterAssistLog;
  lorebookTestRuns: Record<string, CharacterLorebookTestRun>;

  // Job lifecycle
  startJob: (request: CharacterAssistRequest, context: {
    character?: CharacterRecord;
    paragraph?: string;
    selectedEntries?: CharacterLorebookEntry[];
    userPrompt?: string;
  }) => string;
  cancelJob: (jobId: string) => void;
  clearJob: (jobId: string) => void;

  // Pending changes
  addPendingChange: (change: Omit<CharacterPendingChange, "id" | "createdAt" | "status">) => string;
  discardPendingChange: (id: string) => void;
  markPendingChangeApplied: (id: string) => void;
  clearPendingChangesFor: (characterId: string) => void;

  // Director sessions
  createDirectorSession: (characterId: string) => string;
  appendDirectorMessage: (sessionId: string, message: CharacterDirectorMessage) => void;
  clearDirectorSession: (sessionId: string) => void;
  removeDirectorSession: (sessionId: string) => void;
  getDirectorSession: (characterId: string) => CharacterDirectorSession | null;

  // Lorebook test
  recordLorebookTestRun: (run: Omit<CharacterLorebookTestRun, "id" | "matchedAt">) => string;

  // Telemetry
  logEvent: (event: Omit<CharacterAssistTelemetryEvent, "id" | "ts">) => void;
  clearTelemetry: () => void;
}

function readDirectorSessions(): DirectorList {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DirectorList;
  } catch {
    return {};
  }
}

function writeDirectorSessions(sessions: DirectorList): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore */
  }
}

function readTelemetry(): CharacterAssistLog {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) return { events: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events)) return { events: [] };
    return { events: parsed.events };
  } catch {
    return { events: [] };
  }
}

function writeTelemetry(log: CharacterAssistLog): void {
  try {
    const trimmed = log.events.slice(0, TELEMETRY_MAX_EVENTS);
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify({ events: trimmed }));
  } catch {
    /* ignore */
  }
}

function persistDirector(state: AssistState): void {
  writeDirectorSessions(state.directorSessions);
}
void persistDirector;

function recordTelemetry(state: AssistState, event: CharacterAssistTelemetryEvent): void {
  const next = { events: [event, ...state.telemetryLog.events].slice(0, TELEMETRY_MAX_EVENTS) };
  writeTelemetry(next);
  return;
}

export const useCharacterAssistStore = create<AssistState>((set, get) => ({
  jobs: {},
  pendingChanges: {},
  directorSessions: readDirectorSessions(),
  telemetryLog: readTelemetry(),
  lorebookTestRuns: {},

  startJob: (request, context) => {
    const jobId = newId("assist");
    const controller = new AbortController();
    const job: AssistJob = {
      id: jobId,
      request,
      status: "running",
      result: null,
      error: null,
      buffer: "",
      startedAt: nowIso(),
      controller,
    };
    set((s) => ({ jobs: { ...s.jobs, [jobId]: job } }));

    const startedAtMs = Date.now();
    void (async () => {
      const onChunk = (chunk: CharacterAssistChunk) => {
        if (chunk.kind === "text") {
          set((s) => {
            const j = s.jobs[jobId];
            if (!j) return s;
            return {
              jobs: {
                ...s.jobs,
                [jobId]: { ...j, buffer: typeof chunk.value === "string" ? chunk.value : j.buffer },
              },
            };
          });
        } else if (chunk.kind === "error") {
          set((s) => {
            const j = s.jobs[jobId];
            if (!j) return s;
            return {
              jobs: {
                ...s.jobs,
                [jobId]: { ...j, error: chunk.error ?? "Unknown error", status: "error", finishedAt: nowIso() },
              },
            };
          });
        } else if (chunk.kind === "done") {
          set((s) => {
            const j = s.jobs[jobId];
            if (!j) return s;
            return {
              jobs: { ...s.jobs, [jobId]: { ...j, status: "done", finishedAt: nowIso() } },
            };
          });
        }
      };
      try {
        const result = await runCharacterAssist({
          request,
          character: context.character,
          paragraph: context.paragraph,
          selectedEntries: context.selectedEntries,
          userPrompt: context.userPrompt,
          onChunk,
          signal: controller.signal,
        });
        set((s) => {
          const j = s.jobs[jobId];
          if (!j) return s;
          return {
            jobs: {
              ...s.jobs,
              [jobId]: { ...j, result, status: "done", finishedAt: nowIso() },
            },
          };
        });
        recordTelemetry(get(), {
          id: newId("tele"),
          ts: nowIso(),
          action: request.action,
          characterId: request.characterId,
          outcome: "completed",
          durationMs: Date.now() - startedAtMs,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          set((s) => {
            const j = s.jobs[jobId];
            if (!j) return s;
            return {
              jobs: { ...s.jobs, [jobId]: { ...j, status: "cancelled", finishedAt: nowIso() } },
            };
          });
          recordTelemetry(get(), {
            id: newId("tele"),
            ts: nowIso(),
            action: request.action,
            characterId: request.characterId,
            outcome: "cancelled",
            durationMs: Date.now() - startedAtMs,
          });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          set((s) => {
            const j = s.jobs[jobId];
            if (!j) return s;
            return {
              jobs: {
                ...s.jobs,
                [jobId]: { ...j, status: "error", error: message, finishedAt: nowIso() },
              },
            };
          });
          recordTelemetry(get(), {
            id: newId("tele"),
            ts: nowIso(),
            action: request.action,
            characterId: request.characterId,
            outcome: "failed",
            durationMs: Date.now() - startedAtMs,
            errorKind: "exception",
            errorMessage: message,
          });
        }
      }
    })();

    return jobId;
  },

  cancelJob: (jobId) => {
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      j.controller.abort();
      return {
        jobs: {
          ...s.jobs,
          [jobId]: { ...j, status: "cancelled", finishedAt: nowIso() },
        },
      };
    });
  },

  clearJob: (jobId) => {
    set((s) => {
      const next = { ...s.jobs };
      delete next[jobId];
      return { jobs: next };
    });
  },

  addPendingChange: (change) => {
    const id = newId("pchg");
    const next: CharacterPendingChange = {
      ...change,
      id,
      createdAt: nowIso(),
      status: "pending",
    };
    set((s) => ({ pendingChanges: { ...s.pendingChanges, [id]: next } }));
    return id;
  },

  discardPendingChange: (id) => {
    set((s) => {
      const change = s.pendingChanges[id];
      if (!change) return s;
      return {
        pendingChanges: {
          ...s.pendingChanges,
          [id]: { ...change, status: "discarded" },
        },
      };
    });
  },

  markPendingChangeApplied: (id) => {
    set((s) => {
      const change = s.pendingChanges[id];
      if (!change) return s;
      const next = { ...s.pendingChanges };
      delete next[id];
      return { pendingChanges: next };
    });
  },

  clearPendingChangesFor: (characterId) => {
    set((s) => {
      const next: Record<string, CharacterPendingChange> = {};
      for (const [id, change] of Object.entries(s.pendingChanges)) {
        if (change.characterId !== characterId) next[id] = change;
      }
      return { pendingChanges: next };
    });
  },

  createDirectorSession: (characterId) => {
    const id = newId("dir");
    const session: CharacterDirectorSession = {
      id,
      characterId,
      messages: [],
      pendingChangeIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((s) => {
      const next = { ...s.directorSessions, [id]: session };
      writeDirectorSessions(next);
      return { directorSessions: next };
    });
    return id;
  },

  appendDirectorMessage: (sessionId, message) => {
    set((s) => {
      const existing = s.directorSessions[sessionId];
      if (!existing) return s;
      const next: CharacterDirectorSession = {
        ...existing,
        messages: [...existing.messages, message],
        updatedAt: nowIso(),
      };
      const all = { ...s.directorSessions, [sessionId]: next };
      writeDirectorSessions(all);
      return { directorSessions: all };
    });
  },

  clearDirectorSession: (sessionId) => {
    set((s) => {
      const existing = s.directorSessions[sessionId];
      if (!existing) return s;
      const next: CharacterDirectorSession = {
        ...existing,
        messages: [],
        updatedAt: nowIso(),
      };
      const all = { ...s.directorSessions, [sessionId]: next };
      writeDirectorSessions(all);
      return { directorSessions: all };
    });
  },

  removeDirectorSession: (sessionId) => {
    set((s) => {
      const next = { ...s.directorSessions };
      delete next[sessionId];
      writeDirectorSessions(next);
      return { directorSessions: next };
    });
  },

  getDirectorSession: (characterId) => {
    const sessions = Object.values(get().directorSessions);
    return sessions.find((s) => s.characterId === characterId) ?? null;
  },

  recordLorebookTestRun: (run) => {
    const id = newId("ltest");
    const full: CharacterLorebookTestRun = {
      ...run,
      id,
      matchedAt: nowIso(),
    };
    set((s) => ({ lorebookTestRuns: { ...s.lorebookTestRuns, [id]: full } }));
    return id;
  },

  logEvent: (event) => {
    const full: CharacterAssistTelemetryEvent = {
      ...event,
      id: newId("tele"),
      ts: nowIso(),
    };
    set((s) => {
      const next = { events: [full, ...s.telemetryLog.events].slice(0, TELEMETRY_MAX_EVENTS) };
      writeTelemetry(next);
      return { telemetryLog: next };
    });
  },

  clearTelemetry: () => {
    set(() => {
      const next: CharacterAssistLog = { events: [] };
      writeTelemetry(next);
      return { telemetryLog: next };
    });
  },
}));

// ── Selectors / derived helpers ─────────────────────────────────────────────

export function selectActiveJob(state: AssistState, jobId: string | null): AssistJob | null {
  if (!jobId) return null;
  return state.jobs[jobId] ?? null;
}

export function selectPendingChangesFor(state: AssistState, characterId: string): CharacterPendingChange[] {
  return Object.values(state.pendingChanges).filter(
    (c) => c.characterId === characterId && c.status === "pending",
  );
}

export function selectDirectorSessionFor(
  state: AssistState,
  characterId: string,
): CharacterDirectorSession | null {
  return Object.values(state.directorSessions).find((s) => s.characterId === characterId) ?? null;
}

// ── Lorebook test helper (pure) ─────────────────────────────────────────────

export function runLorebookTestAgainstConversation(character: CharacterRecord, conversation: {
  messages: Array<{ role: string; content: string }>;
}, options?: { scanDepth?: number; maxEntries?: number }) {
  const scanDepth = options?.scanDepth ?? character.chatDefaults?.scanDepth ?? 4;
  const maxEntries = options?.maxEntries ?? character.chatDefaults?.maxLorebookEntries ?? 6;
  return evaluateLorebook(character.lorebookEntries, conversation.messages, {
    scanDepth,
    maxEntries,
  });
}

export type { CharacterAssistAction };
