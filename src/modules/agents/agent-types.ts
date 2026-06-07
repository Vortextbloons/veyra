export type AgentMode = "ask" | "plan" | "build";

export type AgentStatus =
  | "idle"
  | "checking_runtime"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type AgentRuntimeId = "opencode";

export type AgentEventType = "status" | "reasoning" | "tool" | "output" | "error" | "result";

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
  model: string;
  opencodeSessionId?: string;
  title: string;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  events: AgentEvent[];
  exitCode?: number | null;
  contextTokens?: number;
};

export type StartAgentSessionInput = {
  mode: AgentMode;
  projectPath: string;
  prompt: string;
  model: string;
  contextLength?: number;
  reservedOutputTokens?: number;
  providerId?: string;
  opencodeSessionId?: string;
};

export type OpencodeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type OpencodeProjectSession = {
  id: string;
  title: string;
  updated: number;
  created: number;
  projectId?: string;
  directory?: string;
};
