// ── Core chat types ──────────────────────────────────────────────────────────

import type { MessageAttachment } from "@/lib/message-attachments";
import type { AgentSession } from "@/modules/agents/agent-types";
import type { SearchResult, SourceFetch } from "@/modules/web-search/types";
import type { InteractiveAnswer } from "@/modules/chat/interactive-answer";
import type { Artifact } from "@/modules/chat/artifact";
import type { SkillInvocation } from "@/modules/extensions/extension-types";

export type ChatRole = "user" | "assistant" | "system";

export type WebSearchSource = Pick<SearchResult, "id" | "title" | "url"> & {
  snippet: string;
  fetch?: SourceFetch;
};

export type WebSearchPhase = "searching" | "fetching" | "reading" | "done" | "error";

/** One web_search tool invocation (supports multi-search tool chains). */
export type WebSearchRound = {
  id: string;
  query: string;
  phase: WebSearchPhase;
  sources: WebSearchSource[];
  fetch_progress?: { completed: number; total: number };
  error?: string;
};

export type WebSearchState = {
  rounds: WebSearchRound[];
};

export type ToolCallPhase = "pending" | "running" | "retrying" | "done" | "error";

export type ToolCallState = {
  id: string;
  name: string;
  label: string;
  phase: ToolCallPhase;
  input?: string;
  detail?: string;
  error?: string;
  attempts?: number;
  result?: unknown;
  /** Metadata for an MCP permission request, retained so the chat card can approve it safely. */
  mcpApproval?: {
    serverId: string;
    toolName: string;
    projectId?: string;
    chatId?: string;
    capabilityFingerprint?: string;
  };
};

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Images and other media attached to user messages */
  attachments?: MessageAttachment[];
  /**
   * Immutable record of the Skills applied to this request: id, content hash,
   * and the instruction snapshot. Editing or deleting a Skill never changes it,
   * and Retry replays exactly these instructions.
   */
  skillInvocations?: SkillInvocation[];
  /** Model reasoning / chain-of-thought from LM Studio (when supported) */
  reasoning?: string;
  timestamp: number;
  performance?: MessagePerformance;
  /** Sources used from web search for this turn. */
  webSearchSources?: WebSearchSource[];
  /** Live web search state for rendering tool call UI during/after search. */
  webSearchState?: WebSearchState;
  /** Live/generic tool call state for rendering tool activity. */
  toolStates?: ToolCallState[];
  /** Working scratchpad notes accumulated during enhanced mode tool rounds. */
  scratchpadContent?: string;
  /** Structured interactive answer generated during an Enhanced chat turn. */
  interactiveAnswer?: InteractiveAnswer;
  /** Finished HTML, code, or document output owned by this assistant message. */
  artifact?: Artifact;
  /** Internal regeneration link; removed from provider history and consumed when replacement output saves. */
  artifactReplacement?: { userMessageId: string; assistantMessageId: string };
  /** Model id that produced this assistant message. Used to render the
   *  correct avatar/label even when the active model changes later. */
  modelId?: string;
}

export interface MessagePerformance {
  tokensPerSecond: number;
  timeToFirstToken: number;
  generationTime: number;
  totalTime: number;
  outputTokens: number;
  inputTokens?: number;
  totalTokens?: number;
  stopReason?: string;
}

export interface Conversation {
  /** Pi run state shares the encrypted conversation snapshot. */
  agentSession?: AgentSession;
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Project this conversation belongs to. undefined = no project (global chat). */
  projectId?: string;
  /** LM Studio `/api/v1/chat` response id for multi-turn continuity */
  lmResponseId?: string;
  /** Rolling summary of older turns (see auto-summarize setting) */
  conversationSummary?: string;
  /** Number of leading messages folded into `conversationSummary` */
  summaryCoversMessageCount?: number;
}

// ── Context stats ───────────────────────────────────────────────────────────

