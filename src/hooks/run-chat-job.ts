import { aiScheduler } from "@/lib/ai-scheduler";
import { executeChatSend, ensureProviderReady } from "@/modules/chat/chat-actions";
import type { ChatMessage, RequestStatus } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";
import { resetStudioRepairGuard } from "@/modules/chat/studio/studio-runtime";

export interface RunChatJobParams {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  trimmed: string;
  previousResponseId: string | undefined;
  selectedProvider: string;
  selectedModel: string;
  memoryEnabled: boolean;
  effectiveWebSearchEnabled: boolean;
  effectiveCodeExecutionEnabled: boolean;
  enhancedModeEnabled: boolean;
  projectId?: string;
  setRequestStatus: React.Dispatch<React.SetStateAction<RequestStatus>>;
  setStreamingMessageId: (id: string | null) => void;
  activeChatJobIdRef: React.MutableRefObject<string | null>;
}

export function runChatJob({
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
}: RunChatJobParams) {
  const {
    appendStreamingContent,
    appendStreamingReasoning,
    clearStreamingBufferUnlessSkipped,
    commitAssistantMessage,
    setModelLoadProgress,
  } = useChatStore.getState();

  setStreamingMessageId(assistantMessage.id);
  setRequestStatus("streaming");
  resetStudioRepairGuard(conversationId, assistantMessage.id);
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
            useChatStore.getState().clearStreamingBuffer();
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
}
