import type { ChatMessage, ModelInfo, ProviderInfo } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import type { MemoryPack } from "@/lib/memory-types";

export interface ProviderCompleteContext {
  memoryPack?: MemoryPack | null;
}

export type ProviderChatOptions = {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  contextLength?: number;
  previousResponseId?: string;
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onComplete?: (result: LmChatCompleteResult, context?: ProviderCompleteContext) => void;
  onError: (error: string) => void;
};

export type ProviderConnectResult = {
  success: boolean;
  message?: string;
};

export interface ProviderAdapter {
  id: string;
  name: string;
  icon: ProviderInfo["icon"];
  isAvailable: () => Promise<boolean>;
  fetchModels: () => Promise<ModelInfo[]>;
  sendChat: (options: ProviderChatOptions) => Promise<void>;
  /** Re-check availability without starting external processes. */
  reconnect?: () => Promise<ProviderConnectResult>;
  /** Start the provider's local server (e.g. LM Studio via `lms`). */
  startServer?: () => Promise<ProviderConnectResult>;
}
