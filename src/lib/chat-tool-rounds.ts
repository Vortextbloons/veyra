import type { ProviderToolCall } from "@/lib/providers/types";
import type { WebSearchSource } from "@/lib/chat-types";
import {
  WEB_SEARCH_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  CODE_EXEC_TOOL_NAME,
  DOC_CREATE_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
} from "@/lib/tool-registry";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
  registerStreamingToolCalls,
} from "@/lib/chat-tool-utils";
import { useChatStore } from "@/stores/chat-store";
import { executeWebSearchCall } from "@/lib/chat-tools/web-search-tool";
import { executeDocReadCall, executeDocMutationCalls } from "@/lib/chat-tools/document-tool";
import {
  executeCodeExecutionCall,
  type CodeExecutionSettings,
} from "@/lib/chat-tools/code-execution-tool";

export type ToolRoundResult = {
  toolResultSections: string[];
  webSearchSources: WebSearchSource[];
  webSearchContextBlocks: string[];
  streamedChunks: string[];
};

type ToolRoundContext = {
  signal?: AbortSignal;
  projectId?: string;
  webSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
  retryDocMutationWithLLM: (
    assistantContent: string,
    errorMessage: string,
  ) => Promise<ProviderToolCall[]>;
  docMutationConversationId?: string;
  codeExecution: CodeExecutionSettings;
};

export async function executeToolRound(
  toolCalls: ProviderToolCall[],
  ctx: ToolRoundContext,
): Promise<ToolRoundResult> {
  const webSearchCalls = toolCalls.filter((call) => call.name === WEB_SEARCH_TOOL_NAME);
  const docReadCalls = toolCalls.filter((call) => call.name === DOC_READ_TOOL_NAME);
  const codeExecutionCalls = toolCalls.filter((call) => call.name === CODE_EXEC_TOOL_NAME);
  const docMutationCalls = toolCalls.filter(
    (call) => call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
  );

  registerStreamingToolCalls(toolCalls, "running", (call) => {
    if (call.name === WEB_SEARCH_TOOL_NAME) return stringArg(call.arguments, "query");
    if (call.name === CODE_EXEC_TOOL_NAME) {
      return summarizeCodeSnippet(stripPythonCodeFence(stringArg(call.arguments, "code")));
    }
    return stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId");
  });

  const toolResultSections: string[] = [];
  const webSearchSources: WebSearchSource[] = [];
  const webSearchContextBlocks: string[] = [];
  const streamedChunks: string[] = [];

  const webResults = await Promise.all(
    webSearchCalls.map(async (call) => {
      try {
        return await executeWebSearchCall(call, 0, {
          signal: ctx.signal,
          projectId: ctx.projectId,
          webSearchEnabled: ctx.webSearchEnabled,
          webSearchAvailability: ctx.webSearchAvailability,
        });
      } catch (error) {
        const chatStore = useChatStore.getState();
        const query = stringArg(call.arguments, "query");
        const message = error instanceof Error ? error.message : String(error);
        useChatStore.getState().upsertStreamingWebSearchRound({
          id: call.id,
          query: query || "Web search",
          phase: "error",
          sources: [],
          error: message,
        });
        chatStore.setStreamingToolState({
          id: call.id,
          name: WEB_SEARCH_TOOL_NAME,
          label: "Web Search",
          phase: "error",
          input: query,
          error: message,
        });
        return {
          section: `Tool result for ${WEB_SEARCH_TOOL_NAME}: ${message}`,
          sources: [] as WebSearchSource[],
          contextBlock: "",
          query: query || "Web search",
        };
      }
    }),
  );

  for (const result of webResults) {
    toolResultSections.push(result.section);
    webSearchSources.push(...result.sources);
    if (result.contextBlock) webSearchContextBlocks.push(result.contextBlock);
  }

  const docReadSections = await Promise.all(
    docReadCalls.map((call) => executeDocReadCall(call)),
  );
  toolResultSections.push(...docReadSections);

  for (const call of codeExecutionCalls) {
    toolResultSections.push(await executeCodeExecutionCall(call, ctx.codeExecution));
  }

  if (docMutationCalls.length > 0) {
    const mutationResult = await executeDocMutationCalls(docMutationCalls, {
      retryWithLLM: ctx.retryDocMutationWithLLM,
      conversationId: ctx.docMutationConversationId,
    });
    toolResultSections.push(...mutationResult.sections);
    streamedChunks.push(...mutationResult.streamedChunks);
  }

  return {
    toolResultSections,
    webSearchSources,
    webSearchContextBlocks,
    streamedChunks,
  };
}
