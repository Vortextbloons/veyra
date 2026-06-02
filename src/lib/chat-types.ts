// ── Core chat types ──────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Model reasoning / chain-of-thought from LM Studio (when supported) */
  reasoning?: string;
  timestamp: number;
  performance?: MessagePerformance;
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
  icon: "local" | "cloud";
  status: "connected" | "disconnected";
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  size?: string;
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
  onSend?: (text: string) => void;
  isStreaming?: boolean;
  streamingMessageId?: string | null;
  providers?: ProviderInfo[];
  selectedProvider?: string;
  onProviderChange?: (id: string) => void;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (id: string) => void;
  /** 0 = both side panels open, 1 = one collapsed, 2 = both collapsed */
  sidebarsCollapsed?: number;
}

export interface RightPanelProps {
  contextStats?: ContextStats;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
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
}

export interface PrimarySidebarProps {
  activeNav?: string;
  onNavChange?: (id: string) => void;
  onNewChat?: () => void;
}
