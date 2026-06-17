import { create } from "zustand";
import type {
  AgentEvent,
  AgentMode,
  AgentSession,
  AgentStatus,
  PiSession,
  StartAgentSessionInput,
} from "@/modules/agents/agent-types";
import {
  checkPiAvailable,
  deletePiSession,
  listPiSessions,
  runPiAgent,
  stopPiAgent,
} from "@/modules/agents/pi-runtime";
import { asRecord } from "@/lib/utils";

const sessionAbortControllers = new Map<string, AbortController>();
let startSessionChain: Promise<void> = Promise.resolve();

function abortAgentSession(sessionId: string): void {
  const controller = sessionAbortControllers.get(sessionId);
  controller?.abort();
  sessionAbortControllers.delete(sessionId);
  void stopPiAgent(sessionId).catch(() => undefined);
}

type AgentStore = {
  sessions: AgentSession[];
  activeSessionId: string | null;
  runtimeAvailable: boolean | null;
  runtimeStatus: AgentStatus;
  mode: AgentMode;
  projectPath: string;
  selectedModel: string;
  setMode: (mode: AgentMode) => void;
  setProjectPath: (projectPath: string) => void;
  setSelectedModel: (model: string) => void;
  setActiveSessionId: (id: string | null) => void;
  checkRuntime: () => Promise<void>;
  loadProjectSessions: (projectPath: string) => Promise<void>;
  loadPiSession: (sessionId: string) => Promise<void>;
  newSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  startSession: (input: StartAgentSessionInput) => Promise<string>;
  stopSession: (id: string) => void;
  clearSessions: () => void;
};

function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed || "Agent task";
}

function event(type: AgentEvent["type"], title: string, detail?: string): AgentEvent {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    at: Date.now(),
  };
}

function stripAnsi(value: string) {
  const esc = String.fromCharCode(27);
  const bel = String.fromCharCode(7);
  return value
    .replace(new RegExp(`${esc}\\][^${bel}]*(?:${bel}|${esc}\\\\)`, "g"), "")
    .replace(new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, "g"), "")
    .replace(new RegExp(`${esc}[@-_]`, "g"), "")
    .trim();
}

function shortValue(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function toolDetail(
  args: Record<string, unknown> | null,
  result: Record<string, unknown> | null,
  isError: boolean,
): string | undefined {
  const argParts: string[] = [];
  if (args) {
    for (const value of Object.values(args)) {
      if (typeof value === "string" && value.trim()) {
        argParts.push(shortValue(value));
      }
    }
  }
  const resultParts: string[] = [];
  if (result) {
    const output = typeof result.output === "string" ? result.output : undefined;
    if (output) resultParts.push(shortValue(output));
    if (isError) resultParts.push("error");
  }
  return [...argParts, ...resultParts].filter(Boolean).join(" · ") || undefined;
}

function parsePiEvent(raw: { stream: "stdout" | "stderr"; line: string }): AgentEvent | null {
  const line = raw.line.trim();
  if (!line) return null;

  if (raw.stream === "stderr") {
    return event("error", "Pi stderr", stripAnsi(line));
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";

    switch (type) {
      case "agent_start":
        return event("status", "Started");

      case "turn_start":
        return null;

      case "message_update": {
        const assistantEvent = asRecord(parsed.assistantMessageEvent);
        if (!assistantEvent) return null;
        const eventType = typeof assistantEvent.type === "string" ? assistantEvent.type : "";

        if (eventType === "text_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("output", "Pi stream", delta) : null;
        }

        if (eventType === "text_end") {
          return null;
        }

        if (eventType === "thinking_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("reasoning", "Reasoning", delta) : null;
        }

        return null;
      }

      case "tool_execution_start": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const args = asRecord(parsed.args);
        return event("tool", toolName, toolDetail(args, null, false));
      }

      case "tool_execution_update": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const partial = asRecord(parsed.partialResult);
        return event("tool", toolName, toolDetail(null, partial, false));
      }

      case "tool_execution_end": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const result = asRecord(parsed.result);
        const isError = parsed.isError === true;
        return event("tool", toolName, toolDetail(null, result, isError));
      }

      case "turn_end":
        return null;

      case "agent_end":
        return event("result", "Completed");

      default:
        return null;
    }
  } catch {
    return event("status", "Pi event", line.startsWith("{") ? undefined : stripAnsi(line));
  }
}

function modelDetail(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return "Pi model: default";
  const normalized = trimmed.replace(/[\\/]+$/, "");
  const [provider, modelId] = normalized.split("/");
  if (!provider || !modelId) {
    return `Pi model: lmstudio/${normalized}`;
  }
  return `Pi model: ${normalized}`;
}

function patchSession(
  sessions: AgentSession[],
  id: string,
  patch: Partial<AgentSession>,
) {
  return sessions.map((session) =>
    session.id === id ? { ...session, ...patch } : session,
  );
}

