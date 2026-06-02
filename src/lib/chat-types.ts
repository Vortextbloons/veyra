// ── Core chat types ──────────────────────────────────────────────────────────

import type { MessageAttachment } from "@/lib/message-attachments";
import type { MemoryPack, MemoryRetrievalInfo } from "@/lib/memory-types";

export type ChatRole = "user" | "assistant" | "system";

export type WebSearchSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchPhase = "searching" | "reading" | "done" | "error";

export type WebSearchState = {
  query: string;
  phase: WebSearchPhase;
  sources: WebSearchSource[];
  error?: string;
};

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Images and other media attached to user messages */
  attachments?: MessageAttachment[];
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

// ── Context stats ───────────────────────────────────────────────────────────

export interface ContextStats {
  estimatedTokens: number;
  contextLimit: number;
  percentUsed: number;
  includedMessages: number;
  droppedMessages: number;
  reservedOutputTokens: number;
}

// ── Provider & model types ──────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  /** Provider identifier used to render the appropriate logo icon */
  icon: string;
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

// ── Component prop interfaces ───────────────────────────────────────────────

export interface ChatPanelProps {
  title?: string;
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
  onTriggerMemoryExtraction?: () => void;
}

export interface RightPanelProps {
  contextStats?: ContextStats;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hidden?: boolean;
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

export const CHAT_MODE_NAV_IDS = ["chat", "projects", "tools"] as const;

export function isChatModeNav(navId: string): boolean {
  return (CHAT_MODE_NAV_IDS as readonly string[]).includes(navId);
}
