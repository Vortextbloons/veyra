import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import { triggerMemoryExtractionNow } from "@/modules/chat/chat-actions";
import type { RequestStatus } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useIsFeatureAvailable } from "@/lib/connectivity/useConnectivity";
import { useChatSend } from "@/hooks/use-chat-send";
import { useChatEditing } from "@/hooks/use-chat-editing";
import { useChatRegeneration } from "@/hooks/use-chat-regeneration";

interface UseChatPipelineOptions {
  projectId?: string;
  agentModeEnabled?: boolean;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  codeExecutionEnabled?: boolean;
}

export function useChatPipeline({
  projectId,
  agentModeEnabled = false,
  webSearchEnabled: controlledWebSearchEnabled,
  onWebSearchChange,
  codeExecutionEnabled: controlledCodeExecutionEnabled,
}: UseChatPipelineOptions = {}) {
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
  const forkConversation = useChatStore((state) => state.forkConversation);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);

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
  const defaultCodeExecutionEnabled = useSettingsStore((s) => s.codeExecutionEnabled);
  const codeExecutionEnabled = controlledCodeExecutionEnabled ?? defaultCodeExecutionEnabled;
  const enhancedModeEnabled = useSettingsStore((s) => s.enhancedModeEnabled);

  const effectiveConnectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const webSearchAvailability = useIsFeatureAvailable("webSearch");
  const codeExecutionAvailability = useIsFeatureAvailable("codeExecution");
  const webSearchDisabled = !webSearchAvailability.available;
  const codeExecutionDisabled = !codeExecutionAvailability.available;
  const [internalWebSearchEnabled, setInternalWebSearchEnabled] = useState(
    useSettingsStore.getState().defaultWebSearchEnabled,
  );
  const webSearchEnabled = controlledWebSearchEnabled ?? internalWebSearchEnabled;
  const setWebSearchEnabled = onWebSearchChange ?? setInternalWebSearchEnabled;
  const effectiveWebSearchEnabled =
    effectiveConnectivity === "online" && webSearchEnabled && !webSearchDisabled;
  const effectiveCodeExecutionEnabled = codeExecutionEnabled && !codeExecutionDisabled;
  const prevEffectiveConnectivityRef = useRef(effectiveConnectivity);

  useEffect(() => {
    const prev = prevEffectiveConnectivityRef.current;
    prevEffectiveConnectivityRef.current = effectiveConnectivity;
    if (prev === "offline" && effectiveConnectivity === "online") {
      setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    }
  }, [effectiveConnectivity, setWebSearchEnabled]);

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
    createConversation(projectId);
  }, [clearStreamingBuffer, createConversation, projectId, setWebSearchEnabled]);

  const sharedPipelineProps = {
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
  };

  const { handleSend } = useChatSend({
    ...sharedPipelineProps,
    agentModeEnabled,
    supportsImages,
    selectedModelContextSettings,
  });

  const { handleEditMessage, handleEditCancel, handleEditSave } = useChatEditing({
    ...sharedPipelineProps,
    setEditingMessageId,
  });

  const { handleRegenerate, handleRetry } = useChatRegeneration(sharedPipelineProps);

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
    isStreaming: requestStatus === "streaming",
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
    enhancedModeEnabled,
  };
}
