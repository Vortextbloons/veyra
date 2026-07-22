// ── Core chat types ──────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { MessageAttachment } from "@/lib/message-attachments";
import type { MemoryPack, MemoryRetrievalInfo } from "@/modules/memory/memory-types";
import type { AgentMode, AgentSession } from "@/modules/agents/agent-types";
import type { SearchResult } from "@/modules/web-search/types";
import type { FetchStatus } from "@/lib/fetch-status";
import type {
  ConversationExperience,
  PresentationMode,
  StudioArtifact,
  StudioResponse,
} from "@/modules/chat/studio/studio-types";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMode = "chat" | "agents" | "research" | "characters";

export type WorkspaceChatMode = "chat" | "agents";

export type WebSearchSource = Pick<SearchResult, "id" | "title" | "url"> & {
  snippet: string;
  fetch?: SourceFetch;
};

export type SourceFetchStatus =
  FetchStatus;

export type SourceFetch = {
  status: SourceFetchStatus | string;
  error_reason?: string;
  extraction_method?: string;
  via_wayback?: boolean;
  char_count?: number;
  source_type?: string;
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
  /** Immutable record of the explicitly active Skill for this sent message. */
  skillSnapshot?: { id: string; version: string; workflowId?: string };
  /** Model reasoning / chain-of-thought from LM Studio (when supported) */
  reasoning?: string;
  timestamp: number;
  performance?: MessagePerformance;
  /** Memory pack injected into context for this turn (only when chat Memory toggle was on) */
  memoryPack?: MemoryPack;
  /** Outcome of memory retrieval for this turn (toggle on). */
  memoryRetrieval?: MemoryRetrievalInfo;
  /** Sources used from web search for this turn. */
  webSearchSources?: WebSearchSource[];
  /** Live web search state for rendering tool call UI during/after search. */
  webSearchState?: WebSearchState;
  /** Live/generic tool call state for rendering tool activity. */
  toolStates?: ToolCallState[];
  /** Working scratchpad notes accumulated during enhanced mode tool rounds. */
  scratchpadContent?: string;
  /** Model id that produced this assistant message. Used to render the
   *  correct avatar/label even when the active model changes later. */
  modelId?: string;
  /** Message-owned Studio response (assistant messages only). */
  studioResponse?: StudioResponse;
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
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Presentation/response expectations within normal chat (`standard` | `studio`). */
  experience?: ConversationExperience;
  /** Legacy live presentation field retained for migration compatibility. */
  presentationMode?: PresentationMode;
  /** Legacy conversation-level artifact retained for migration recovery. */
  studioArtifact?: StudioArtifact;
  /** Project this conversation belongs to. undefined = no project (global chat). */
  projectId?: string;
  /** Character this conversation is bound to. undefined = plain (non-character) chat. */
  characterId?: string;
  /**
   * Snapshot of character identity at the time the conversation was created.
   * Preserves header rendering (name, gradient, version) if the character
   * record is later deleted or renamed.
   */
  characterSnapshot?: CharacterConversationSnapshot;
  /** Index of the seeded greeting in `messages` (0 unless greeting regenerated). */
  characterGreetingIndex?: number;
  /**
   * Character group this conversation is bound to. When set, the chat pipeline
   * drives multi-character replies. The `characterId` field is reused as the
   * active speaker for the most recent assistant turn.
   */
  groupId?: string;
  /**
   * Index of the greeting slot in `messages` for the group, used when
   * regenerating greetings.
   */
  groupGreetingIndex?: number;
  /** LM Studio `/api/v1/chat` response id for multi-turn continuity */
  lmResponseId?: string;
  /** Rolling summary of older turns (see auto-summarize setting) */
  conversationSummary?: string;
  /** Number of leading messages folded into `conversationSummary` */
  summaryCoversMessageCount?: number;
  /** Number of leading messages processed by batched memory extraction. */
  memoryLastProcessedMessageCount?: number;
  /** Timestamp when this conversation first became pending for memory extraction. */
  memoryPendingSince?: number;
}

export interface CharacterConversationSnapshot {
  id: string;
  name: string;
  title?: string;
  avatarColor?: string;
  spec: "veyra" | "chara_card_v3";
  version: string;
}

