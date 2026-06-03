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
  setMode: (mode: AgentMode) => void;
  setProjectPath: (projectPath: string) => void;
  setActiveSessionId: (id: string | null) => void;
  checkRuntime: () => Promise<void>;
  startSession: (input: StartAgentSessionInput) => Promise<string>;
  stopSession: (id: string) => void;
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
  mode: "plan",
  projectPath: "",
  setMode: (mode) => set({ mode }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  checkRuntime: async () => {
    set({ runtimeStatus: "checking_runtime" });
    const available = await checkOpencodeAvailable();
    set({ runtimeAvailable: available, runtimeStatus: available ? "idle" : "failed" });
  },
  startSession: async (input) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: AgentSession = {
      id,
      runtime: "opencode",
      mode: input.mode,
      status: "running",
      projectPath: input.projectPath.trim(),
      prompt: input.prompt.trim(),
      title: titleFromPrompt(input.prompt),
      startedAt: now,
      events: [
        event(
          "status",
          "Session started",
          input.projectPath.trim()
            ? `Workspace: ${input.projectPath.trim()}`
            : "Workspace: default app directory",
        ),
      ],
    };

    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));

    try {
      const result = await runOpencodeAgent({
        sessionId: id,
        mode: input.mode,
        projectPath: input.projectPath.trim(),
        prompt: input.prompt.trim(),
      });
      const failed = result.exitCode !== 0;
      const events = [
        ...get().sessions.find((item) => item.id === id)!.events,
        ...(result.stdout.trim()
          ? [event("output", "Opencode output", result.stdout.trim())]
          : []),
        ...(result.stderr.trim()
          ? [event(failed ? "error" : "output", "Opencode stderr", result.stderr.trim())]
          : []),
        event(
          failed ? "error" : "result",
          failed ? "Session failed" : "Session completed",
          `Exit code: ${result.exitCode ?? "unknown"}`,
        ),
      ];
      set((state) => ({
        sessions: patchSession(state.sessions, id, {
          status: failed ? "failed" : "completed",
          summary: failed ? "Opencode exited with an error." : "Opencode finished the task.",
          endedAt: Date.now(),
          exitCode: result.exitCode,
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
}));
