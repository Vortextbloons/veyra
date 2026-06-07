import { create } from "zustand";
import type {
  AgentEvent,
  AgentMode,
  AgentSession,
  AgentStatus,
  OpencodeProjectSession,
  StartAgentSessionInput,
} from "@/modules/agents/agent-types";
import {
  checkOpencodeAvailable,
  deleteOpencodeSession,
  exportOpencodeSession,
  listOpencodeProjectSessions,
  runOpencodeAgent,
} from "@/modules/agents/opencode-runtime";

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
  loadOpencodeSession: (sessionId: string) => Promise<void>;
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

function eventAt(type: AgentEvent["type"], title: string, detail: string | undefined, at: number): AgentEvent {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    at,
  };
}

type ParsedOpencodeOutput = {
  sessionId?: string;
  text: string;
  contextTokens?: number;
};

type OpencodeLiveEvent = {
  stream: "stdout" | "stderr";
  line: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function opencodeErrorMessage(root: Record<string, unknown> | null): string | undefined {
  const error = asRecord(root?.error);
  const data = asRecord(error?.data);
  return stringField(data, "message") ?? stringField(error, "message") ?? stringField(error, "name");
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return asRecord(record?.[key]);
}

function firstStringField(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = stringField(record, key);
      if (value) return value;
    }
  }
  return undefined;
}

function shortValue(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function opencodeStepTitle(type: string): string {
  switch (type) {
    case "step-start":
    case "step_start":
      return "Started step";
    case "step-finish":
    case "step_finish":
      return "Finished step";
    default:
      return type.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase());
  }
}

function toolEventDetail(root: Record<string, unknown> | null, part: Record<string, unknown> | null): string | undefined {
  const input = nestedRecord(part, "input") ?? nestedRecord(root, "input");
  const output = nestedRecord(part, "output") ?? nestedRecord(root, "output");
  const source = [input, output, part, root];
  const primary = firstStringField(source, [
    "description",
    "command",
    "path",
    "file",
    "filePath",
    "pattern",
    "query",
    "url",
  ]);
  const secondary = firstStringField(source, ["status", "state", "message", "summary"]);
  return [primary, secondary].filter(Boolean).map((item) => shortValue(item!)).join(" · ") || undefined;
}

function parseOpencodeLiveEvent(input: OpencodeLiveEvent): AgentEvent | null {
  const line = input.line.trim();
  if (!line) return null;

  if (input.stream === "stderr") {
    return event("error", "OpenCode stderr", stripAnsi(line));
  }

  try {
    const parsed = JSON.parse(line) as unknown;
    const root = asRecord(parsed);
    const part = asRecord(root?.part);
    const metadata = asRecord(root?.metadata);
    if (root?.synthetic === true || metadata?.compaction_continue === true) return null;

    const rootType = stringField(root, "type");
    const partType = stringField(part, "type");
    const type = partType ?? rootType ?? "event";
    if (type === "step-start" || type === "step-finish") return null;
    const toolName =
      stringField(part, "tool") ??
      stringField(part, "toolName") ??
      stringField(part, "name") ??
      stringField(root, "tool") ??
      stringField(root, "toolName") ??
      stringField(root, "name");
    const visibleText =
      stringField(part, "text") ??
      stringField(part, "content") ??
      stringField(root, "text") ??
      stringField(root, "content") ??
      stringField(root, "delta");

    if (rootType === "error") {
      return event("error", "OpenCode error", opencodeErrorMessage(root) ?? "OpenCode reported an error.");
    }

    if (type === "reasoning") {
      return event("reasoning", "Reasoning", visibleText || "Thinking");
    }

    if (type.toLowerCase().includes("tool") || toolName) {
      return event(
        "tool",
        toolName ? toolName.replace(/[_-]+/g, " ") : opencodeStepTitle(type),
        toolEventDetail(root, part),
      );
    }

    if (visibleText) {
      return event("output", "OpenCode stream", visibleText);
    }

    return event("status", opencodeStepTitle(type), toolEventDetail(root, part));
  } catch {
    return event("status", "OpenCode event", line.startsWith("{") ? undefined : stripAnsi(line));
  }
}

function parseOpencodeJsonOutput(stdout: string): ParsedOpencodeOutput {
  const text: string[] = [];
  let sessionId: string | undefined;
  let contextTokens: number | undefined;
  let sawJson = false;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        sessionID?: string;
        type?: string;
        synthetic?: boolean;
        text?: string;
        content?: string;
        delta?: string;
        metadata?: { compaction_continue?: boolean };
        message?: { content?: string };
        part?: { text?: string; content?: string; sessionID?: string; type?: string; tokens?: { total?: number } };
        tokens?: { total?: number };
      };
      sawJson = true;
      sessionId = parsed.sessionID ?? parsed.part?.sessionID ?? sessionId;
      const totalTokens = parsed.part?.tokens?.total ?? parsed.tokens?.total;
      if (typeof totalTokens === "number") {
        contextTokens = Math.max(contextTokens ?? 0, totalTokens);
      }
      if (parsed.synthetic || parsed.metadata?.compaction_continue) continue;
      const type = parsed.part?.type ?? parsed.type;
      if (type === "reasoning" || type === "step-start" || type === "step-finish") continue;
      const visibleText =
        parsed.part?.text ??
        parsed.part?.content ??
        parsed.text ??
        parsed.content ??
        parsed.delta ??
        parsed.message?.content;
      if (typeof visibleText === "string" && visibleText.trim()) {
        text.push(visibleText.trim());
      }
    } catch {
      text.push(trimmed);
    }
  }

  const parsedText = text.join("\n").trim();
  if (parsedText) return { sessionId, text: parsedText, contextTokens };
  if (sawJson) return { sessionId, text: "", contextTokens };

  return { sessionId, text: stripAnsi(stdout), contextTokens };
}

