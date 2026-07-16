import type { ChatMessage, WebSearchSource } from "@/modules/chat/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import type { ProviderAdapter, ProviderChatOptions, ProviderToolCall } from "@/lib/providers/types";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { executeToolRound } from "@/modules/chat/chat-tool-rounds";
import { buildRoundMessages, formatToolResultsMessage, type RoundMessagesContext } from "@/modules/chat/chat-context-builder";
import { buildMessagePerformance } from "@/lib/performance";

export const MAX_TOOL_ROUNDS = 6;
export const MAX_TOOL_ROUNDS_ENHANCED = 10;

function stripImageAttachments(messages: ChatMessage[]): ChatMessage[] {
  let changed = false;
  const result: ChatMessage[] = [];
  for (const msg of messages) {
    const hasImages = msg.attachments?.some((a) => a.fileType === "image");
    if (!hasImages) {
      result.push(msg);
      continue;
    }
    changed = true;
    const filtered = msg.attachments!.filter((a) => a.fileType !== "image");
    result.push({
      ...msg,
      attachments: filtered.length > 0 ? filtered : undefined,
    });
  }
  return changed ? result : messages;
}

export async function rePromptWithTools(params: {
  provider: ProviderAdapter;
  providerChatBase: () => Omit<ProviderChatOptions, "messages" | "onComplete">;
  chainMessages: ChatMessage[];
  round: number;
  accumulatedSearchSources: WebSearchSource[];
  accumulatedContextBlocks: string[];
  accumulatedContent: string;
  enhancedMode: boolean;
  signal?: AbortSignal;
  model: string;
  modelSupportsImages: boolean;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onError: (error: string) => void;
  finalizeToUser: (result: LmChatCompleteResult, webSearchSources: WebSearchSource[]) => void;
  roundMessagesContext: RoundMessagesContext;
  executeToolRoundLocal: (toolCalls: ProviderToolCall[]) => Promise<{
    toolResultSections: string[];
    webSearchSources: WebSearchSource[];
    webSearchContextBlocks: string[];
    streamedChunks: string[];
  }>;
}): Promise<void> {
  const {
    provider,
    providerChatBase,
    chainMessages,
    round,
    accumulatedSearchSources,
    accumulatedContextBlocks,
    accumulatedContent: _accumulatedContent,
    enhancedMode,
    signal,
    model,
    onChunk,
    onReasoningChunk,
    onError,
    finalizeToUser,
    roundMessagesContext,
    executeToolRoundLocal,
  } = params;

  let accumulatedContent = _accumulatedContent;

  if (signal?.aborted) return;
  const maxRounds = enhancedMode ? MAX_TOOL_ROUNDS_ENHANCED : MAX_TOOL_ROUNDS;
  if (round >= maxRounds) {
    onError(`Stopped after ${maxRounds} tool rounds.`);
    const now = Date.now();
    finalizeToUser(
      {
        performance: buildMessagePerformance({
          content: accumulatedContent,
          startedAt: now,
          completedAt: now,
        }),
        toolCalls: [],
      },
      accumulatedSearchSources,
    );
    return;
  }

  let roundContent = "";
  const roundOnChunk = (content: string, done: boolean) => {
    roundContent += content;
    accumulatedContent += content;
    onChunk(content, done);
  };

  await new Promise<void>((resolve, reject) => {
    void provider.sendChat({
      ...providerChatBase(),
      onChunk: roundOnChunk,
      onReasoningChunk,
      onComplete: (result) => {
        void (async () => {
          try {
            const toolCalls = result.toolCalls ?? [];
            if (toolCalls.length === 0) {
              finalizeToUser(result, accumulatedSearchSources);
              resolve();
              return;
            }

            const exec = await executeToolRoundLocal(toolCalls);
            for (const chunk of exec.streamedChunks) {
              accumulatedContent = accumulatedContent
                ? `${accumulatedContent}\n\n${chunk}`
                : chunk;
              onChunk(chunk, false);
            }

            const assistantMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: roundContent,
              timestamp: Date.now(),
              modelId: model,
            };
            const toolUserMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "user",
              content: formatToolResultsMessage(exec.toolResultSections),
              timestamp: Date.now(),
            };
            const nextChain = [...chainMessages, assistantMsg, toolUserMsg];
            const nextSources = [...accumulatedSearchSources, ...exec.webSearchSources];
            const nextBlocks = [
              ...accumulatedContextBlocks,
              ...exec.webSearchContextBlocks,
            ];

            await rePromptWithTools({
              ...params,
              chainMessages: nextChain,
              round: round + 1,
              accumulatedSearchSources: nextSources,
              accumulatedContextBlocks: nextBlocks,
              accumulatedContent,
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        })();
      },
      messages: params.modelSupportsImages
        ? buildRoundMessages(chainMessages, accumulatedContextBlocks, roundMessagesContext)
        : stripImageAttachments(buildRoundMessages(chainMessages, accumulatedContextBlocks, roundMessagesContext)),
    }).catch(reject);
  });
}

export function createExecuteToolRoundLocal(params: {
  signal?: AbortSignal;
  projectId?: string;
  conversationId?: string;
  effectiveWebSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
  retryDocMutationWithLLM: (assistantContent: string, errorMessage: string) => Promise<ProviderToolCall[]>;
  conversationIdForDocMutation?: string;
}) {
  const settings = useSettingsStore.getState();
  let preferredDocumentId: string | undefined;
  return async (toolCalls: ProviderToolCall[]) => {
    const buffer = useChatStore.getState().streamingBuffer;
    const activeProject = useProjectStore.getState().activeProject();
    const workspaceRoot = activeProject?.settings?.agentProjectPath?.trim() || null;
    const result = await executeToolRound(toolCalls, {
      signal: params.signal,
      projectId: params.projectId,
      conversationId: params.conversationId,
      assistantMessageId: buffer?.messageId,
      webSearchEnabled: params.effectiveWebSearchEnabled,
      webSearchAvailability: params.webSearchAvailability,
      retryDocMutationWithLLM: params.retryDocMutationWithLLM,
      docMutationConversationId: params.conversationIdForDocMutation,
      codeExecution: {
        timeoutSecs: settings.codeExecutionTimeoutSecs,
        pythonPath: settings.customPythonPath.trim() || null,
        workspaceRoot,
      },
      preferredDocumentId,
    });
    preferredDocumentId = result.lastCreatedDocumentId ?? preferredDocumentId;
    return result;
  };
}
