import { useCallback } from "react";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { runChatJob } from "@/hooks/run-chat-job";

interface UseChatRegenerationOptions {
  activeConversationId: string | null;
  projectId?: string;
  selectedModel: string;
  selectedProvider: string;
  defaultMemoryEnabled: boolean;
  effectiveWebSearchEnabled: boolean;
  effectiveCodeExecutionEnabled: boolean;
  enhancedModeEnabled: boolean;
  setRequestStatus: React.Dispatch<React.SetStateAction<RequestStatus>>;
  setStreamingMessageId: (id: string | null) => void;
  activeChatJobIdRef: React.MutableRefObject<string | null>;
}

export function useChatRegeneration({
  activeConversationId,
  projectId,
  selectedModel,
  selectedProvider,
  defaultMemoryEnabled,
  effectiveWebSearchEnabled,
  effectiveCodeExecutionEnabled,
  enhancedModeEnabled,
  setRequestStatus,
  setStreamingMessageId,
  activeChatJobIdRef,
}: UseChatRegenerationOptions) {
  const removeLastMessagePair = useChatStore((state) => state.removeLastMessagePair);
  const addMessagePair = useChatStore((state) => state.addMessagePair);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!conversation) return;
      const msgIndex = conversation.messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0 || conversation.messages[msgIndex].role !== "assistant") return;
      if (msgIndex === 0) return;
      const userMsg = conversation.messages[msgIndex - 1];
      if (userMsg.role !== "user") return;
      removeLastMessagePair(activeConversationId);

      const trimmed = userMsg.content.trim();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId: selectedModel,
      };

      const liveConversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!liveConversation) return;

      addMessagePair(activeConversationId, userMsg, assistantMessage, {
        deferTitle: useSettingsStore.getState().autoNameEnabled,
      });

      const previousResponseId = liveConversation.lmResponseId;

      runChatJob({
        conversationId: activeConversationId,
        userMessage: userMsg,
        assistantMessage,
        trimmed,
        previousResponseId,
        selectedProvider,
        selectedModel,
        memoryEnabled: defaultMemoryEnabled,
        effectiveWebSearchEnabled,
        effectiveCodeExecutionEnabled,
        enhancedModeEnabled,
        projectId,
        setRequestStatus,
        setStreamingMessageId,
        activeChatJobIdRef,
      });
    },
    [
      activeConversationId,
      activeChatJobIdRef,
      addMessagePair,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      effectiveCodeExecutionEnabled,
      enhancedModeEnabled,
      removeLastMessagePair,
      selectedModel,
      selectedProvider,
      setRequestStatus,
      setStreamingMessageId,
      projectId,
    ],
  );

  const handleRetry = useCallback(
    (messageId: string) => handleRegenerate(messageId),
    [handleRegenerate],
  );

  return { handleRegenerate, handleRetry };
}
