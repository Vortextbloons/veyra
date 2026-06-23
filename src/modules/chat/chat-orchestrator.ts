import type { ChatMessage, WebSearchSource } from "@/modules/chat/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { buildChatContext } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderChatOptions, ProviderToolCall } from "@/lib/providers/types";
import type { MemoryPack } from "@/modules/memory/memory-types";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { buildMemoryPackWithInfo } from "@/modules/memory/memory-retrieval";
import type { MemoryRetrievalInfo } from "@/modules/memory/memory-types";
import { resolveCharacterBlock } from "@/lib/resolve-character-block";
import { buildProviderTools } from "@/lib/tool-registry";
import { buildContextAnchoringBlock, buildDocumentInstructionsBlock, buildProjectContextBlock } from "@/lib/prompts";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useProviderStore } from "@/stores/provider-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { buildMessagePerformance } from "@/lib/performance";
import { registerStreamingToolCall } from "@/modules/chat/chat-tool-utils";
import { executeToolRound } from "@/modules/chat/chat-tool-rounds";

/**
 * Optional context threaded through to the chat consumer's onComplete
 * by the orchestrator. The provider does NOT fill this — it is the
 * orchestrator's job to attach the memoryPack that was injected into
 * the request.
 */
export interface SendChatCompleteContext {
  memoryPack: MemoryPack | null;
  memoryRetrieval: MemoryRetrievalInfo;
  webSearchSources?: WebSearchSource[];
  scratchpadContent?: string;
}

type SendChatRequest = Omit<ProviderChatOptions, "messages" | "onComplete"> & {
  providerId: string;
  messages: ChatMessage[];
  /** When false, no memory retrieval, no pack injection, no extraction. */
  memoryEnabled: boolean;
  /** When false, web search tools are not offered and searches are not run. */
  webSearchEnabled: boolean;
  /** When false, the Python execution tool is not offered. */
  codeExecutionEnabled: boolean;
  /** When true, enhanced mode tools (scratchpad, ask_question) are available. */
  enhancedMode: boolean;
  conversationId?: string;
  projectId?: string;
  onComplete?: (
    result: LmChatCompleteResult,
    context: SendChatCompleteContext,
  ) => void;
};

function latestUserMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_ROUNDS_ENHANCED = 10;

