import type { ChatMessage, WebSearchSource } from "@/lib/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { buildChatContext } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderChatOptions } from "@/lib/providers/types";
import type { MemoryPack } from "@/lib/memory-types";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { buildMemoryPackWithInfo } from "@/lib/memory-retrieval";
import type { MemoryRetrievalInfo } from "@/lib/memory-types";
import { parseWebSearchToolCall, stripWebSearchToolCall } from "@/modules/web-search/tools/webSearchTool";
import { runSearch, buildSearchContextBlock } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { buildToolsBlock } from "@/lib/tool-registry";
import { buildContextAnchoringBlock } from "@/lib/prompts";

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
}

export type SendChatRequest = Omit<ProviderChatOptions, "messages" | "onComplete"> & {
  providerId: string;
  messages: ChatMessage[];
  /** When false, no memory retrieval, no pack injection, no extraction. */
  memoryEnabled: boolean;
  /** When false, web search tools are not offered and searches are not run. */
  webSearchEnabled: boolean;
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

export async function sendChatRequest({
  providerId,
  messages,
  memoryEnabled,
  webSearchEnabled,
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

  let accumulatedContent = "";
  const wrappedOnChunk = (content: string, done: boolean) => {
    accumulatedContent += content;
    options.onChunk(content, done);
  };

  let isRePrompt = false;

  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    if (webSearchEnabled && !isRePrompt) {
      const toolCall = parseWebSearchToolCall(accumulatedContent);

      if (toolCall) {
        isRePrompt = true;
        const chatStore = useChatStore.getState();

        // Prevent the App.tsx finally block from clearing the buffer
        chatStore.skipNextBufferClear();

        // Strip tool call JSON from accumulated content for re-prompt context
        const strippedContent = stripWebSearchToolCall(accumulatedContent);
        accumulatedContent = strippedContent;

        // Show web search UI in the existing buffer (preserves reasoning and prior content)
        chatStore.setStreamingWebSearchState({
          query: toolCall.args.query,
          phase: "searching",
          sources: [],
        });

        void (async () => {
          try {
            const searchBundle = await runSearch(toolCall.args.query);
            const contextBlock = buildSearchContextBlock(searchBundle);

            const searchSources: WebSearchSource[] = searchBundle.sources.map((s) => ({
              id: s.id,
              title: s.title,
              url: s.url,
              snippet: s.snippet,
            }));

            // Update to reading phase with sources
            chatStore.setStreamingWebSearchState({
              query: toolCall.args.query,
              phase: "reading",
              sources: searchSources,
            });

            const rePromptMessages: ChatMessage[] = [
              ...messages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: accumulatedContent,
                timestamp: Date.now(),
              },
              {
                id: crypto.randomUUID(),
                role: "user",
                content: `Here are the web search results for "${toolCall.args.query}". Answer using this information. Sources are displayed separately — do not list or cite URLs.`,
                timestamp: Date.now(),
              },
            ];

            const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;
            const conversation = conversationId
              ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
              : undefined;

            // Re-prompt — chunks stream into the same buffer
            await provider.sendChat({
              ...options,
              previousResponseId: undefined,
              onChunk: options.onChunk,
              onReasoningChunk: options.onReasoningChunk,
              temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
              contextLength: resolvedContextLength,
              maxTokens: resolvedMaxTokens || undefined,
              topP: resolvedTopP,
              repetitionPenalty: resolvedRepetitionPenalty,
              stopSequences: resolvedStopSequences,
              onComplete: (rePromptResult) => {
                // Mark search as done
                useChatStore.getState().setStreamingWebSearchState({
                  query: toolCall.args.query,
                  phase: "done",
                  sources: searchSources,
                });
                userOnComplete?.(rePromptResult, { memoryPack, memoryRetrieval, webSearchSources: searchSources });
                // Clean up streaming state after re-prompt completes
                useChatStore.getState().resetAfterRePrompt();
              },
              messages: buildChatContext(
                rePromptMessages,
                {
                  memoryPack: memoryPack ?? null,
                  conversationSummary: conversation?.conversationSummary,
                  summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
                  webSearchContextBlock: contextBlock,
                  userPrompt: resolvedUserPrompt,
                  reservedOutputTokens: resolvedReservedOutputTokens,
                },
                resolvedContextLength,
              ),
            });
          } catch (searchError) {
            console.error("[WebSearch] Search failed:", searchError);
            useChatStore.getState().setStreamingWebSearchState({
              query: toolCall.args.query,
              phase: "error",
              sources: [],
              error: searchError instanceof Error ? searchError.message : String(searchError),
            });
            userOnComplete?.(result, { memoryPack, memoryRetrieval });
            // Clean up streaming state after error
            useChatStore.getState().resetAfterRePrompt();
          }
        })();
        return;
      }
    }

    userOnComplete?.(result, { memoryPack, memoryRetrieval });
  };

  const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;
  const resolvedMaxTokens = options.maxTokens ?? settings.getModelSettings(options.model).maxTokens;
  const resolvedTopP = options.topP ?? settings.getModelSettings(options.model).topP;
  const resolvedRepetitionPenalty = options.repetitionPenalty ?? settings.getModelSettings(options.model).repetitionPenalty;
  const resolvedStopSequences = options.stopSequences ?? settings.getModelSettings(options.model).stopSequences;
  const resolvedReservedOutputTokens = settings.getModelSettings(options.model).reservedOutputTokens;
  const resolvedUserPrompt = settings.getModelSettings(options.model).systemPrompt || undefined;

  const conversation = conversationId
    ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
    : undefined;

  const isFirstMessage = messages.filter((m) => m.role === "user").length <= 1;
  const contextAnchoringBlock = isFirstMessage && settings.contextAnchoringEnabled
    ? buildContextAnchoringBlock()
    : undefined;

  await provider.sendChat({
    ...options,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolvedContextLength,
    maxTokens: resolvedMaxTokens || undefined,
    topP: resolvedTopP,
    repetitionPenalty: resolvedRepetitionPenalty,
    stopSequences: resolvedStopSequences,
    onChunk: wrappedOnChunk,
    onComplete: wrappedOnComplete,
    messages: buildChatContext(
      messages,
      {
        memoryPack: memoryPack ?? null,
        conversationSummary: conversation?.conversationSummary,
        summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
        toolsBlock: buildToolsBlock(webSearchEnabled),
        contextAnchoringBlock,
        userPrompt: resolvedUserPrompt,
        reservedOutputTokens: resolvedReservedOutputTokens,
      },
      resolvedContextLength,
    ),
  });

}
