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
import { parseWebSearchToolCall } from "@/modules/web-search/tools/webSearchTool";
import { runSearch, buildSearchContextBlock } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { buildWebSearchHintBlock } from "@/lib/prompts";

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
  const webSearchEnabled = settings.webSearchEnabled;

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

        void (async () => {
          try {
            // Clear the tool-call JSON and show searching progress
            useChatStore.getState().clearStreamingBuffer();
            options.onChunk(`Searching the web for: "${toolCall.args.query}"…`, false);

            const searchBundle = await runSearch(toolCall.args.query);
            const contextBlock = buildSearchContextBlock(searchBundle);

            // Update progress with result count
            useChatStore.getState().clearStreamingBuffer();
            options.onChunk(
              `Found ${searchBundle.sources.length} sources. Reading…`,
              false,
            );

            // Brief pause so the user sees the progress
            await new Promise((r) => setTimeout(r, 600));

            // Clear progress and start streaming the final answer
            useChatStore.getState().clearStreamingBuffer();

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
                content: `Here are the web search results for "${toolCall.args.query}". Please answer the original question using these sources. Cite URLs when referencing search results.`,
                timestamp: Date.now(),
              },
            ];

            const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;
            const conversation = conversationId
              ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
              : undefined;

            const searchSources: WebSearchSource[] = searchBundle.sources.map((s) => ({
              id: s.id,
              title: s.title,
              url: s.url,
              snippet: s.snippet,
            }));

            await provider.sendChat({
              ...options,
              previousResponseId: undefined,
              onChunk: options.onChunk,
              temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
              contextLength: resolvedContextLength,
              onComplete: (rePromptResult) => {
                userOnComplete?.(rePromptResult, { memoryPack, memoryRetrieval, webSearchSources: searchSources });
              },
              messages: buildChatContext(
                rePromptMessages,
                {
                  memoryPack: memoryPack ?? null,
                  conversationSummary: conversation?.conversationSummary,
                  summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
                  webSearchContextBlock: contextBlock,
                },
                resolvedContextLength,
              ),
            });
          } catch (searchError) {
            console.error("[WebSearch] Search failed:", searchError);
            // Clear the tool-call JSON and show a user-facing error message
            useChatStore.getState().clearStreamingBuffer();
            const errorMsg = searchError instanceof Error ? searchError.message : String(searchError);
            options.onChunk(`Web search failed: ${errorMsg}`, false);
            userOnComplete?.(result, { memoryPack, memoryRetrieval });
          }
        })();
        return;
      }
    }

    userOnComplete?.(result, { memoryPack, memoryRetrieval });
  };

  const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;

  const conversation = conversationId
    ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
    : undefined;

  await provider.sendChat({
    ...options,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolvedContextLength,
    onChunk: wrappedOnChunk,
    onComplete: wrappedOnComplete,
    messages: buildChatContext(
      messages,
      {
        memoryPack: memoryPack ?? null,
        conversationSummary: conversation?.conversationSummary,
        summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
        webSearchHintBlock: webSearchEnabled ? buildWebSearchHintBlock() : undefined,
      },
      resolvedContextLength,
    ),
  });

}