function stripAnsi(value: string) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

function modelDetail(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return "Opencode model: default";
  const normalized = trimmed.replace(/[\\/]+$/, "");
  const [provider, modelId] = normalized.split("/");
  if (!provider || !modelId) {
    return `Opencode model: lmstudio/${normalized}`;
  }
  return `Opencode model: ${normalized}`;
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
  if (nextEvent.type !== "output" || nextEvent.title !== "OpenCode stream" || !nextEvent.detail) {
    return [...events, nextEvent];
  }

  const lastPromptIndex = events.findLastIndex(
    (item) => item.type === "status" && item.title === "Prompt",
  );
  const lastOutputIndex = events.findLastIndex(
    (item, index) =>
      index > lastPromptIndex &&
      item.type === "output" &&
      item.title === "OpenCode stream",
  );
  if (lastOutputIndex === -1) return [...events, nextEvent];

  const current = events[lastOutputIndex];
  const currentText = current.detail ?? "";
  const nextText = nextEvent.detail;
  const detail = nextText.startsWith(currentText)
    ? nextText
    : [currentText, nextText].filter(Boolean).join("");

  return events.map((item, index) =>
    index === lastOutputIndex ? { ...current, detail, at: nextEvent.at } : item,
  );
}

function placeholderFromOpencodeSession(session: OpencodeProjectSession): AgentSession {
  return {
    id: session.id,
    runtime: "opencode",
    mode: "ask",
    status: "ready",
    projectPath: session.directory ?? "",
    prompt: "",
    model: "",
    opencodeSessionId: session.id,
    title: session.title || "OpenCode session",
    startedAt: session.created || session.updated || Date.now(),
    endedAt: session.updated,
    events: [],
  };
}

function exportedPartDetail(part: Record<string, unknown>): string | undefined {
  const state = asRecord(part.state);
  const input = asRecord(state?.input);
  const metadata = asRecord(state?.metadata);
  return firstStringField([input, state, metadata, part], [
    "description",
    "command",
    "filePath",
    "path",
    "pattern",
    "query",
    "status",
  ]);
}

