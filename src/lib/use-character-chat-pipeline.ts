import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import {
  executeChatSend,
  ensureProviderReady,
  triggerMemoryExtractionNow,
} from "@/lib/chat-actions";
import type { ChatMessage, RequestStatus } from "@/lib/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useIsFeatureAvailable } from "@/lib/connectivity/useConnectivity";

/**
 * Self-contained chat pipeline state and message handlers. Used by the
 * Characters page so it can mount a real ChatPanel that sends to the active
 * model and shares the same `useChatStore` as the main app.
 *
 * Only one of these should be mounted at a time — App.tsx hides its own
 * ChatPanel when `activeNav === "characters"`, and this hook drives the
 * ChatPanel rendered inside the CharacterPage.
 */
export function useCharacterChatPipeline() {
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const activeChatJobIdRef = useRef<string | null>(null);

  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const streamingBuffer = useChatStore((state) => state.streamingBuffer);
  const modelLoadProgress = useChatStore((state) => state.modelLoadProgress);
  const createConversation = useChatStore((state) => state.createConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const truncateAfterMessage = useChatStore((state) => state.truncateAfterMessage);
  const removeLastMessagePair = useChatStore((state) => state.removeLastMessagePair);
  const forkConversation = useChatStore((state) => state.forkConversation);
  const addMessagePair = useChatStore((state) => state.addMessagePair);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const appendStreamingReasoning = useChatStore((state) => state.appendStreamingReasoning);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);
  const clearStreamingBufferUnlessSkipped = useChatStore(
    (state) => state.clearStreamingBufferUnlessSkipped,
  );
  const commitAssistantMessage = useChatStore((state) => state.commitAssistantMessage);
  const setModelLoadProgress = useChatStore((state) => state.setModelLoadProgress);

  const providers = useProviderStore((state) => state.providers);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const models = useProviderStore((state) => state.models);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const connectionPhase = useProviderStore((state) => state.connectionPhase);
  const connectionError = useProviderStore((state) => state.connectionError);

  const favoriteModels = useSettingsStore((state) => state.favoriteModels);
  const recentChatsCollapsed = useSettingsStore((state) => state.recentChatsCollapsed);
  const rightPanelCollapsed = useSettingsStore((state) => state.rightPanelCollapsed);
  const defaultContextLength = useSettingsStore((state) => state.defaultContextLength);
  const defaultReservedOutputTokens = useSettingsStore((state) => state.defaultReservedOutputTokens);
  const modelOverrides = useSettingsStore((state) => state.modelOverrides);
  const defaultMemoryEnabled = useSettingsStore((s) => s.defaultMemoryEnabled);
  const codeExecutionEnabled = useSettingsStore((s) => s.codeExecutionEnabled);

  const effectiveConnectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const webSearchAvailability = useIsFeatureAvailable("webSearch");
  const webSearchDisabled = !webSearchAvailability.available;
  const [webSearchEnabled, setWebSearchEnabled] = useState(
    useSettingsStore.getState().defaultWebSearchEnabled,
  );
  const effectiveWebSearchEnabled =
    effectiveConnectivity === "online" && webSearchEnabled && !webSearchDisabled;
  const prevEffectiveConnectivityRef = useRef(effectiveConnectivity);

  useEffect(() => {
    const prev = prevEffectiveConnectivityRef.current;
    prevEffectiveConnectivityRef.current = effectiveConnectivity;
    if (prev === "offline" && effectiveConnectivity === "online") {
      setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    }
  }, [effectiveConnectivity]);

  const sidebarsCollapsed =
    (recentChatsCollapsed ? 1 : 0) + (rightPanelCollapsed ? 1 : 0);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const visibleMessages = useMemo(() => {
    const messages = activeConversation?.messages ?? [];
    if (!streamingBuffer || streamingBuffer.conversationId !== activeConversation?.id) {
      return messages;
    }
    return messages.map((message) =>
      message.id === streamingBuffer.messageId
        ? {
            ...message,
            content: streamingBuffer.content,
            reasoning: streamingBuffer.reasoning || message.reasoning,
            webSearchState: streamingBuffer.webSearchState ?? message.webSearchState,
            toolStates: streamingBuffer.toolStates ?? message.toolStates,
          }
        : message,
    );
  }, [activeConversation?.id, activeConversation?.messages, streamingBuffer]);

  const selectedModelContextSettings = useMemo(() => {
    const override = modelOverrides[selectedModel];
    return {
      contextLength: override?.contextLength ?? defaultContextLength,
      reservedOutputTokens: override?.reservedOutputTokens ?? defaultReservedOutputTokens,
    };
  }, [defaultContextLength, defaultReservedOutputTokens, modelOverrides, selectedModel]);

  const selectedModelInfo = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel],
  );
  const supportsImages = selectedModelInfo?.supportsImages ?? false;

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeConversationId && activeChatJobIdRef.current) {
        aiScheduler.cancelAiJob(activeChatJobIdRef.current);
        setRequestStatus("idle");
        setStreamingMessageId(null);
        clearStreamingBuffer();
      }
      aiScheduler.cancelAiJobsByConversation(id);
      deleteConversation(id);
    },
    [activeConversationId, clearStreamingBuffer, deleteConversation],
  );

  const handleNewChat = useCallback(() => {
    if (activeChatJobIdRef.current) aiScheduler.cancelAiJob(activeChatJobIdRef.current);
    setRequestStatus("idle");
    setStreamingMessageId(null);
    clearStreamingBuffer();
    setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    createConversation(undefined);
  }, [clearStreamingBuffer, createConversation]);

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[], options?: { memoryEnabled: boolean }) => {
      const memoryEnabled = options?.memoryEnabled ?? defaultMemoryEnabled;
      const trimmed = text.trim();
      const imageAttachments =
        attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [];
      if (!trimmed && imageAttachments.length === 0) return;
      if (imageAttachments.length > 0 && !supportsImages) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation(undefined);
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        timestamp: Date.now(),
      };
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId: selectedModel,
      };

      const previousResponseId = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId)?.lmResponseId;

      addMessagePair(conversationId, userMessage, assistantMessage, {
        deferTitle: useSettingsStore.getState().autoNameEnabled,
      });
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");

      aiScheduler.abortActiveBackgroundJob();

      const jobId = aiScheduler.enqueueAiJob({
        type: "user_chat",
        priority: 0,
        title: "Sending message",
        description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
        prompt: trimmed,
        conversationId,
        model: selectedModel,
        run: async (signal) => {
          try {
            await ensureProviderReady();
            return await executeChatSend({
              conversationId,
              userMessage,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              webSearchEnabled: effectiveWebSearchEnabled,
              codeExecutionEnabled,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(conversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(conversationId, assistantMessage.id, chunk);
              },
              onModelLoadProgress: (phase: string, percent?: number) => {
                setModelLoadProgress(
                  phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                );
              },
              onError: (error) => {
                commitAssistantMessage(conversationId, assistantMessage.id, {
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
                commitAssistantMessage(conversationId, assistantMessage.id, {
                  performance: result.performance,
                  lmResponseId: result.responseId,
                  ...(memoryPack ? { memoryPack } : {}),
                  ...(memoryEnabled && memoryRetrieval ? { memoryRetrieval } : {}),
                  ...(webSearchSources ? { webSearchSources } : {}),
                });
              },
            });
          } catch (error) {
            if (!signal.aborted) {
              commitAssistantMessage(conversationId, assistantMessage.id, {
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
      addMessagePair,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      createConversation,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      codeExecutionEnabled,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
      supportsImages,
    ],
  );

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
    [activeConversationId],
  );

  const handleEditCancel = useCallback(() => setEditingMessageId(null), []);

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
              codeExecutionEnabled,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(activeConversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(activeConversationId, assistantMessage.id, chunk);
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
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  performance: result.performance,
                  lmResponseId: result.responseId,
                  ...(memoryPack ? { memoryPack } : {}),
                  ...(memoryEnabled && memoryRetrieval ? { memoryRetrieval } : {}),
                  ...(webSearchSources ? { webSearchSources } : {}),
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
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      codeExecutionEnabled,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
      truncateAfterMessage,
      updateMessage,
    ],
  );

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
              userMessage: userMsg,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              webSearchEnabled: effectiveWebSearchEnabled,
              codeExecutionEnabled,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(activeConversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(activeConversationId, assistantMessage.id, chunk);
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
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  performance: result.performance,
                  lmResponseId: result.responseId,
                  ...(memoryPack ? { memoryPack } : {}),
                  ...(memoryEnabled && memoryRetrieval ? { memoryRetrieval } : {}),
                  ...(webSearchSources ? { webSearchSources } : {}),
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
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      codeExecutionEnabled,
      removeLastMessagePair,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
    ],
  );

  const handleRetry = useCallback(
    (messageId: string) => handleRegenerate(messageId),
    [handleRegenerate],
  );

  const handleCopyMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      if (!message) return;
      void navigator.clipboard.writeText(message.content);
    },
    [activeConversationId],
  );

  const handleForkMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      forkConversation(activeConversationId, messageId);
    },
    [activeConversationId, forkConversation],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      deleteMessage(activeConversationId, messageId);
    },
    [activeConversationId, deleteMessage],
  );

  const handleTriggerMemoryExtraction = useCallback(() => {
    if (!activeConversationId) return;
    const chatModel = useProviderStore.getState().selectedModel.trim();
    const providerId = useProviderStore.getState().selectedProvider;
    if (!chatModel) return;
    void triggerMemoryExtractionNow({
      conversationId: activeConversationId,
      chatModel,
      providerId,
    });
  }, [activeConversationId]);

  const editInitialValue = useMemo(() => {
    if (!editingMessageId) return "";
    return activeConversation?.messages.find((m) => m.id === editingMessageId)?.content ?? "";
  }, [editingMessageId, activeConversation?.messages]);

  return {
    activeConversation,
    visibleMessages,
    requestStatus,
    streamingMessageId,
    modelLoadProgress,
    webSearchEnabled,
    setWebSearchEnabled,
    effectiveWebSearchEnabled,
    webSearchDisabled,
    webSearchAvailability,
    selectedModel,
    selectedModelInfo,
    supportsImages,
    providers,
    models,
    selectedProvider,
    connectionPhase,
    connectionError,
    favoriteModels,
    defaultContextLength,
    defaultReservedOutputTokens,
    resolvedContextLength: selectedModelContextSettings.contextLength,
    resolvedReservedOutputTokens: selectedModelContextSettings.reservedOutputTokens,
    sidebarsCollapsed,
    handleSend,
    handleEditMessage,
    handleEditCancel,
    handleEditSave,
    handleRegenerate,
    handleRetry,
    handleCopyMessage,
    handleForkMessage,
    handleDeleteMessage,
    handleTriggerMemoryExtraction,
    editingMessageId,
    editInitialValue,
    handleNewChat,
    handleDeleteChat,
  };
}
