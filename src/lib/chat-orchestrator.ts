import type { ChatMessage } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { buildChatContext } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderChatOptions } from "@/lib/providers/types";
import type { MemoryPack } from "@/lib/memory-types";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { buildMemoryPackWithInfo } from "@/lib/memory-retrieval";
import type { MemoryRetrievalInfo } from "@/lib/memory-types";

/**
 * Optional context threaded through to the chat consumer's onComplete
 * by the orchestrator. The provider does NOT fill this — it is the
 * orchestrator's job to attach the memoryPack that was injected into
 * the request.
 */
export interface SendChatCompleteContext {
  memoryPack: MemoryPack | null;
  memoryRetrieval: MemoryRetrievalInfo;
}

export type SendChatRequest = Omit<ProviderChatOptions, "messages" | "onComplete"> & {
  providerId: string;
  messages: ChatMessage[];
  /** When false, no memory retrieval, no pack injection, no extraction. */
  memoryEnabled: boolean;
  conversationId?: string;
  projectId?: string;
  onComplete?: (
    result: LmChatCompleteResult,
    context: SendChatCompleteContext,
  ) => void;
};

function latestUserMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export async function sendChatRequest({
  providerId,
  messages,
  memoryEnabled,
  conversationId,
  projectId,
  ...options
}: SendChatRequest): Promise<void> {
  const provider = getProviderAdapter(providerId);
  if (!provider) {
    options.onError(`Provider not found: ${providerId}`);
    return;
  }

  // Read live memory settings. The store is a global, so a snapshot read
  // is sufficient — no need to thread settings through every call site.
  const settings = useSettingsStore.getState();

  const { pack: memoryPack, info: memoryRetrieval } = await buildMemoryPackWithInfo({
    enabled: memoryEnabled,
    mode: settings.memoryMode,
    query: latestUserMessageText(messages),
    messages,
    projectId,
    budget: settings.maxMemoryTokens,
    maxNodes: settings.maxMemoryNodes,
  });

  // Wrap onComplete so the caller receives the same memoryPack that we
  // injected into the request. The provider doesn't know about memory;
  // the orchestrator is the boundary.
  const userOnComplete = options.onComplete;
  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    userOnComplete?.(result, { memoryPack, memoryRetrieval });
  };

  const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;

  const conversation = conversationId
    ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
    : undefined;

  await provider.sendChat({
    ...options,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolvedContextLength,
    onComplete: wrappedOnComplete,
    messages: buildChatContext(
      messages,
      {
        memoryPack: memoryPack ?? null,
        conversationSummary: conversation?.conversationSummary,
        summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
      },
      resolvedContextLength,
    ),
  });

}
