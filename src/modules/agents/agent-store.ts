import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgentEvent,
  AgentMode,
  AgentSession,
  AgentStatus,
  StartAgentSessionInput,
} from "@/modules/agents/agent-types";
import {
  checkPiAvailable,
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

function event(
  type: AgentEvent["type"],
  title: string,
  detail?: string,
  toolCallId?: string,
  sequence?: number,
): AgentEvent {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    at: Date.now(),
    ...(sequence != null ? { sequence } : {}),
    ...(toolCallId ? { toolCallId } : {}),
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
    if (argParts.length === 0 && Object.keys(args).length > 0) {
      argParts.push(shortValue(JSON.stringify(args)));
    }
  }
  const resultParts: string[] = [];
  if (result) {
    const output = typeof result.output === "string" ? result.output : undefined;
    if (output) {
      resultParts.push(shortValue(output));
    } else if (Object.keys(result).length > 0) {
      resultParts.push(shortValue(JSON.stringify(result)));
    }
    if (isError) resultParts.push("error");
  }
  return [...argParts, ...resultParts].filter(Boolean).join(" · ") || undefined;
}

function parseToolCallId(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.toolCallId,
    record.callId,
    record.call_id,
    record.tool_call_id,
    record.tool_use_id,
    record.toolUseId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function isPlaceholderToolDetail(detail?: string): boolean {
  const normalized = detail?.trim();
  return !normalized || normalized === "Running tool";
}

function parsePiEvent(raw: { stream: "stdout" | "stderr"; line: string; sequence: number }): AgentEvent | null {
  const line = raw.line.trim();
  if (!line) return null;

  if (raw.stream === "stderr") {
    return event("error", "Pi stderr", stripAnsi(line), undefined, raw.sequence);
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";

    switch (type) {
      case "agent_start":
        return null;

      case "turn_start":
        return null;

      case "message_update": {
        const assistantEvent = asRecord(parsed.assistantMessageEvent);
        if (!assistantEvent) return null;
        const eventType = typeof assistantEvent.type === "string" ? assistantEvent.type : "";

        if (eventType === "text_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("output", "Pi stream", delta, undefined, raw.sequence) : null;
        }

        if (eventType === "text_end") {
          return null;
        }

        if (eventType === "thinking_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("reasoning", "Reasoning", delta, undefined, raw.sequence) : null;
        }

        return null;
      }

      case "tool_execution_start": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const args = asRecord(parsed.args);
        return event("tool", toolName, toolDetail(args, null, false), toolCallId, raw.sequence);
      }

      case "tool_execution_update": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const partial = asRecord(parsed.partialResult);
        return event("tool", toolName, toolDetail(null, partial, false), toolCallId, raw.sequence);
      }

      case "tool_execution_end": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const result = asRecord(parsed.result);
        const isError = parsed.isError === true;
        return event("tool", toolName, toolDetail(null, result, isError), toolCallId, raw.sequence);
      }

      case "turn_end":
        return null;

      case "message_end": {
        const msg = asRecord(parsed.message);
        if (msg && typeof msg.role === "string" && msg.role === "assistant") {
          const usage = asRecord(msg.usage);
          if (usage && typeof usage.input === "number") {
            return event("token_update", "Token update", String(usage.input), undefined, raw.sequence);
          }
        }
        return null;
      }

      case "agent_end":
        return event("result", "Completed", undefined, undefined, raw.sequence);

      default:
        return null;
    }
  } catch {
    return event("status", "Pi event", line.startsWith("{") ? undefined : stripAnsi(line), undefined, raw.sequence);
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
  const baseEvents = events;

  // Merge only back-to-back reasoning deltas so tool/output blocks stay in order.
  if (nextEvent.type === "reasoning" && nextEvent.title === "Reasoning") {
    const last = baseEvents.at(-1);
    if (last?.type === "reasoning" && last.title === "Reasoning") {
      const currentText = last.detail ?? "";
      const nextText = nextEvent.detail ?? "";
      const detail = nextText.startsWith(currentText)
        ? nextText
        : [currentText, nextText].filter(Boolean).join("");
      const updated = baseEvents.slice();
      updated[updated.length - 1] = { ...last, detail, at: nextEvent.at };
      return updated;
    }
    return [...baseEvents, nextEvent];
  }

  // Merge tool events so each call stays in one slot.
  if (nextEvent.type === "tool") {
    if (nextEvent.toolCallId) {
      const existingIndex = baseEvents.findLastIndex(
        (item) => item.type === "tool" && item.toolCallId === nextEvent.toolCallId,
      );
      if (existingIndex !== -1) {
        const current = baseEvents[existingIndex];
        const updated = baseEvents.slice();
        updated[existingIndex] = {
          ...current,
          ...nextEvent,
          title: nextEvent.title || current.title,
          detail: nextEvent.detail?.trim() ? nextEvent.detail : current.detail,
          at: nextEvent.at,
          toolCallId: current.toolCallId ?? nextEvent.toolCallId,
        };
        return updated.filter(
          (item, index) =>
            index === existingIndex ||
            item.type !== "tool" ||
            item.toolCallId !== nextEvent.toolCallId,
        );
      }
    } else {
      const last = baseEvents.at(-1);
      if (
        last?.type === "tool" &&
        last.title === nextEvent.title &&
        (isPlaceholderToolDetail(last.detail) ||
          isPlaceholderToolDetail(nextEvent.detail) ||
          (last.detail?.trim() ?? "") === (nextEvent.detail?.trim() ?? ""))
      ) {
        const updated = baseEvents.slice();
        updated[updated.length - 1] = {
          ...last,
          ...nextEvent,
          title: nextEvent.title || last.title,
          detail: nextEvent.detail?.trim() ? nextEvent.detail : last.detail,
          at: nextEvent.at,
        };
        return updated;
      }
    }

    return [...baseEvents, nextEvent];
  }

  if (!nextEvent.detail) {
    return [...baseEvents, nextEvent];
  }

  if (nextEvent.type !== "output" || nextEvent.title !== "Pi stream") {
    return [...baseEvents, nextEvent];
  }

  const last = baseEvents.at(-1);
  if (last?.type === "output" && last.title === "Pi stream") {
    const currentText = last.detail ?? "";
    const nextText = nextEvent.detail;
    const detail = nextText.startsWith(currentText)
      ? nextText
      : [currentText, nextText].filter(Boolean).join("");
    const updated = baseEvents.slice();
    updated[updated.length - 1] = { ...last, detail, at: nextEvent.at };
    return updated;
  }

  return [...baseEvents, nextEvent];
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      runtimeAvailable: null,
      runtimeStatus: "idle",
      mode: "plan",
      projectPath: "",
      selectedModel: "",
      setMode: (mode) => set((state) => {
        const active = state.activeSessionId
          ? state.sessions.find((s) => s.id === state.activeSessionId)
          : null;
        const currentProjectPath = state.projectPath.trim();
        return {
          mode,
          ...(active && active.status !== "running" && active.projectPath.trim() === currentProjectPath
            ? { sessions: patchSession(state.sessions, active.id, { mode }) }
            : {}),
        };
      }),
      setProjectPath: (projectPath) => {
        for (const session of get().sessions) {
          if (session.status === "running") {
            abortAgentSession(session.id);
          }
        }
        set({ projectPath, activeSessionId: null });
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
        set((state) => {
          const projectKey = projectPath.trim();
          const visibleSessions = state.sessions.filter(
            (session) =>
              session.projectPath.trim() === projectKey,
          );
          const activeSessionId = visibleSessions.some((session) => session.id === state.activeSessionId)
            ? state.activeSessionId
            : visibleSessions[0]?.id ?? null;
          const activeSession = activeSessionId
            ? visibleSessions.find((session) => session.id === activeSessionId)
            : null;
          return {
            projectPath,
            activeSessionId,
            ...(activeSession ? { mode: activeSession.mode } : {}),
          };
        });
      },
      newSession: () => set({ activeSessionId: null }),
      deleteSession: async (sessionId) => {
        const current = get().sessions.find((session) => session.id === sessionId);
        if (!current) return;
        if (current.status === "running") {
          abortAgentSession(sessionId);
        }
        set((state) => {
          const sessions = state.sessions.filter((session) => session.id !== sessionId);
          const deletedProject = current.projectPath.trim();
          const activeSessionId = state.activeSessionId === sessionId
            ? sessions.find((session) => session.projectPath.trim() === deletedProject)?.id ?? null
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
      const requestedProjectPath = input.projectPath.trim();
      if (
        get().sessions.some(
          (session) => session.status === "running" && session.projectPath.trim() === requestedProjectPath,
        )
      ) {
        const running = get().sessions.find(
          (session) => session.status === "running" && session.projectPath.trim() === requestedProjectPath,
        );
        return running?.id ?? "";
      }

      const activeSession = get().activeSessionId
        ? get().sessions.find(
            (item) => item.id === get().activeSessionId && item.projectPath.trim() === requestedProjectPath,
          )
        : null;
      const activeProjectPath = activeSession?.projectPath.trim() ?? "";
      const projectPath = activeSession && requestedProjectPath === "" ? activeProjectPath : requestedProjectPath;
      const mode = input.mode;
      const shouldContinue = Boolean(
        activeSession &&
          activeSession.status !== "running" &&
          activeProjectPath === projectPath &&
          activeSession.mode === mode,
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
            if (parsedEvent.type === "token_update") {
              const tokens = parseInt(parsedEvent.detail ?? "0", 10);
              if (tokens > 0) {
                set((state) => {
                  const current = state.sessions.find((item) => item.id === id);
                  if (!current || current.status !== "running") return state;
                  return {
                    sessions: patchSession(state.sessions, id, {
                      contextTokens: tokens,
                    }),
                  };
                });
              }
              return;
            }
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
        const currentSessionEvents = get().sessions.find((item) => item.id === id);
        const currentEvents = currentSessionEvents?.events ?? [];
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
    }),
    {
      name: "veyra-agent-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions.filter((session) => session.status !== "running"),
        activeSessionId: state.sessions.some(
          (session) => session.id === state.activeSessionId && session.status !== "running",
        )
          ? state.activeSessionId
          : null,
        mode: state.mode,
        projectPath: state.projectPath,
        selectedModel: state.selectedModel,
      }),
    },
  ),
);
