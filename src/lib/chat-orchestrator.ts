import type { ChatMessage } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { buildChatContext } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderChatOptions } from "@/lib/providers/types";
import type { MemoryPack } from "@/lib/memory-types";
import { useSettingsStore } from "@/stores/settings-store";
import { buildMemoryPack } from "@/lib/memory-retrieval";

/**
 * Optional context threaded through to the chat consumer's onComplete
 * by the orchestrator. The provider does NOT fill this — it is the
 * orchestrator's job to attach the memoryPack that was injected into
 * the request.
 */
export interface SendChatCompleteContext {
  memoryPack: MemoryPack | null;
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

  const memoryPack = await buildMemoryPack({
    enabled: memoryEnabled,
    mode: settings.memoryMode,
    query: latestUserMessageText(messages),
    projectId,
    budget: settings.maxMemoryTokens,
  });

  // Wrap onComplete so the caller receives the same memoryPack that we
  // injected into the request. The provider doesn't know about memory;
  // the orchestrator is the boundary.
  const userOnComplete = options.onComplete;
  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    userOnComplete?.(result, { memoryPack });
  };

  await provider.sendChat({
    ...options,
    onComplete: wrappedOnComplete,
    messages: buildChatContext(messages, { memoryPack: memoryPack ?? null }),
  });

  void conversationId;
}
