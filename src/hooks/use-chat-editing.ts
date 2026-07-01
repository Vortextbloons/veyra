import { useCallback } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeChatSend, ensureProviderReady } from "@/modules/chat/chat-actions";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";

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
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const appendStreamingReasoning = useChatStore((state) => state.appendStreamingReasoning);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);
  const clearStreamingBufferUnlessSkipped = useChatStore(
    (state) => state.clearStreamingBufferUnlessSkipped,
  );
  const commitAssistantMessage = useChatStore((state) => state.commitAssistantMessage);
  const setModelLoadProgress = useChatStore((state) => state.setModelLoadProgress);

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
      const liveConversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!liveConversation) return;
      const updatedMessages = [...liveConversation.messages, assistantMessage];
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages: updatedMessages, updatedAt: Date.now() }
            : c,
        ),
        streamingBuffer: {
          conversationId: activeConversationId,
          messageId: assistantMessage.id,
          content: "",
          reasoning: "",
        },
      }));
      void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) =>
        saveConversationSnapshot(useChatStore.getState().conversations),
      );
      const previousResponseId = liveConversation.lmResponseId;
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");
      aiScheduler.abortActiveBackgroundJob();
      const memoryEnabled = defaultMemoryEnabled;
      const jobId = aiScheduler.enqueueAiJob({
        type: "user_chat",
        priority: 0,
        title: "Regenerating response",
        description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
        prompt: trimmed,
        conversationId: activeConversationId,
        model: selectedModel,
        run: async (signal) => {
          try {
            await ensureProviderReady();
            return await executeChatSend({
              conversationId: activeConversationId,
              userMessage: lastMsg,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              webSearchEnabled: effectiveWebSearchEnabled,
              codeExecutionEnabled: effectiveCodeExecutionEnabled,
              enhancedMode: enhancedModeEnabled,
              projectId,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(activeConversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk)
                  appendStreamingReasoning(activeConversationId, assistantMessage.id, chunk);
              },
              onModelLoadProgress: (phase: string, percent?: number) => {
                setModelLoadProgress(
                  phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                );
              },
              onError: (error) => {
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  content: `Error: ${error}`,
                });
                clearStreamingBuffer();
                setModelLoadProgress(null);
                setRequestStatus("error");
                setStreamingMessageId(null);
              },
              onComplete: (result, context) => {
                if (useChatStore.getState().isBufferClearSkipped()) return;
                setModelLoadProgress(null);
                const memoryPack = context?.memoryPack ?? null;
                const memoryRetrieval = context?.memoryRetrieval;
                const webSearchSources = context?.webSearchSources;
                const scratchpadContent = context?.scratchpadContent;
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  performance: result.performance,
                  lmResponseId: result.responseId,
                  ...(memoryPack ? { memoryPack } : {}),
                  ...(memoryEnabled && memoryRetrieval ? { memoryRetrieval } : {}),
                  ...(webSearchSources ? { webSearchSources } : {}),
                  ...(scratchpadContent ? { scratchpadContent } : {}),
                });
              },
            });
          } catch (error) {
            if (!signal.aborted) {
              commitAssistantMessage(activeConversationId, assistantMessage.id, {
                content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              });
              setRequestStatus("error");
            }
          } finally {
            clearStreamingBufferUnlessSkipped();
            if (!useChatStore.getState().isBufferClearSkipped()) {
              setStreamingMessageId(null);
              setRequestStatus((status) => (status === "error" ? "error" : "idle"));
            }
            setModelLoadProgress(null);
            if (activeChatJobIdRef.current === jobId) activeChatJobIdRef.current = null;
          }
        },
      });
      activeChatJobIdRef.current = jobId;
    },
    [
      activeConversationId,
      activeChatJobIdRef,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      effectiveCodeExecutionEnabled,
      enhancedModeEnabled,
      selectedModel,
      selectedProvider,
      setEditingMessageId,
      setModelLoadProgress,
      setRequestStatus,
      setStreamingMessageId,
      truncateAfterMessage,
      updateMessage,
      projectId,
    ],
  );

  return { handleEditMessage, handleEditCancel, handleEditSave };
}
