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
import { runSearch, buildSearchContextBlock } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import {
  DOC_CREATE_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  buildProviderTools,
} from "@/lib/tool-registry";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { buildContextAnchoringBlock, buildDocumentInstructionsBlock } from "@/lib/prompts";
import { useDocumentStore } from "@/modules/documents/document-store";
import { executeDocCreation, executeDocRead, executeDocUpdate } from "@/modules/documents/document-runtime";
import type { DocCreateIntent, DocReadIntent, DocUpdateIntent, DocumentType } from "@/modules/documents/document-types";
import type { ProviderToolCall } from "@/lib/providers/types";

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

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function docCreateIntentFromToolCall(call: ProviderToolCall): DocCreateIntent | null {
  const title = stringArg(call.arguments, "title");
  const documentType = stringArg(call.arguments, "documentType") as DocumentType;
  const contentMarkdown = stringArg(call.arguments, "contentMarkdown");
  if (!title || !documentType || !contentMarkdown) return null;
  return { type: "doc.create", title, documentType, contentMarkdown };
}

function docUpdateIntentFromToolCall(call: ProviderToolCall): DocUpdateIntent | null {
  const documentId = stringArg(call.arguments, "documentId");
  const mode = stringArg(call.arguments, "mode") as DocUpdateIntent["mode"];
  const contentMarkdown = stringArg(call.arguments, "contentMarkdown");
  const target = stringArg(call.arguments, "target");
  if (!documentId || !mode || !contentMarkdown) return null;
  return { type: "doc.update", documentId, mode, contentMarkdown, target: target || undefined };
}

function docReadIntentFromToolCall(call: ProviderToolCall): DocReadIntent | null {
  const documentId = stringArg(call.arguments, "documentId");
  if (!documentId) return null;
  return { type: "doc.read", documentId };
}

const TOOL_RETRY_LIMIT = 2;

function registerStreamingToolCall(
  call: Pick<ProviderToolCall, "id" | "name">,
  phase: "pending" | "running",
  input?: string,
) {
  const meta = getToolCallUi(call.name);
  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: call.name,
    label: meta.label,
    phase,
    input,
  });
}

