import { create } from "zustand";
import type {
  AgentEvent,
  AgentMode,
  AgentSession,
  AgentStatus,
  StartAgentSessionInput,
} from "@/modules/agents/agent-types";
import { checkOpencodeAvailable, runOpencodeAgent } from "@/modules/agents/opencode-runtime";

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

type ParsedOpencodeOutput = {
  sessionId?: string;
  text: string;
};

function parseOpencodeJsonOutput(stdout: string): ParsedOpencodeOutput {
  const text: string[] = [];
  let sessionId: string | undefined;

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
        part?: { text?: string; content?: string; sessionID?: string };
      };
      sessionId = parsed.sessionID ?? parsed.part?.sessionID ?? sessionId;
      if (parsed.synthetic || parsed.metadata?.compaction_continue) continue;
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
  if (parsedText) return { sessionId, text: parsedText };

  return { sessionId, text: stripAnsi(stdout) };
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

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  runtimeAvailable: null,
  runtimeStatus: "idle",
  mode: "ask",
  projectPath: "",
  selectedModel: "",
  setMode: (mode) => set({ mode }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  checkRuntime: async () => {
    set({ runtimeStatus: "checking_runtime" });
    const available = await checkOpencodeAvailable();
    set({ runtimeAvailable: available, runtimeStatus: available ? "idle" : "failed" });
  },
  startSession: async (input) => {
    const activeSession = get().activeSessionId
      ? get().sessions.find((item) => item.id === get().activeSessionId)
      : null;
    const shouldContinue = Boolean(
      activeSession &&
        activeSession.status !== "running" &&
        activeSession.mode === input.mode &&
        activeSession.projectPath === input.projectPath.trim(),
    );
    const id = shouldContinue && activeSession ? activeSession.id : crypto.randomUUID();
    const now = Date.now();
    const session: AgentSession = {
      id,
      runtime: "opencode",
      mode: input.mode,
      status: "running",
      projectPath: input.projectPath.trim(),
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
            input.projectPath.trim() ? `Workspace: ${input.projectPath.trim()}` : null,
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
            model: input.model,
            events: session.events,
            exitCode: undefined,
            endedAt: undefined,
          })
        : [session, ...state.sessions],
      activeSessionId: id,
    }));

    try {
      const result = await runOpencodeAgent({
        sessionId: id,
        mode: input.mode,
          projectPath: input.projectPath.trim(),
          prompt: input.prompt.trim(),
          model: input.model,
          providerId: input.providerId,
          opencodeSessionId: shouldContinue ? activeSession?.opencodeSessionId : undefined,
        });
      const failed = result.exitCode !== 0;
      const parsedOutput = parseOpencodeJsonOutput(result.stdout);
      const events = [
        ...get().sessions.find((item) => item.id === id)!.events,
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
