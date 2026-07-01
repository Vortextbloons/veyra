import { useCallback } from "react";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { runChatJob } from "@/hooks/run-chat-job";

interface UseChatEditingOptions {
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
  setEditingMessageId: (id: string | null) => void;
  activeChatJobIdRef: React.MutableRefObject<string | null>;
}

export function useChatEditing({
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
  setEditingMessageId,
  activeChatJobIdRef,
}: UseChatEditingOptions) {
  const updateMessage = useChatStore((state) => state.updateMessage);
  const truncateAfterMessage = useChatStore((state) => state.truncateAfterMessage);
  const addMessagePair = useChatStore((state) => state.addMessagePair);

  const handleEditMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      if (!message || message.role !== "user") return;
      setEditingMessageId(messageId);
    },
    [activeConversationId, setEditingMessageId],
  );

  const handleEditCancel = useCallback(() => setEditingMessageId(null), [setEditingMessageId]);

  const handleEditSave = useCallback(
    (messageId: string, newContent: string) => {
      if (!activeConversationId) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;
      updateMessage(activeConversationId, messageId, trimmed);
      truncateAfterMessage(activeConversationId, messageId);
      setEditingMessageId(null);
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!conversation) return;
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      if (lastMsg?.role !== "user") return;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId: selectedModel,
      };

      addMessagePair(activeConversationId, lastMsg, assistantMessage, {
        deferTitle: useSettingsStore.getState().autoNameEnabled,
      });

      const previousResponseId = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId)?.lmResponseId;

      runChatJob({
        conversationId: activeConversationId,
        userMessage: lastMsg,
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
      selectedModel,
      selectedProvider,
      setEditingMessageId,
      setRequestStatus,
      setStreamingMessageId,
      truncateAfterMessage,
      updateMessage,
      projectId,
    ],
  );

  return { handleEditMessage, handleEditCancel, handleEditSave };
}