function appendLiveOutput(events: AgentEvent[], nextEvent: AgentEvent): AgentEvent[] {
  if (nextEvent.type !== "output" || nextEvent.title !== "Pi stream" || !nextEvent.detail) {
    return [...events, nextEvent];
  }

  const lastPromptIndex = events.findLastIndex(
    (item) => item.type === "status" && item.title === "Prompt",
  );
  const lastOutputIndex = events.findLastIndex(
    (item, index) =>
      index > lastPromptIndex &&
      item.type === "output" &&
      item.title === "Pi stream",
  );
  if (lastOutputIndex === -1) return [...events, nextEvent];

  const current = events[lastOutputIndex];
  const currentText = current.detail ?? "";
  const nextText = nextEvent.detail;
  const detail = nextText.startsWith(currentText)
    ? nextText
    : [currentText, nextText].filter(Boolean).join("");

  const updated = events.slice();
  updated[lastOutputIndex] = { ...current, detail, at: nextEvent.at };
  return updated;
}

function placeholderFromPiSession(session: PiSession): AgentSession {
  return {
    id: session.id,
    runtime: "pi",
    mode: "ask",
    status: "ready",
    projectPath: session.directory ?? "",
    prompt: "",
    model: "",
    piSessionId: session.id,
    title: session.title || "Pi session",
    startedAt: session.created || session.updated || Date.now(),
    endedAt: session.updated,
    events: [],
  };
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  runtimeAvailable: null,
  runtimeStatus: "idle",
  mode: "ask",
  projectPath: "",
  selectedModel: "",
  setMode: (mode) => set({ mode }),
  setProjectPath: (projectPath) => {
    for (const session of get().sessions) {
      if (session.status === "running") {
        abortAgentSession(session.id);
      }
    }
    set({ projectPath, activeSessionId: null, sessions: [] });
  },
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setActiveSessionId: (activeSessionId) => {
    const session = activeSessionId
      ? get().sessions.find((item) => item.id === activeSessionId)
      : null;
    set({
      activeSessionId,
      ...(session
        ? {
            mode: session.mode,
            projectPath: session.projectPath,
          }
        : {}),
    });
  },
  checkRuntime: async () => {
    set({ runtimeStatus: "checking_runtime" });
    const available = await checkPiAvailable();
    set({ runtimeAvailable: available, runtimeStatus: available ? "idle" : "failed" });
  },
  loadProjectSessions: async (projectPath) => {
    const sessions = await listPiSessions(projectPath).catch(() => []);
    set((state) => {
      const existing = new Map(state.sessions.map((session) => [session.piSessionId ?? session.id, session]));
      const hydrated = sessions.map((item) => {
        const current = existing.get(item.id);
        if (current && (current.status === "running" || current.events.length > 0)) return current;
        return placeholderFromPiSession(item);
      });
      const projectKey = projectPath.trim();
      const localOnlyForProject = state.sessions.filter(
        (session) =>
          !session.piSessionId &&
          session.projectPath.trim() === projectKey &&
          session.status === "running",
      );
      const nextSessions = [...hydrated, ...localOnlyForProject];
      const activeSessionId = nextSessions.some((session) => session.id === state.activeSessionId)
        ? state.activeSessionId
        : nextSessions[0]?.id ?? null;
      const activeSession = activeSessionId
        ? nextSessions.find((session) => session.id === activeSessionId)
        : null;
      return {
        sessions: nextSessions,
        activeSessionId,
        ...(activeSession
          ? { mode: activeSession.mode, projectPath: activeSession.projectPath }
          : {}),
      };
    });
  },
  loadPiSession: async (sessionId) => {
    const current = get().sessions.find((session) => session.id === sessionId);
    if (!current?.piSessionId || current.events.length > 0) return;
  },
  newSession: () => set({ activeSessionId: null }),
  deleteSession: async (sessionId) => {
    const current = get().sessions.find((session) => session.id === sessionId);
    if (!current) return;
    if (current.status === "running") {
      abortAgentSession(sessionId);
    }
    if (current.piSessionId) {
      await deletePiSession(current.projectPath || get().projectPath);
    }
    set((state) => {
      const sessions = state.sessions.filter((session) => session.id !== sessionId);
      const activeSessionId = state.activeSessionId === sessionId
        ? sessions[0]?.id ?? null
        : state.activeSessionId;
      const activeSession = activeSessionId
        ? sessions.find((session) => session.id === activeSessionId)
        : null;
      return {
        sessions,
        activeSessionId,
        ...(activeSession
          ? { mode: activeSession.mode, projectPath: activeSession.projectPath }
          : {}),
      };
    });
  },
  startSession: async (input) => {
    const waitFor = startSessionChain;
    let unlock: () => void = () => {};
    startSessionChain = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await waitFor;

    try {
      if (get().sessions.some((session) => session.status === "running")) {
        const running = get().sessions.find((session) => session.status === "running");
        return running?.id ?? "";
      }

      const activeSession = get().activeSessionId
        ? get().sessions.find((item) => item.id === get().activeSessionId)
        : null;
      const inputProjectPath = input.projectPath.trim();
      const activeProjectPath = activeSession?.projectPath.trim() ?? "";
      const projectPath = activeSession && inputProjectPath === "" ? activeProjectPath : inputProjectPath;
      const mode = input.mode;
      const shouldContinue = Boolean(
        activeSession &&
          activeSession.status !== "running" &&
          (activeSession.piSessionId || activeSession.mode === input.mode) &&
          activeProjectPath === projectPath,
      );
      const id = shouldContinue && activeSession ? activeSession.id : crypto.randomUUID();
      const now = Date.now();
      const session: AgentSession = {
        id,
        runtime: "pi",
        mode,
        status: "running",
        projectPath,
        prompt: input.prompt.trim(),
        model: input.model,
        title: titleFromPrompt(input.prompt),
        startedAt: now,
        events: [
          ...(shouldContinue && activeSession ? activeSession.events : []),
          event(
            "status",
            shouldContinue ? "Message sent" : "Session started",
            [
              projectPath ? `Workspace: ${projectPath}` : null,
              modelDetail(input.model),
            ]
              .filter(Boolean)
              .join("\n") || undefined,
          ),
          event("status", "Prompt", input.prompt.trim()),
        ],
      };

      set((state) => ({
        sessions: shouldContinue
          ? patchSession(state.sessions, id, {
              status: "running",
              prompt: input.prompt.trim(),
              mode,
              projectPath,
              model: input.model,
              events: session.events,
              exitCode: undefined,
              endedAt: undefined,
            })
          : [session, ...state.sessions],
        activeSessionId: id,
      }));

      try {
        const abortController = new AbortController();
        sessionAbortControllers.set(id, abortController);

        const result = await runPiAgent(
          {
            sessionId: id,
            mode,
            projectPath,
            prompt: input.prompt.trim(),
            model: input.model,
            contextLength: input.contextLength,
            reservedOutputTokens: input.reservedOutputTokens,
            providerId: input.providerId,
            reasoningEnabled: input.reasoningEnabled,
          },
          (rawEvent) => {
            const parsedEvent = parsePiEvent(rawEvent);
            if (!parsedEvent) return;
            set((state) => {
              const current = state.sessions.find((item) => item.id === id);
              if (!current || current.status !== "running") return state;
              return {
                sessions: patchSession(state.sessions, id, {
                  events: appendLiveOutput(current.events, parsedEvent),
                }),
              };
            });
          },
          { signal: abortController.signal },
        );

        sessionAbortControllers.delete(id);

        const currentSession = get().sessions.find((item) => item.id === id);
        if (currentSession?.status === "stopped" || abortController.signal.aborted) {
          return id;
        }

        const failed = result.exitCode !== 0;
        const stderrText = stripAnsi(result.stderr);
        const currentEvents = get().sessions.find((item) => item.id === id)!.events;
        const events = [
          ...currentEvents,
          ...(stderrText
            ? [event(failed ? "error" : "output", "Pi stderr", stderrText)]
            : []),
          event(
            failed ? "error" : "result",
            failed ? "Turn failed" : "Turn completed",
            failed ? `Exit code: ${result.exitCode ?? "unknown"}` : undefined,
          ),
        ];
        set((state) => ({
          sessions: patchSession(state.sessions, id, {
            status: failed ? "failed" : "ready",
            summary: failed ? "Pi could not complete the turn." : undefined,
            endedAt: Date.now(),
            exitCode: failed ? result.exitCode : undefined,
            events,
          }),
        }));
      } catch (error) {
        sessionAbortControllers.delete(id);
        const current = get().sessions.find((item) => item.id === id);
        if (current?.status === "stopped") {
          return id;
        }
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const failedSession = state.sessions.find((item) => item.id === id);
          if (failedSession?.status === "stopped") return state;
          return {
            runtimeAvailable: state.runtimeAvailable,
            sessions: patchSession(state.sessions, id, {
              status: "failed",
              summary: "Pi could not complete the task.",
              endedAt: Date.now(),
              events: [
                ...(failedSession?.events ?? []),
                event("error", "Failed to run Pi", message),
              ],
            }),
          };
        });
      }

      return id;
    } finally {
      unlock();
    }
  },
  stopSession: (id) => {
    abortAgentSession(id);
    set((state) => {
      const current = state.sessions.find((item) => item.id === id);
      if (!current || current.status !== "running") return state;
      return {
        sessions: patchSession(state.sessions, id, {
          status: "stopped",
          endedAt: Date.now(),
          events: [...current.events, event("status", "Session stopped")],
        }),
      };
    });
  },
  clearSessions: () => {
    for (const session of get().sessions) {
      if (session.status === "running") {
        abortAgentSession(session.id);
      }
    }
    set({ sessions: [], activeSessionId: null });
  },
}));