export async function sendChatRequest({
  providerId,
  messages,
  memoryEnabled,
  webSearchEnabled,
  codeExecutionEnabled,
  enhancedMode,
  conversationId,
  projectId,
  ...options
}: SendChatRequest): Promise<void> {
  const provider = getProviderAdapter(providerId);
  if (!provider) {
    options.onError(`Provider not found: ${providerId}`);
    return;
  }

  const settings = useSettingsStore.getState();

  const providerStore = useProviderStore.getState();
  const activeModelInfo = providerStore.models.find((m) => m.id === options.model);
  const activeProviderInfo = providerStore.providers.find((p) => p.id === providerId);
  const activeModelName = activeModelInfo?.name;
  const activeProviderName = activeProviderInfo?.name;

  const { pack: memoryPack, info: memoryRetrieval } = await buildMemoryPackWithInfo({
    enabled: memoryEnabled,
    mode: settings.memoryMode,
    query: latestUserMessageText(messages),
    messages,
    projectId,
    budget: settings.maxMemoryTokens,
    maxNodes: settings.maxMemoryNodes,
  });

  const userOnComplete = options.onComplete;

  const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;
  const resolvedMaxTokens = options.maxTokens ?? settings.getModelSettings(options.model).maxTokens;
  const resolvedTopP = options.topP ?? settings.getModelSettings(options.model).topP;
  const resolvedRepetitionPenalty = options.repetitionPenalty ?? settings.getModelSettings(options.model).repetitionPenalty;
  const resolvedStopSequences = options.stopSequences ?? settings.getModelSettings(options.model).stopSequences;
  const resolvedReservedOutputTokens = settings.getModelSettings(options.model).reservedOutputTokens;
  const resolvedUserPrompt = settings.getModelSettings(options.model).systemPrompt || undefined;

  // Build project prompt block when a project is active
  const projectRecord = projectId
    ? useProjectStore.getState().projects.find((p) => p.id === projectId)
    : undefined;
  const projectPromptBlock = projectRecord?.systemPrompt?.trim()
    ? buildProjectContextBlock({
        name: projectRecord.name,
        kind: projectRecord.kind,
        description: projectRecord.description,
        systemPrompt: projectRecord.systemPrompt,
      })
    : undefined;

  const conversation = conversationId
    ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
    : undefined;

  const contextAnchoringBlock = settings.contextAnchoringEnabled
    ? buildContextAnchoringBlock()
    : undefined;

  const activeDocument = useDocumentStore.getState().documents.find(
    (doc) => doc.id === useDocumentStore.getState().activeDocumentId,
  );
  const documentInstructionsBlock = settings.documentPanelEnabled
    ? buildDocumentInstructionsBlock(
        activeDocument
          ? { id: activeDocument.id, title: activeDocument.title, type: activeDocument.type }
          : undefined,
      )
    : undefined;

  const effectiveConnectivity = useConnectivityStore.getState().effectiveConnectivity;
  const localServiceReady = useProviderStore.getState().providers.some(
    (provider) =>
      provider.id === useProviderStore.getState().selectedProvider &&
      provider.status === "connected",
  );
  const webSearchAvailability = isFeatureAvailable(
    "webSearch",
    effectiveConnectivity,
    localServiceReady,
  );
  const effectiveWebSearchEnabled = webSearchEnabled && webSearchAvailability.available;
  const codeExecutionAvailability = isFeatureAvailable(
    "codeExecution",
    effectiveConnectivity,
    localServiceReady,
  );
  const effectiveCodeExecutionEnabled =
    codeExecutionEnabled && codeExecutionAvailability.available;

  const providerTools = buildProviderTools({
    webSearchEnabled: effectiveWebSearchEnabled,
    documentToolsEnabled: settings.documentPanelEnabled,
    codeExecutionEnabled: effectiveCodeExecutionEnabled,
    activeDocumentId: activeDocument?.id,
    enhancedMode,
  });

  let accumulatedContent = "";
  const wrappedOnChunk = (content: string, done: boolean) => {
    accumulatedContent += content;
    options.onChunk(content, done);
  };

  const reasoningEnabled = settings.reasoningEnabled;
  const wrappedOnReasoningChunk = options.onReasoningChunk
    ? (content: string, done: boolean) => {
        if (!reasoningEnabled) return;
        options.onReasoningChunk?.(content, done);
      }
    : undefined;

  let toolCompletion: Promise<void> = Promise.resolve();

  const handleToolCallDetected = (call: Pick<ProviderToolCall, "id" | "name">) => {
    registerStreamingToolCall(call, "pending");
  };

  const finalizeToUser = (
    result: LmChatCompleteResult,
    webSearchSources: WebSearchSource[],
  ) => {
    const chatStore = useChatStore.getState();
    const bufferScratchpad = chatStore.streamingBuffer?.scratchpadContent;
    if (webSearchSources.length > 0) {
      chatStore.completeStreamingWebSearchRounds();
    }
    chatStore.clearStreamingBufferUnlessSkipped();
    userOnComplete?.(result, {
      memoryPack,
      memoryRetrieval,
      webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
      scratchpadContent: bufferScratchpad,
    });
    chatStore.resetAfterRePrompt();
  };

  const buildRoundMessages = (
    chainMessages: ChatMessage[],
    webSearchContextBlocks: string[],
  ): ChatMessage[] =>
    buildChatContext(
      chainMessages,
      {
        memoryPack: memoryPack ?? null,
        conversationSummary: conversation?.conversationSummary,
        summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
        webSearchContextBlock:
          webSearchContextBlocks.length > 0
            ? webSearchContextBlocks.join("\n\n")
            : undefined,
        documentInstructionsBlock,
        projectPromptBlock,
        userPrompt: resolvedUserPrompt,
        reservedOutputTokens: resolvedReservedOutputTokens,
        modelName: activeModelName,
        providerName: activeProviderName,
        characterBlock: resolveCharacterBlock(conversation, chainMessages),
      },
      resolvedContextLength,
    );

  const providerChatBase = () => ({
    ...options,
    previousResponseId: undefined,
    reasoningEnabled,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolvedContextLength,
    maxTokens: resolvedMaxTokens || undefined,
    topP: resolvedTopP,
    repetitionPenalty: resolvedRepetitionPenalty,
    stopSequences: resolvedStopSequences,
    tools: providerTools,
    toolChoice: providerTools.length > 0 ? ("auto" as const) : ("none" as const),
    onToolCallDetected: handleToolCallDetected,
  });

  const formatToolResultsMessage = (sections: string[]): string => {
    if (sections.length === 0) {
      return "Tool calls completed with no usable results. Continue or answer from context.";
    }
    return `${sections.join("\n\n")}\n\nUse the tool results above. You may call more tools if needed before answering. For web search, sources are displayed separately — do not list or cite URLs in prose.`;
  };

  const retryDocMutationWithLLM = async (
    assistantContent: string,
    errorMessage: string,
  ): Promise<ProviderToolCall[]> => {
    let retryToolCalls: ProviderToolCall[] = [];
    await provider.sendChat({
      ...providerChatBase(),
      onChunk: () => {},
      onReasoningChunk: () => {},
      onComplete: (nextResult) => {
        retryToolCalls = nextResult.toolCalls ?? [];
      },
      messages: buildRoundMessages(
        [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assistantContent || accumulatedContent,
            timestamp: Date.now(),
            modelId: options.model,
          },
          {
            id: crypto.randomUUID(),
            role: "user",
            content: `Your previous document tool call failed. Failure reason: ${errorMessage}. Retry by calling exactly one corrected document tool. Do not answer in prose.`,
            timestamp: Date.now(),
          },
        ],
        [],
      ),
    });
    return retryToolCalls;
  };

  const executeToolRoundLocal = async (toolCalls: ProviderToolCall[]) => {
    const buffer = useChatStore.getState().streamingBuffer;
    return executeToolRound(toolCalls, {
      signal: options.signal,
      projectId,
      conversationId,
      assistantMessageId: buffer?.messageId,
      webSearchEnabled: effectiveWebSearchEnabled,
      webSearchAvailability,
      retryDocMutationWithLLM,
      docMutationConversationId: conversationId,
      codeExecution: {
        timeoutSecs: settings.codeExecutionTimeoutSecs,
        pythonPath: settings.customPythonPath.trim() || null,
      },
    });
  };

  const rePromptWithTools = async (
    chainMessages: ChatMessage[],
    round: number,
    accumulatedSearchSources: WebSearchSource[],
    accumulatedContextBlocks: string[],
  ): Promise<void> => {
    if (options.signal?.aborted) return;
    const maxRounds = enhancedMode ? MAX_TOOL_ROUNDS_ENHANCED : MAX_TOOL_ROUNDS;
    if (round >= maxRounds) {
      options.onError(`Stopped after ${maxRounds} tool rounds.`);
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
      options.onChunk(content, done);
    };

    await new Promise<void>((resolve, reject) => {
      void provider.sendChat({
        ...providerChatBase(),
        onChunk: roundOnChunk,
        onReasoningChunk: wrappedOnReasoningChunk,
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
                options.onChunk(chunk, false);
              }

              const assistantMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: roundContent,
                timestamp: Date.now(),
                modelId: options.model,
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

              await rePromptWithTools(nextChain, round + 1, nextSources, nextBlocks);
              resolve();
            } catch (error) {
              reject(error);
            }
          })();
        },
        messages: buildRoundMessages(chainMessages, accumulatedContextBlocks),
      }).catch(reject);
    });
  };

  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      userOnComplete?.(result, { memoryPack, memoryRetrieval });
      return;
    }

    useChatStore.getState().skipNextBufferClear();

    toolCompletion = (async () => {
      try {
        if (options.signal?.aborted) return;

        const exec = await executeToolRoundLocal(toolCalls);
        for (const chunk of exec.streamedChunks) {
          accumulatedContent = accumulatedContent
            ? `${accumulatedContent}\n\n${chunk}`
            : chunk;
          options.onChunk(chunk, false);
        }

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: accumulatedContent,
          timestamp: Date.now(),
          modelId: options.model,
        };
        const toolUserMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: formatToolResultsMessage(exec.toolResultSections),
          timestamp: Date.now(),
        };
        const chain = [...messages, assistantMsg, toolUserMsg];

        await rePromptWithTools(
          chain,
          1,
          exec.webSearchSources,
          exec.webSearchContextBlocks,
        );
      } catch (error) {
        if (options.signal?.aborted) return;
        console.error("[chat-orchestrator] Tool round failed:", error);
        const message = error instanceof Error ? error.message : String(error);
        options.onError(message);
        useChatStore.getState().clearStreamingBufferUnlessSkipped();
        userOnComplete?.(result, { memoryPack, memoryRetrieval });
        useChatStore.getState().resetAfterRePrompt();
      }
    })();
  };

  await provider.sendChat({
    ...options,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolvedContextLength,
    maxTokens: resolvedMaxTokens || undefined,
    topP: resolvedTopP,
    repetitionPenalty: resolvedRepetitionPenalty,
    stopSequences: resolvedStopSequences,
    tools: providerTools,
    toolChoice: providerTools.length > 0 ? "auto" : "none",
    onChunk: wrappedOnChunk,
    onReasoningChunk: wrappedOnReasoningChunk,
    reasoningEnabled,
    onToolCallDetected: handleToolCallDetected,
    onComplete: wrappedOnComplete,
    messages: buildChatContext(
      messages,
      {
        memoryPack: memoryPack ?? null,
        conversationSummary: conversation?.conversationSummary,
        summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
        contextAnchoringBlock,
        documentInstructionsBlock,
        projectPromptBlock,
        userPrompt: resolvedUserPrompt,
        reservedOutputTokens: resolvedReservedOutputTokens,
        modelName: activeModelName,
        providerName: activeProviderName,
        characterBlock: resolveCharacterBlock(conversation, messages),
      },
      resolvedContextLength,
    ),
  });
  await toolCompletion;

}
