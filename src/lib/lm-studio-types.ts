import type { MessagePerformance } from "@/lib/chat-types";
import type { ProviderToolCall } from "@/lib/providers/types";
import type { LmChatStats } from "@/lib/performance";

export interface LmChatCompleteResult {
  performance: MessagePerformance;
  responseId?: string;
  toolCalls?: ProviderToolCall[];
}

export type V1OutputItem =
  | { type: "message"; content: string; tool_calls?: unknown }
  | { type: "reasoning"; content: string }
  | {
      type: "tool_call" | "function_call";
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: unknown;
      args?: unknown;
      function?: { name?: string; arguments?: unknown };
    }
  | { type: string; content?: string };

export type StreamState = {
  firstTokenAt?: number;
  accumulatedContent: string;
  accumulatedReasoning: string;
  stats?: LmChatStats;
  responseId?: string;
  toolCalls?: ProviderToolCall[];
};

export type OpenAiStreamState = StreamState & {
  toolCallAccumulators: Map<number, { id?: string; name?: string; arguments: string }>;
  notifiedToolIndices: Set<number>;
};

export type LmStudioModelEntry = {
  id?: unknown;
  key?: unknown;
  model?: unknown;
  path?: unknown;
  loaded?: unknown;
  state?: unknown;
  status?: unknown;
  loaded_instances?: unknown;
};

export type LoadedLmStudioModelInstance = {
  modelId: string;
  instanceId: string;
};
