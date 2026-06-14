import type { ChatMessage, ModelInfo } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import type { MemoryPack } from "@/lib/memory-types";

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ProviderToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export interface ProviderCompleteContext {
  memoryPack?: MemoryPack | null;
}

export type ProviderChatOptions = {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopSequences?: string[];
  previousResponseId?: string;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  reasoningEnabled?: boolean;
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onModelLoadProgress?: (phase: string, percent?: number) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: LmChatCompleteResult, context?: ProviderCompleteContext) => void;
  onError: (error: string) => void;
};

export type ProviderConnectResult = {
  success: boolean;
  message?: string;
};

export type ProviderPrepareModelOptions = {
  signal?: AbortSignal;
  onProgress?: (phase: string, percent?: number) => void;
  contextLength?: number;
  forceReload?: boolean;
};

export type ProviderConnectivityRequirement = "local" | "internet";

export interface ProviderAdapter {
  id: string;
  name: string;
  /** Provider identifier — used to render the matching logo in ProviderIcon */
  icon: string;
  connectivityRequirement: ProviderConnectivityRequirement;
  isAvailable: () => Promise<boolean>;
  fetchModels: () => Promise<ModelInfo[]>;
  sendChat: (options: ProviderChatOptions) => Promise<void>;
  /** Load or swap to the given model before a chat request. */
  prepareModel?: (modelId: string, options?: ProviderPrepareModelOptions) => Promise<void>;
  /** Unload all loaded model instances (e.g. on app shutdown). */
  unloadAllModels?: () => Promise<void>;
  /** Re-check availability without starting external processes. */
  reconnect?: () => Promise<ProviderConnectResult>;
  /** Start the provider's local server (e.g. LM Studio via `lms`). */
  startServer?: () => Promise<ProviderConnectResult>;
}