function sessionFromExport(fallback: AgentSession, exported: unknown): AgentSession {
  const root = asRecord(exported);
  const messages = Array.isArray(root?.messages) ? root.messages : [];
  const events: AgentEvent[] = [];
  let prompt = fallback.prompt;
  let mode: AgentMode = fallback.mode;
  let model = fallback.model;
  let startedAt = fallback.startedAt;
  let endedAt = fallback.endedAt;
  let contextTokens = fallback.contextTokens;

  for (const message of messages) {
    const msg = asRecord(message);
    const info = asRecord(msg?.info);
    const role = stringField(info, "role");
    const created = asRecord(info?.time)?.created;
    const at = typeof created === "number" ? created : Date.now();
    const agent = stringField(info, "agent");
    if (agent === "build" || agent === "plan" || agent === "ask") mode = agent;
    model = stringField(info, "modelID") ?? model;
    startedAt = Math.min(startedAt, at);
    endedAt = Math.max(endedAt ?? at, at);

    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    for (const rawPart of parts) {
      const part = asRecord(rawPart);
      if (!part) continue;
      const type = stringField(part, "type");
      const tokens = asRecord(part.tokens);
      const totalTokens = tokens?.total;
      if (typeof totalTokens === "number") {
        contextTokens = Math.max(contextTokens ?? 0, totalTokens);
      }
      if (role === "user" && type === "text") {
        const text = stringField(part, "text");
        if (text) {
          prompt = text;
          events.push(eventAt("status", "Prompt", text, at));
        }
        continue;
      }
      if (role !== "assistant") continue;
      if (type === "reasoning") {
        events.push(eventAt("reasoning", "Reasoning", stringField(part, "text") || "Thinking", at));
      } else if (type === "text") {
        const text = stringField(part, "text");
        if (text) events.push(eventAt("output", "Opencode", text, at));
      } else if (type === "tool") {
        const tool = stringField(part, "tool") ?? "tool";
        const state = asRecord(part.state);
        const status = stringField(state, "status");
        events.push(eventAt("tool", tool.replace(/[_-]+/g, " "), exportedPartDetail(part) ?? status ?? "Tool call", at));
      }
    }
  }

  return {
    ...fallback,
    mode,
    model,
    prompt,
    startedAt,
    endedAt,
    contextTokens,
    events,
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
  setProjectPath: (projectPath) => set({ projectPath, activeSessionId: null, sessions: [] }),
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
    const available = await checkOpencodeAvailable();
    set({ runtimeAvailable: available, runtimeStatus: available ? "idle" : "failed" });
  },
  loadProjectSessions: async (projectPath) => {
    const sessions = await listOpencodeProjectSessions(projectPath);
    set((state) => {
      const existing = new Map(state.sessions.map((session) => [session.opencodeSessionId ?? session.id, session]));
      const hydrated = sessions.map((item) => {
        const current = existing.get(item.id);
        if (current && (current.status === "running" || current.events.length > 0)) return current;
        return placeholderFromOpencodeSession(item);
      });
      const projectKey = projectPath.trim();
      const localOnlyForProject = state.sessions.filter(
        (session) =>
          !session.opencodeSessionId &&
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
  loadOpencodeSession: async (sessionId) => {
    const current = get().sessions.find((session) => session.id === sessionId);
    if (!current?.opencodeSessionId || current.events.length > 0) return;
    const exported = await exportOpencodeSession(current.projectPath || get().projectPath, current.opencodeSessionId);
    set((state) => {
      const hydrated = sessionFromExport(current, exported);
      return {
        sessions: patchSession(state.sessions, sessionId, hydrated),
        ...(state.activeSessionId === sessionId
          ? { mode: hydrated.mode, projectPath: hydrated.projectPath }
          : {}),
      };
    });
  },
  newSession: () => set({ activeSessionId: null }),
  deleteSession: async (sessionId) => {
    const current = get().sessions.find((session) => session.id === sessionId);
    if (!current) return;
    if (current.opencodeSessionId) {
      await deleteOpencodeSession(current.projectPath || get().projectPath, current.opencodeSessionId);
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
    const activeSession = get().activeSessionId
      ? get().sessions.find((item) => item.id === get().activeSessionId)
      : null;
    const inputProjectPath = input.projectPath.trim();
    const activeProjectPath = activeSession?.projectPath.trim() ?? "";
    const projectPath = activeSession && inputProjectPath === "" ? activeProjectPath : inputProjectPath;
    const mode = activeSession?.opencodeSessionId && activeSession.status !== "running"
      ? activeSession.mode
      : input.mode;
    const shouldContinue = Boolean(
      activeSession &&
        activeSession.status !== "running" &&
        (activeSession.opencodeSessionId || activeSession.mode === input.mode) &&
        activeProjectPath === projectPath,
    );
    const id = shouldContinue && activeSession ? activeSession.id : crypto.randomUUID();
    const now = Date.now();
    const session: AgentSession = {
      id,
      runtime: "opencode",
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
      const result = await runOpencodeAgent(
        {
          sessionId: id,
          mode,
          projectPath,
          prompt: input.prompt.trim(),
          model: input.model,
          contextLength: input.contextLength,
          reservedOutputTokens: input.reservedOutputTokens,
          providerId: input.providerId,
          opencodeSessionId: shouldContinue ? activeSession?.opencodeSessionId : undefined,
        },
        (rawEvent) => {
          const parsedEvent = parseOpencodeLiveEvent(rawEvent);
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
      );
      const failed = result.exitCode !== 0;
      const parsedOutput = parseOpencodeJsonOutput(result.stdout);
      const currentEvents = get().sessions.find((item) => item.id === id)!.events;
      const baseEvents = parsedOutput.text
        ? currentEvents.filter(
            (item) => !(item.type === "output" && item.title === "OpenCode stream"),
          )
        : currentEvents;
      const events = [
        ...baseEvents,
        ...(parsedOutput.text
          ? [event("output", "Opencode", parsedOutput.text)]
          : []),
        ...(stripAnsi(result.stderr)
          ? [event(failed ? "error" : "output", "Opencode stderr", stripAnsi(result.stderr))]
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
          summary: failed ? "Opencode could not complete the turn." : parsedOutput.text,
          endedAt: Date.now(),
          exitCode: failed ? result.exitCode : undefined,
          contextTokens: parsedOutput.contextTokens ?? activeSession?.contextTokens,
          opencodeSessionId: parsedOutput.sessionId ?? activeSession?.opencodeSessionId,
          events,
        }),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => {
        const current = state.sessions.find((item) => item.id === id);
        return {
          runtimeAvailable: state.runtimeAvailable,
          sessions: patchSession(state.sessions, id, {
            status: "failed",
            summary: "Opencode could not complete the task.",
            endedAt: Date.now(),
            events: [
              ...(current?.events ?? []),
              event("error", "Failed to run opencode", message),
            ],
          }),
        };
      });
    }

    return id;
  },
  stopSession: (id) => {
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
    set({ sessions: [], activeSessionId: null });
  },
}));
