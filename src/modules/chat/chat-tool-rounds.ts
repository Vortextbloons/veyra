import type { ProviderToolCall } from "@/lib/providers/types";
import type { WebSearchSource } from "@/modules/chat/chat-types";
import {
  WEB_SEARCH_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  CODE_EXEC_TOOL_NAME,
  DOC_CREATE_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  SCRATCHPAD_TOOL_NAME,
  ASK_QUESTION_TOOL_NAME,
  INLINE_EDIT_TOOL_NAME,
} from "@/lib/tool-registry";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
  registerStreamingToolCalls,
} from "@/modules/chat/chat-tool-utils";
import { useChatStore } from "@/stores/chat-store";
import { executeWebSearchCall } from "@/modules/chat/tools/web-search-tool";
import { executeDocReadCall, executeDocMutationCalls, executeInlineEditCall } from "@/modules/chat/tools/document-tool";
import {
  executeCodeExecutionCall,
  type CodeExecutionSettings,
} from "@/modules/chat/tools/code-execution-tool";
import { executeScratchpadCall } from "@/modules/chat/tools/scratchpad-tool";
import { executeAskQuestionCall } from "@/modules/chat/tools/ask-question-tool";

export type ToolRoundResult = {
  toolResultSections: string[];
  webSearchSources: WebSearchSource[];
  webSearchContextBlocks: string[];
  streamedChunks: string[];
  lastCreatedDocumentId?: string;
};

type ToolRoundContext = {
  signal?: AbortSignal;
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  webSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
  retryDocMutationWithLLM: (
    assistantContent: string,
    errorMessage: string,
  ) => Promise<ProviderToolCall[]>;
  docMutationConversationId?: string;
  codeExecution: CodeExecutionSettings;
  preferredDocumentId?: string;
};

export async function executeToolRound(
  toolCalls: ProviderToolCall[],
  ctx: ToolRoundContext,
): Promise<ToolRoundResult> {
  const webSearchCalls = toolCalls.filter((call) => call.name === WEB_SEARCH_TOOL_NAME);
  const codeExecutionCalls = toolCalls.filter((call) => call.name === CODE_EXEC_TOOL_NAME);
  const scratchpadCalls = toolCalls.filter((call) => call.name === SCRATCHPAD_TOOL_NAME);
  const askQuestionCalls = toolCalls.filter((call) => call.name === ASK_QUESTION_TOOL_NAME);
  const documentCalls = toolCalls.filter((call) =>
    [DOC_READ_TOOL_NAME, INLINE_EDIT_TOOL_NAME, DOC_CREATE_TOOL_NAME, DOC_UPDATE_TOOL_NAME].includes(call.name),
  );

  registerStreamingToolCalls(toolCalls, "running", (call) => {
    if (call.name === WEB_SEARCH_TOOL_NAME) return stringArg(call.arguments, "query");
    if (call.name === CODE_EXEC_TOOL_NAME) {
      return summarizeCodeSnippet(stripPythonCodeFence(stringArg(call.arguments, "code")));
    }
    if (call.name === INLINE_EDIT_TOOL_NAME) return stringArg(call.arguments, "documentId");
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

  let preferredDocumentId = ctx.preferredDocumentId;
  for (const call of documentCalls) {
    if (call.name === DOC_READ_TOOL_NAME) {
      toolResultSections.push(await executeDocReadCall(call, preferredDocumentId));
      continue;
    }
    if (call.name === INLINE_EDIT_TOOL_NAME) {
      toolResultSections.push(
        await executeInlineEditCall(call, ctx.docMutationConversationId, preferredDocumentId),
      );
      continue;
    }

    const mutationResult = await executeDocMutationCalls([call], {
      retryWithLLM: ctx.retryDocMutationWithLLM,
      conversationId: ctx.docMutationConversationId,
      preferredDocumentId,
    });
    toolResultSections.push(...mutationResult.sections);
    streamedChunks.push(...mutationResult.streamedChunks);
    preferredDocumentId = mutationResult.lastCreatedDocumentId ?? preferredDocumentId;
  }

  for (const call of codeExecutionCalls) {
    toolResultSections.push(await executeCodeExecutionCall(call, ctx.codeExecution));
  }

  for (const call of scratchpadCalls) {
    toolResultSections.push(
      executeScratchpadCall(call, ctx.conversationId ?? "", ctx.assistantMessageId ?? ""),
    );
  }

  for (const call of askQuestionCalls) {
    const result = await executeAskQuestionCall(call);
    toolResultSections.push(result);
  }

  return {
    toolResultSections,
    webSearchSources,
    webSearchContextBlocks,
    streamedChunks,
    lastCreatedDocumentId: preferredDocumentId,
  };
}
