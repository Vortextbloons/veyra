import type { ChatMessage, ModelInfo, ProviderInfo } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";

export type ProviderChatOptions = {
  messages: ChatMessage[];
  model: string;
  previousResponseId?: string;
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
};

export interface ProviderAdapter {
  id: string;
  name: string;
  icon: ProviderInfo["icon"];
  isAvailable: () => Promise<boolean>;
  fetchModels: () => Promise<ModelInfo[]>;
  sendChat: (options: ProviderChatOptions) => Promise<void>;
}
