import type { ChatMessage } from "@/lib/chat-types";
import type { SendChatCompleteContext } from "@/lib/chat-orchestrator";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { getAssistantVisibleText } from "@/lib/assistant-text";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";

export type ChatSendParams = {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  trimmed: string;
  previousResponseId?: string;
  selectedProvider: string;
  selectedModel: string;
  memoryEnabled: boolean;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
  onReasoningChunk: (chunk: string) => void;
  onError: (error: string) => void;
  onComplete: (result: LmChatCompleteResult, context: SendChatCompleteContext) => void;
};

/** Lazy-loaded chat pipeline — keeps heavy modules off the startup graph. */
export async function executeChatSend(params: ChatSendParams): Promise<string | undefined> {
  const [
    { sendChatRequest },
    { trySaveExplicitMemory },
    { handoffAfterUserChat, queuePostChatJobs },
    { prepareUserChatModel },
  ] = await Promise.all([
    import("@/lib/chat-orchestrator"),
    import("@/lib/explicit-memory"),
    import("@/lib/post-chat-jobs"),
    import("@/lib/lm-model-session"),
  ]);

  const {
    conversationId,
    userMessage,
    assistantMessage,
    trimmed,
    previousResponseId,
    selectedProvider,
    selectedModel,
    memoryEnabled,
    signal,
    onChunk,
    onReasoningChunk,
    onError,
    onComplete,
  } = params;

  if (memoryEnabled) {
    void trySaveExplicitMemory(trimmed, { conversationId });
  }

  await prepareUserChatModel(selectedModel, signal);

  const liveConversation = useChatStore
    .getState()
    .conversations.find((item) => item.id === conversationId);
  const userMessageIndex =
    liveConversation?.messages.findIndex((message) => message.id === userMessage.id) ?? -1;
  const messages =
    userMessageIndex >= 0 && liveConversation
      ? liveConversation.messages
          .slice(0, userMessageIndex + 1)
          .filter(
            (message) =>
              message.role !== "assistant" || getAssistantVisibleText(message).trim(),
          )
      : [userMessage];

  await sendChatRequest({
    providerId: selectedProvider,
    messages,
    model: selectedModel,
    previousResponseId,
    signal,
    memoryEnabled,
    conversationId,
    projectId: undefined,
    onChunk,
    onReasoningChunk,
    onError,
    onComplete,
  });

  const chatModel = useProviderStore.getState().selectedModel.trim();
  const liveProvider = useProviderStore.getState().selectedProvider;
  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  const assistantMsg = conv?.messages.find((m) => m.id === assistantMessage.id);
  const assistantText = getAssistantVisibleText(assistantMsg);
  const userMsgCount = conv?.messages.filter((m) => m.role === "user").length ?? 0;

  if (chatModel && assistantText) {
    const isFirstExchange = userMsgCount <= 1;
    await handoffAfterUserChat({
      chatModel,
      conversationId,
      isFirstExchange,
      signal,
    });

    queuePostChatJobs({
      conversationId,
      chatModel,
      providerId: liveProvider,
      userMessage: trimmed,
      assistantMessage: assistantText,
      isFirstExchange,
    });
  }

  return assistantText || undefined;
}

export async function triggerMemoryExtractionNow(options: {
  conversationId: string;
  chatModel: string;
  providerId: string;
}): Promise<void> {
  const { queueMemoryExtractionNow } = await import("@/lib/post-chat-jobs");
  queueMemoryExtractionNow(options);
}

export async function ensureProviderReady(): Promise<void> {
  await useProviderStore.getState().ensureProviderReady();
}
