import { useCallback } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeChatSend, ensureProviderReady } from "@/modules/chat/chat-actions";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useSettingsStore } from "@/stores/settings-store";
import { filterAttachments } from "@/hooks/use-chat-attachments";

interface UseChatSendOptions {
  activeConversationId: string | null;
  projectId?: string;
  agentModeEnabled: boolean;
  selectedModel: string;
  selectedProvider: string;
  supportsImages: boolean;
  defaultMemoryEnabled: boolean;
  effectiveWebSearchEnabled: boolean;
  effectiveCodeExecutionEnabled: boolean;
  enhancedModeEnabled: boolean;
  selectedModelContextSettings: { contextLength: number; reservedOutputTokens: number };
  setRequestStatus: React.Dispatch<React.SetStateAction<RequestStatus>>;
  setStreamingMessageId: (id: string | null) => void;
  activeChatJobIdRef: React.MutableRefObject<string | null>;
}

export function useChatSend({
  activeConversationId,
  projectId,
  agentModeEnabled,
  selectedModel,
  selectedProvider,
  supportsImages,
  defaultMemoryEnabled,
  effectiveWebSearchEnabled,
  effectiveCodeExecutionEnabled,
  enhancedModeEnabled,
  selectedModelContextSettings,
  setRequestStatus,
  setStreamingMessageId,
  activeChatJobIdRef,
}: UseChatSendOptions) {
  const createConversation = useChatStore((state) => state.createConversation);
  const addMessagePair = useChatStore((state) => state.addMessagePair);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const appendStreamingReasoning = useChatStore((state) => state.appendStreamingReasoning);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);
  const clearStreamingBufferUnlessSkipped = useChatStore(
    (state) => state.clearStreamingBufferUnlessSkipped,
  );
  const commitAssistantMessage = useChatStore((state) => state.commitAssistantMessage);
  const setModelLoadProgress = useChatStore((state) => state.setModelLoadProgress);

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[], options?: { memoryEnabled: boolean }) => {
      const memoryEnabled = options?.memoryEnabled ?? defaultMemoryEnabled;
      const trimmed = text.trim();
      const { effectiveAttachments, blocked } = filterAttachments(attachments, supportsImages, trimmed);
      const allAttachments = attachments ?? [];
      if (!trimmed && allAttachments.length === 0) return;
      if (blocked) return;

      if (agentModeEnabled) {
        if (!trimmed) return;
        const agentState = useAgentStore.getState();
        if (agentState.runtimeAvailable !== true) return;
        const agentProjectKey = agentState.projectPath.trim();
        const runningAgentSession = agentState.sessions.some(
          (session: { status: string; projectPath: string }) =>
            session.status === "running" && session.projectPath.trim() === agentProjectKey,
        );
        if (runningAgentSession) return;
        aiScheduler.abortActiveBackgroundJob();
        aiScheduler.enqueueAiJob({
          type: "agent_pi",
          priority: 0,
          title: "Running Pi agent",
          description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
          prompt: trimmed,
          model: selectedModel,
          run: async (signal) => {
            if (signal.aborted) throw new DOMException("Agent job aborted", "AbortError");
            if (selectedProvider === "lm-studio") {
              const { prepareAgentLmStudioModel } = await import("@/lib/lm-model-session");
              await prepareAgentLmStudioModel(
                selectedModel,
                selectedModelContextSettings.contextLength,
                signal,
                (phase: string, percent?: number) => {
                  setModelLoadProgress(
                    phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                  );
                },
              );
            }
            const { startSession } = useAgentStore.getState();
            const sessionId = await startSession({
              mode: agentState.mode,
              projectPath: agentState.projectPath,
              prompt: trimmed,
              model: selectedModel,
              contextLength: selectedModelContextSettings.contextLength,
              reservedOutputTokens: selectedModelContextSettings.reservedOutputTokens,
              providerId: selectedProvider,
              reasoningEnabled: useSettingsStore.getState().reasoningEnabled,
            });
            const session = useAgentStore.getState().sessions.find(
              (item: { id: string }) => item.id === sessionId,
            );
            return {
              prompt: trimmed,
              output: session?.summary,
            };
          },
        });
        return;
      }

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation(projectId);
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        attachments: effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
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
              codeExecutionEnabled: effectiveCodeExecutionEnabled,
              enhancedMode: enhancedModeEnabled,
              projectId,
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
                const scratchpadContent = context?.scratchpadContent;
                commitAssistantMessage(conversationId, assistantMessage.id, {
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
      activeChatJobIdRef,
      addMessagePair,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      createConversation,
      defaultMemoryEnabled,
      effectiveWebSearchEnabled,
      effectiveCodeExecutionEnabled,
      enhancedModeEnabled,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
      setRequestStatus,
      setStreamingMessageId,
      supportsImages,
      agentModeEnabled,
      projectId,
      selectedModelContextSettings.contextLength,
      selectedModelContextSettings.reservedOutputTokens,
    ],
  );

  return { handleSend };
}