function registerStreamingToolCalls(
  calls: ProviderToolCall[],
  phase: "pending" | "running",
  inputForCall?: (call: ProviderToolCall) => string | undefined,
) {
  for (const call of calls) {
    registerStreamingToolCall(call, phase, inputForCall?.(call));
  }
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
  const providerTools = buildProviderTools({
    webSearchEnabled,
    documentToolsEnabled: settings.documentPanelEnabled,
    activeDocumentId: activeDocument?.id,
  });

  let accumulatedContent = "";
  const wrappedOnChunk = (content: string, done: boolean) => {
    accumulatedContent += content;
    options.onChunk(content, done);
  };

  let isRePrompt = false;
  let toolCompletion: Promise<void> = Promise.resolve();

  const handleToolCallDetected = (call: Pick<ProviderToolCall, "id" | "name">) => {
    registerStreamingToolCall(call, "pending");
  };

  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    const toolCalls = result.toolCalls ?? [];
    const webSearchCall = toolCalls.find((call) => call.name === WEB_SEARCH_TOOL_NAME);
    const documentCalls = toolCalls.filter(
      (call) => call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME || call.name === DOC_READ_TOOL_NAME,
    );

    const documentReadCalls = documentCalls.filter((call) => call.name === DOC_READ_TOOL_NAME);

    if (documentReadCalls.length > 0 && !isRePrompt) {
      isRePrompt = true;
      const documentReadCall = documentReadCalls[0];
      const chatStore = useChatStore.getState();
      const documentId = stringArg(documentReadCall.arguments, "documentId");

      chatStore.skipNextBufferClear();
      registerStreamingToolCall(documentReadCall, "running", documentId);

      toolCompletion = (async () => {
        try {
          if (options.signal?.aborted) return;

          const label = "Read Document";
          const intent = docReadIntentFromToolCall(documentReadCall);
          if (!intent) {
            const error = "Invalid doc_read tool arguments.";
            chatStore.setStreamingToolState({ id: documentReadCall.id, name: documentReadCall.name, label, phase: "error", error });
            options.onError(error);
            return;
          }

          const docResult = await executeDocRead(intent);
          if (!docResult.applied || !docResult.documentContent) {
            const error = docResult.error ?? docResult.sanitizedText;
            chatStore.setStreamingToolState({ id: documentReadCall.id, name: documentReadCall.name, label, phase: "error", error });
            options.onError(error);
            return;
          }

          chatStore.setStreamingToolState({
            id: documentReadCall.id,
            name: documentReadCall.name,
            label,
            phase: "done",
            input: intent.documentId,
            detail: docResult.sanitizedText,
          });

          const rePromptMessages: ChatMessage[] = [
            ...messages,
            { id: crypto.randomUUID(), role: "assistant", content: accumulatedContent, timestamp: Date.now() },
            {
              id: crypto.randomUUID(),
              role: "user",
              content: `Tool result for ${DOC_READ_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${docResult.documentContent}\n\nAnswer using this document content.`,
              timestamp: Date.now(),
            },
          ];

          if (options.signal?.aborted) return;

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
            tools: [],
            toolChoice: "none",
            onComplete: (rePromptResult) => {
              chatStore.clearStreamingBufferUnlessSkipped();
              userOnComplete?.(rePromptResult, { memoryPack, memoryRetrieval });
              useChatStore.getState().resetAfterRePrompt();
            },
            messages: buildChatContext(
              rePromptMessages,
              {
                memoryPack: memoryPack ?? null,
                conversationSummary: conversation?.conversationSummary,
                summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
                documentInstructionsBlock,
                userPrompt: resolvedUserPrompt,
                reservedOutputTokens: resolvedReservedOutputTokens,
              },
              resolvedContextLength,
            ),
          });
        } catch (error) {
          if (options.signal?.aborted) return;
          const message = error instanceof Error ? error.message : String(error);
          chatStore.setStreamingToolState({ id: documentReadCall.id, name: documentReadCall.name, label: "Read Document", phase: "error", input: documentId, error: message });
          chatStore.clearStreamingBufferUnlessSkipped();
          userOnComplete?.(result, { memoryPack, memoryRetrieval });
          useChatStore.getState().resetAfterRePrompt();
        }
      })();
      return;
    }

    if (documentCalls.length > 0 && !isRePrompt) {
      registerStreamingToolCalls(documentCalls, "running", (call) =>
        stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId"),
      );

      toolCompletion = (async () => {
        const chatStore = useChatStore.getState();
        const results: string[] = [];
        let callsToProcess = documentCalls;

        for (let attempt = 0; attempt <= TOOL_RETRY_LIMIT; attempt += 1) {
          const failed: string[] = [];
          results.length = 0;

          for (const call of callsToProcess) {
            const label = call.name === DOC_CREATE_TOOL_NAME ? "Create Document" : "Update Document";
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label,
              phase: attempt > 0 ? "retrying" : "running",
              attempts: attempt > 0 ? attempt : undefined,
              input: stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId"),
            });

            if (call.name === DOC_CREATE_TOOL_NAME) {
              const intent = docCreateIntentFromToolCall(call);
              if (!intent) {
                const error = "Invalid doc_create tool arguments.";
                failed.push(error);
                chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "error", error });
                continue;
              }
              const docResult = await executeDocCreation(intent, conversationId);
              if (!docResult.applied) {
                failed.push(docResult.error ?? docResult.sanitizedText);
                chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "error", error: docResult.error ?? docResult.sanitizedText });
                continue;
              }
              chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "done", detail: docResult.sanitizedText, input: intent.title });
              results.push(docResult.sanitizedText);
            } else {
              const intent = docUpdateIntentFromToolCall(call);
              if (!intent) {
                const error = "Invalid doc_update tool arguments.";
                failed.push(error);
                chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "error", error });
                continue;
              }
              const docResult = await executeDocUpdate(intent, conversationId);
              if (!docResult.applied) {
                failed.push(docResult.error ?? docResult.sanitizedText);
                chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "error", error: docResult.error ?? docResult.sanitizedText });
                continue;
              }
              chatStore.setStreamingToolState({ id: call.id, name: call.name, label, phase: "done", detail: docResult.sanitizedText, input: intent.documentId });
              results.push(docResult.sanitizedText);
            }
          }

          if (failed.length === 0 || attempt >= TOOL_RETRY_LIMIT) break;

          let retryToolCalls: ProviderToolCall[] = [];
          await provider.sendChat({
            ...options,
            previousResponseId: undefined,
            tools: providerTools,
            toolChoice: "auto",
            onChunk: () => {},
            onReasoningChunk: () => {},
            onComplete: (nextResult) => {
              retryToolCalls = nextResult.toolCalls ?? [];
            },
            messages: buildChatContext(
              [
                ...messages,
                { id: crypto.randomUUID(), role: "assistant", content: accumulatedContent, timestamp: Date.now() },
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  content: `Your previous document tool call failed. Failure reason: ${failed.join("; ")}. Retry by calling exactly one corrected document tool. Do not answer in prose.`,
                  timestamp: Date.now(),
                },
              ],
              { documentInstructionsBlock, userPrompt: resolvedUserPrompt, reservedOutputTokens: resolvedReservedOutputTokens },
              resolvedContextLength,
            ),
          });
          const nextCalls = retryToolCalls.filter(
            (call) => call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
          );
          if (nextCalls.length === 0) break;
          callsToProcess = nextCalls;
        }

        if (results.length === 0) {
          const failureText = "Document tool failed after retrying.";
          results.push(failureText);
          for (const call of callsToProcess) {
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label: call.name === DOC_CREATE_TOOL_NAME ? "Create Document" : "Update Document",
              phase: "error",
              error: failureText,
            });
          }
        }

        const documentText = results.filter(Boolean).join("\n\n");
        if (documentText) {
          accumulatedContent = accumulatedContent
            ? `${accumulatedContent}\n\n${documentText}`
            : documentText;
          options.onChunk(documentText, false);
        }
        userOnComplete?.(result, { memoryPack, memoryRetrieval });
      })().catch((error) => {
        options.onError(error instanceof Error ? error.message : String(error));
      });
      return;
    }

    if (webSearchEnabled && webSearchCall && !isRePrompt) {
      isRePrompt = true;
      const chatStore = useChatStore.getState();

      // Prevent the App.tsx finally block from clearing the buffer
      chatStore.skipNextBufferClear();
      const query = stringArg(webSearchCall.arguments, "query");
      if (!query) {
        options.onError("Web search failed: invalid tool arguments.");
        return;
      }

      // Show web search UI in the existing buffer (preserves reasoning and prior content)
      chatStore.setStreamingWebSearchState({
        query,
        phase: "searching",
        sources: [],
      });
      registerStreamingToolCall(webSearchCall, "running", query);

      toolCompletion = (async () => {
          try {
            if (options.signal?.aborted) return;

            let searchBundle: Awaited<ReturnType<typeof runSearch>> | null = null;
            let lastSearchError: unknown = null;
            for (let attempt = 0; attempt <= TOOL_RETRY_LIMIT; attempt += 1) {
              try {
                chatStore.setStreamingToolState({
                  id: webSearchCall.id,
                  name: WEB_SEARCH_TOOL_NAME,
                  label: "Web Search",
                  phase: attempt > 0 ? "retrying" : "running",
                  input: query,
                  attempts: attempt > 0 ? attempt : undefined,
                });
                searchBundle = await runSearch(query, options.signal);
                lastSearchError = null;
                break;
              } catch (error) {
                lastSearchError = error;
                if (attempt >= TOOL_RETRY_LIMIT) throw error;
              }
            }
            if (!searchBundle) throw lastSearchError ?? new Error("Search failed");
            if (options.signal?.aborted) return;

            const contextBlock = buildSearchContextBlock(searchBundle);

            const searchSources: WebSearchSource[] = searchBundle.sources.map((s) => ({
              ...s,
              snippet: s.snippet ?? "",
            }));

            // Update to reading phase with sources
            chatStore.setStreamingWebSearchState({
              query,
              phase: "reading",
              sources: searchSources,
            });
            chatStore.setStreamingToolState({
              id: webSearchCall.id,
              name: WEB_SEARCH_TOOL_NAME,
              label: "Web Search",
              phase: "done",
              input: query,
              detail: `${searchSources.length} source${searchSources.length !== 1 ? "s" : ""} found`,
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
                content: `Tool result for ${WEB_SEARCH_TOOL_NAME}(${JSON.stringify({ query })}):\n\n${contextBlock}\n\nAnswer using this information. Sources are displayed separately; do not list or cite URLs.`,
                timestamp: Date.now(),
              },
            ];

            const resolvedContextLength = options.contextLength ?? settings.getModelSettings(options.model).contextLength;
            const conversation = conversationId
              ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
              : undefined;

            // Re-prompt — chunks stream into the same buffer
            if (options.signal?.aborted) return;

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
              tools: [],
              toolChoice: "none",
              onComplete: (rePromptResult) => {
                // Mark search as done
                const chatStore = useChatStore.getState();
                chatStore.setStreamingWebSearchState({
                  query,
                  phase: "done",
                  sources: searchSources,
                });
                // Allow App.tsx's completion handler to commit the streamed buffer.
                chatStore.clearStreamingBufferUnlessSkipped();
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
                  documentInstructionsBlock,
                  userPrompt: resolvedUserPrompt,
                  reservedOutputTokens: resolvedReservedOutputTokens,
                },
                resolvedContextLength,
              ),
            });
          } catch (searchError) {
            if (options.signal?.aborted) return;
            console.error("[WebSearch] Search failed:", searchError);
            useChatStore.getState().setStreamingWebSearchState({
              query,
              phase: "error",
              sources: [],
              error: searchError instanceof Error ? searchError.message : String(searchError),
            });
            useChatStore.getState().setStreamingToolState({
              id: webSearchCall.id,
              name: WEB_SEARCH_TOOL_NAME,
              label: "Web Search",
              phase: "error",
              input: query,
              error: searchError instanceof Error ? searchError.message : String(searchError),
            });
            useChatStore.getState().clearStreamingBufferUnlessSkipped();
            userOnComplete?.(result, { memoryPack, memoryRetrieval });
            // Clean up streaming state after error
            useChatStore.getState().resetAfterRePrompt();
          }
      })();
      return;
    }

    userOnComplete?.(result, { memoryPack, memoryRetrieval });
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
        userPrompt: resolvedUserPrompt,
        reservedOutputTokens: resolvedReservedOutputTokens,
      },
      resolvedContextLength,
    ),
  });
  await toolCompletion;

}