export interface ContextStats {
  inputTokens?: number;
  outputTokens?: number;
  estimatedTokens: number;
  contextLimit: number;
  percentUsed: number;
  includedMessages: number;
  droppedMessages: number;
  reservedOutputTokens: number;
  includedLabel?: string;
  contextNote?: string;
}

// ── Context breakdown ─────────────────────────────────────────────────────

export type ContextBlockCategory =
  | "system_core"
  | "model_identity"
  | "user_prompt"
  | "project"
  | "summary"
  | "retrieved_memory"
  | "context_anchor"
  | "tool_definitions"
  | "web_search_results"
  | "user_message"
  | "assistant_message"
  | "system_message";

export const CONTEXT_BLOCK_ACCENTS: Record<ContextBlockCategory, string> = {
  system_core: "#fbbf24",
  model_identity: "#fb923c",
  user_prompt: "#f472b6",
  project: "#60a5fa",
  summary: "#2dd4bf",
  retrieved_memory: "#a78bfa",
  context_anchor: "#e879f9",
  tool_definitions: "#22d3ee",
  web_search_results: "#a3e635",
  user_message: "#4ade80",
  assistant_message: "#818cf8",
  system_message: "#fb7185",
};

export interface ContextBlock {
  category: ContextBlockCategory;
  label: string;
  tokenCount: number;
  dropped: boolean;
  detail?: string;
}

export interface ContextBreakdown {
  systemBlocks: ContextBlock[];
  messageBlocks: ContextBlock[];
  droppedCount: number;
  totalSystemTokens: number;
  totalMessageTokens: number;
  totalTokens: number;
  contextLimit: number;
  reservedOutputTokens: number;
}

// ── Provider & model types ──────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected";
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  size?: string;
  /** Vision-language model — accepts image input */
  supportsImages?: boolean;
}

// ── Request status ──────────────────────────────────────────────────────────

export type RequestStatus = "idle" | "streaming" | "error";

export type ModelLoadProgress = {
  phase: "unloading" | "loading" | "ready";
  /** 0–100 when available, otherwise undefined (indeterminate) */
  percent?: number;
} | null;

// ── Component prop interfaces ───────────────────────────────────────────────

export interface ChatPanelProps {
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
  ) => void;
  supportsImages?: boolean;
  providers?: ProviderInfo[];
  selectedProvider?: string;
  onProviderChange?: (id: string) => void;
  providerConnectionPhase?: "idle" | "connecting" | "error";
  providerConnectionError?: string | null;
  onProviderReconnect?: (providerId?: string) => void;
  onProviderStartServer?: (providerId?: string) => void;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (id: string) => void;
  favoriteModels?: string[];
  onToggleFavorite?: (id: string) => void;
  /** 0 = all side panels open, 1 = recent chats collapsed */
  sidebarsCollapsed?: number;
  contextStats?: ContextStats;
  /** Per-chat web search toggle, seeded from the Web search setting. */
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  modelLoadProgress?: ModelLoadProgress;
  agentSessions?: AgentSession[];
  activeAgentSessionId?: string | null;
  agentRuntimeAvailable?: boolean | null;
  agentProjectPath?: string;
  onAgentProjectPathChange?: (path: string) => void;
  onAgentRuntimeCheck?: () => void;
  onAgentSessionStop?: (id: string) => void;
  /** Repeats a request with the Skill instructions recorded on it. */
  onRetryRequest?: (turn: { id: string; content: string }) => void;
}

export interface RecentChatsItem {
  id: string;
  title: string;
  meta: string;
  /** True while the model is actively working in this chat. */
  working?: boolean;
}

export interface RecentChatsProps {
  chats?: RecentChatsItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDeleteAll?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hidden?: boolean;
}

export interface PrimarySidebarProps {
  activeNav?: string;
  onNavChange?: (id: string) => void;
  onNewChat?: () => void;
}

// ── Nav mode helpers ─────────────────────────────────────────────────────────

export const CHAT_MODE_NAV_IDS = ["chat"] as const;

export function isChatModeNav(navId: string): boolean {
  return (CHAT_MODE_NAV_IDS as readonly string[]).includes(navId);
}
