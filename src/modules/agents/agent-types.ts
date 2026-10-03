export type AgentMode = "plan" | "build";
export const AGENT_REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type AgentReasoningLevel = typeof AGENT_REASONING_LEVELS[number];

export type AgentStatus =
  | "idle"
  | "checking_runtime"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type AgentRuntimeId = "pi";

export type AgentEventType = "status" | "reasoning" | "tool" | "output" | "error" | "result" | "token_update";

export type AgentEvent = {
  id: string;
  type: AgentEventType;
  title: string;
  detail?: string;
  at: number;
  sequence?: number;
  toolCallId?: string;
};

export type AgentSession = {
  id: string;
  runtime: AgentRuntimeId;
  mode: AgentMode;
  status: AgentStatus;
  projectPath: string;
  prompt: string;
  model: string;
  piSessionId?: string;
  title: string;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  events: AgentEvent[];
  exitCode?: number | null;
  contextTokens?: number;
};

export type StartAgentSessionInput = {
  /** Captured at dispatch, so navigation cannot redirect a queued follow-up. */
  continueSessionId?: string | null;
  mode: AgentMode;
  projectPath: string;
  prompt: string;
  model: string;
  contextLength?: number;
  reservedOutputTokens?: number;
  providerId?: string;
  providerBaseUrl?: string;
  piSessionId?: string;
  reasoningEnabled?: boolean;
  reasoningLevel?: AgentReasoningLevel;
};

export type PiRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type PiSession = {
  id: string;
  title: string;
  updated: number;
  created: number;
  directory?: string;
};
