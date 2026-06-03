export type AgentMode = "plan" | "review" | "build" | "debug" | "refactor";

export type AgentStatus =
  | "idle"
  | "checking_runtime"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type AgentRuntimeId = "opencode";

export type AgentEventType = "status" | "output" | "error" | "result";

export type AgentEvent = {
  id: string;
  type: AgentEventType;
  title: string;
  detail?: string;
  at: number;
};

export type AgentSession = {
  id: string;
  runtime: AgentRuntimeId;
  mode: AgentMode;
  status: AgentStatus;
  projectPath: string;
  prompt: string;
  title: string;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  events: AgentEvent[];
  exitCode?: number | null;
};

export type StartAgentSessionInput = {
  mode: AgentMode;
  projectPath: string;
  prompt: string;
};

export type OpencodeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};