// ── Context stats ───────────────────────────────────────────────────────────

export interface ContextStats {
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
  | "memory"
  | "character"
  | "project"
  | "summary"
  | "context_anchor"
  | "documents_instructions"
  | "tool_definitions"
  | "web_search_results"
  | "user_message"
  | "assistant_message"
  | "system_message";

export const CONTEXT_BLOCK_LABELS: Record<ContextBlockCategory, string> = {
  system_core: "System Core",
  model_identity: "Model Identity",
  user_prompt: "Custom Instructions",
  memory: "Memory",
  character: "Character",
  project: "Project",
  summary: "Conversation Summary",
  context_anchor: "Context Anchoring",
  documents_instructions: "Document Instructions",
  tool_definitions: "Tool Definitions",
  web_search_results: "Web Search Results",
  user_message: "User Message",
  assistant_message: "Assistant",
  system_message: "System",
};

export const CONTEXT_BLOCK_ACCENTS: Record<ContextBlockCategory, string> = {
  system_core: "var(--color-text-dim)",
  model_identity: "var(--color-text-dim)",
  user_prompt: "var(--color-accent)",
  memory: "#818cf8",
  character: "#c084fc",
  project: "#60a5fa",
  summary: "#2dd4bf",
  context_anchor: "#64748b",
  documents_instructions: "#34d399",
  tool_definitions: "#22d3ee",
  web_search_results: "#22d3ee",
  user_message: "#4ade80",
  assistant_message: "#34d399",
  system_message: "#64748b",
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

export interface ProviderConfig {
  baseUrl: string;
  model: string;
  temperature: number;
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
  title?: string;
  /** Optional node rendered next to the title (e.g. character badge). */
  titleAccessory?: ReactNode;
  /** Optional right-side action buttons rendered in the title bar. */
  headerActions?: ReactNode;
  messages?: ChatMessage[];
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
    options?: { memoryEnabled: boolean },
  ) => void;
  supportsImages?: boolean;
  defaultMemoryEnabled?: boolean;
  isStreaming?: boolean;
  streamingMessageId?: string | null;
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
  /** 0 = both side panels open, 1 = one collapsed, 2 = both collapsed */
  sidebarsCollapsed?: number;
  onStop?: () => void;
  onTriggerMemoryExtraction?: () => void;
  modelLoadProgress?: ModelLoadProgress;
  mode?: ChatMode;
  defaultMode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  presentationMode?: PresentationMode;
  onPresentationModeChange?: (mode: PresentationMode) => void;
  agentSessions?: AgentSession[];
  activeAgentSessionId?: string | null;
  agentRuntimeAvailable?: boolean | null;
  agentMode?: AgentMode;
  agentProjectPath?: string;
  onAgentModeChange?: (mode: AgentMode) => void;
  onAgentProjectPathChange?: (path: string) => void;
  onAgentRuntimeCheck?: () => void;
  onAgentNewSession?: () => void;
  onAgentSessionSelect?: (id: string) => void;
  onAgentSessionStop?: (id: string) => void;
  onAgentSessionDelete?: (id: string) => void;
  onEditMessage?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onCopyMessage?: (messageId: string) => void;
  onForkMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  editingMessageId?: string | null;
  editInitialValue?: string;
  onEditCancel?: () => void;
  onEditSave?: (messageId: string, newContent: string) => void;
}

export interface RightPanelProps {
  contextStats?: ContextStats;
  contextBreakdown?: ContextBreakdown;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hidden?: boolean;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  codeExecutionEnabled?: boolean;
  onCodeExecutionChange?: (enabled: boolean) => void;
  codeExecutionDisabled?: boolean;
  codeExecutionDisabledReason?: string;
  isAgentsMode?: boolean;
  agentSessionCount?: number;
  agentActiveCount?: number;
  onAgentClearSessions?: () => void;
}

export interface RecentChatsItem {
  id: string;
  title: string;
  meta: string;
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

export const CHAT_MODE_NAV_IDS = ["chat", "projects"] as const;

export function isChatModeNav(navId: string): boolean {
  return (CHAT_MODE_NAV_IDS as readonly string[]).includes(navId);
}
