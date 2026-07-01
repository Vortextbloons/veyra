import { useCallback } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useSettingsStore } from "@/stores/settings-store";
import { filterAttachments } from "@/hooks/use-chat-attachments";
import { runChatJob } from "@/hooks/run-chat-job";

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

      runChatJob({
        conversationId,
        userMessage,
        assistantMessage,
        trimmed,
        previousResponseId,
        selectedProvider,
        selectedModel,
        memoryEnabled,
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
