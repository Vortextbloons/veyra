import type { ContextTokenUsage } from "./context-usage";
import { REASONING_LEVELS, type ReasoningLevel } from "@/lib/reasoning-capabilities";
import type { MessageAttachment } from "@/lib/message-attachments";
import type { Artifact } from "@/modules/chat/artifact";
import type { InteractiveAnswer } from "@/modules/chat/interactive-answer";
import type { SkillInvocation } from "@/modules/extensions/extension-types";

/** Legacy values remain readable for saved sessions. New conversations use chat. */
export type AgentMode = "chat" | "plan" | "build";
export const AGENT_REASONING_LEVELS = REASONING_LEVELS;
export type AgentReasoningLevel = ReasoningLevel;

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
  attachments?: MessageAttachment[];
  /** Skills applied to this request, stored so edits cannot rewrite history. */
  skillInvocations?: SkillInvocation[];
  artifact?: Artifact;
  interactiveAnswer?: InteractiveAnswer;
  contextUsage?: ContextTokenUsage;
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
  contextUsage?: ContextTokenUsage;
  sourceConversationId?: string;
  projectId?: string;
};

export type StartAgentSessionInput = {
  projectId?: string | null;
  displayPrompt?: string;
  /** Captured at dispatch, so navigation cannot redirect a queued follow-up. */
  continueSessionId?: string | null;
  /** Accepted only for older callers; execution always uses unified Chat. */
  mode?: AgentMode;
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
  images?: { data: string; mimeType: string }[];
  attachments?: MessageAttachment[];
  webSearchEnabled?: boolean;
  /** Skills for this request; defaults to the composer's picks and chat pins. */
  skillInvocations?: SkillInvocation[];
  /**
   * Replays a stored invocation record instead of resolving live library
   * content. Used by retry so an edited or deleted Skill cannot change what runs.
   */
  retrySkillInvocations?: SkillInvocation[];
  /** Resolved user-authored system prompt (global or per-model). */
  systemPrompt?: string;
  /** Send `systemPrompt` as the only system prompt instead of appending it. */
  replaceSystemPrompt?: boolean;
};

export type PiRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};
