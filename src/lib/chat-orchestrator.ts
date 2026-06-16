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
import { resolveCharacterBlock } from "@/lib/resolve-character-block";
import { runSearch, buildSearchContextBlock } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import {
  CODE_EXEC_TOOL_NAME,
  DOC_CREATE_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  buildProviderTools,
} from "@/lib/tool-registry";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { buildContextAnchoringBlock, buildDocumentInstructionsBlock, buildProjectContextBlock } from "@/lib/prompts";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useProviderStore } from "@/stores/provider-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { executeDocCreation, executeDocRead, executeDocUpdate } from "@/modules/documents/document-runtime";
import type { DocCreateIntent, DocReadIntent, DocUpdateIntent, DocumentType } from "@/modules/documents/document-types";
import type { ProviderToolCall } from "@/lib/providers/types";
import { buildMessagePerformance } from "@/lib/performance";
import type { WebSearchRound } from "@/lib/chat-types";
import { invokeExecutePythonCode } from "@/lib/code-execution";

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

type SendChatRequest = Omit<ProviderChatOptions, "messages" | "onComplete"> & {
  providerId: string;
  messages: ChatMessage[];
  /** When false, no memory retrieval, no pack injection, no extraction. */
  memoryEnabled: boolean;
  /** When false, web search tools are not offered and searches are not run. */
  webSearchEnabled: boolean;
  /** When false, the Python execution tool is not offered. */
  codeExecutionEnabled: boolean;
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

function stripPythonCodeFence(code: string): string {
  const trimmed = code.trim();
  const fenced = trimmed.match(/^```(?:python3?|py)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) return fenced[1].trim();

  const inlineFenced = trimmed.match(/^```(?:python3?|py)?\s*([\s\S]*?)```$/i);
  if (inlineFenced) return inlineFenced[1].trim();

  return trimmed;
}

function summarizeCodeSnippet(code: string, maxLength = 120): string {
  const oneLine = code.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 1)}…`;
}

function summarizePythonExecutionResult(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}): string {
  if (result.timedOut) {
    return `Timed out after ${Math.round(result.durationMs / 1000)}s`;
  }
  if (result.exitCode !== 0) {
    return `Exited with code ${result.exitCode ?? "unknown"}`;
  }

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout && stderr) return "Exited 0 · stdout and stderr captured";
  if (stderr) return "Exited 0 · stderr captured";
  if (stdout) return stdout.length > 120 ? "Exited 0 · output captured" : `Exited 0 · ${stdout}`;
  return "Exited 0 · no output";
}

function formatPythonExecutionSection(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
}): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  return [
    `Python: ${result.pythonPath}`,
    `Working directory: ${result.workingDirectory}`,
    `Duration: ${result.durationMs} ms`,
    `Exit code: ${result.exitCode ?? "unknown"}${result.timedOut ? " (timed out)" : ""}`,
    stdout ? `Stdout:\n${stdout}` : "Stdout: (empty)",
    stderr ? `Stderr:\n${stderr}` : "Stderr: (empty)",
  ].join("\n\n");
}

const TOOL_RETRY_LIMIT = 2;
const MAX_TOOL_ROUNDS = 6;

type ToolRoundResult = {
  toolResultSections: string[];
  webSearchSources: WebSearchSource[];
  webSearchContextBlocks: string[];
  streamedChunks: string[];
};

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

/**
 * Resolves the character context block for a conversation, if any.
 * @see resolveCharacterBlock in resolve-character-block.ts
 */
export { resolveCharacterBlock } from "@/lib/resolve-character-block";

export async function sendChatRequest({
  providerId,
  messages,
  memoryEnabled,
  webSearchEnabled,
  codeExecutionEnabled,
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

  const patchWebSearchRound = (round: WebSearchRound) => {
    useChatStore.getState().upsertStreamingWebSearchRound(round);
  };

  const handleToolCallDetected = (call: Pick<ProviderToolCall, "id" | "name">) => {
    registerStreamingToolCall(call, "pending");
  };

  const finalizeToUser = (
    result: LmChatCompleteResult,
    webSearchSources: WebSearchSource[],
  ) => {
    const chatStore = useChatStore.getState();
    if (webSearchSources.length > 0) {
      chatStore.completeStreamingWebSearchRounds();
    }
    chatStore.clearStreamingBufferUnlessSkipped();
    userOnComplete?.(result, {
      memoryPack,
      memoryRetrieval,
      webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
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

  const executeWebSearchCall = async (
    call: ProviderToolCall,
    attempt: number,
  ): Promise<{
    section: string;
    sources: WebSearchSource[];
    contextBlock: string;
    query: string;
  }> => {
    const chatStore = useChatStore.getState();
    const query = stringArg(call.arguments, "query");
    if (!query) {
      throw new Error("Web search failed: invalid tool arguments.");
    }
    if (!effectiveWebSearchEnabled) {
      throw new Error(
        webSearchAvailability.reason ?? "Web search is unavailable in Offline mode.",
      );
    }

    patchWebSearchRound({
      id: call.id,
      query,
      phase: "searching",
      sources: [],
    });
    chatStore.setStreamingToolState({
      id: call.id,
      name: WEB_SEARCH_TOOL_NAME,
      label: "Web Search",
      phase: attempt > 0 ? "retrying" : "running",
      input: query,
      attempts: attempt > 0 ? attempt : undefined,
    });

    let searchBundle: Awaited<ReturnType<typeof runSearch>> | null = null;
    let lastSearchError: unknown = null;
    for (let retry = 0; retry <= TOOL_RETRY_LIMIT; retry += 1) {
      try {
        if (retry > 0) {
          chatStore.setStreamingToolState({
            id: call.id,
            name: WEB_SEARCH_TOOL_NAME,
            label: "Web Search",
            phase: "retrying",
            input: query,
            attempts: retry,
          });
        }
        patchWebSearchRound({
          id: call.id,
          query,
          phase: "searching",
          sources: [],
        });
        searchBundle = await runSearch(query, {
          signal: options.signal,
          projectId,
          onFetchProgress: (completed, total) => {
            patchWebSearchRound({
              id: call.id,
              query,
              phase: "fetching",
              sources: [],
              fetch_progress: { completed, total },
            });
          },
        });
        lastSearchError = null;
        break;
      } catch (error) {
        lastSearchError = error;
        if (retry >= TOOL_RETRY_LIMIT) throw error;
      }
    }
    if (!searchBundle) throw lastSearchError ?? new Error("Search failed");

    const contextBlock = buildSearchContextBlock(searchBundle);
    const sources: WebSearchSource[] = searchBundle.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      snippet: s.snippet ?? "",
      ...(s.fetch ? { fetch: s.fetch } : {}),
    }));

    patchWebSearchRound({
      id: call.id,
      query,
      phase: "reading",
      sources,
    });
    const fetchedCount = searchBundle.fetchedPages?.length ?? 0;
    const detail =
      fetchedCount > 0
        ? `${sources.length} source${sources.length !== 1 ? "s" : ""} · ${fetchedCount} page${fetchedCount !== 1 ? "s" : ""} read`
        : `${sources.length} source${sources.length !== 1 ? "s" : ""} found`;
    chatStore.setStreamingToolState({
      id: call.id,
      name: WEB_SEARCH_TOOL_NAME,
      label: "Web Search",
      phase: "done",
      input: query,
      detail,
    });

    return {
      section: `Tool result for ${WEB_SEARCH_TOOL_NAME}(${JSON.stringify({ query })}):\n\n${contextBlock}`,
      sources,
      contextBlock,
      query,
    };
  };

  const executeDocReadCall = async (call: ProviderToolCall): Promise<string> => {
    const chatStore = useChatStore.getState();
    const label = "Read Document";
    const documentId = stringArg(call.arguments, "documentId");
    registerStreamingToolCall(call, "running", documentId);

    const intent = docReadIntentFromToolCall(call);
    if (!intent) {
      const error = "Invalid doc_read tool arguments.";
      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: "error",
        error,
      });
      return `Tool result for ${DOC_READ_TOOL_NAME}: ${error}`;
    }

    const docResult = await executeDocRead(intent);
    if (!docResult.applied || !docResult.documentContent) {
      const error = docResult.error ?? docResult.sanitizedText;
      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: "error",
        input: documentId,
        error,
      });
      return `Tool result for ${DOC_READ_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}): ${error}`;
    }

    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "done",
      input: intent.documentId,
      detail: docResult.sanitizedText,
    });
    return `Tool result for ${DOC_READ_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${docResult.documentContent}`;
  };

  const executeCodeExecutionCall = async (call: ProviderToolCall): Promise<string> => {
    const chatStore = useChatStore.getState();
    const label = getToolCallUi(CODE_EXEC_TOOL_NAME).label;
    const rawCode = stringArg(call.arguments, "code");
    const code = stripPythonCodeFence(rawCode);
    const inputPreview = summarizeCodeSnippet(code);

    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "running",
      input: inputPreview,
    });

    if (!code) {
      const error = "Invalid code_execution tool arguments.";
      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: "error",
        input: inputPreview,
        error,
      });
      return `Tool result for ${CODE_EXEC_TOOL_NAME}: ${error}`;
    }

    try {
      const result = await invokeExecutePythonCode({
        code,
        timeoutSecs: settings.codeExecutionTimeoutSecs,
        pythonPath: settings.customPythonPath.trim() || null,
      });
      const summary = summarizePythonExecutionResult(result);
      const detail = [`Code:\n${code}`, formatPythonExecutionSection(result)].join("\n\n");
      const phase = result.exitCode === 0 && !result.timedOut ? "done" : "error";

      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase,
        input: inputPreview,
        detail,
        result: { code, ...result },
        ...(phase === "error" ? { error: summary } : {}),
      });

      return `Tool result for ${CODE_EXEC_TOOL_NAME}(python code):\n\n${formatPythonExecutionSection(result)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: "error",
        input: inputPreview,
        error: message,
      });
      return `Tool result for ${CODE_EXEC_TOOL_NAME}: ${message}`;
    }
  };

  const executeDocMutationCalls = async (
    mutationCalls: ProviderToolCall[],
  ): Promise<{ sections: string[]; streamedChunks: string[] }> => {
    const chatStore = useChatStore.getState();
    const sections: string[] = [];
    const streamedChunks: string[] = [];
    let callsToProcess = mutationCalls.filter(
      (call) => call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
    );

    registerStreamingToolCalls(callsToProcess, "running", (call) =>
      stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId"),
    );

    for (let attempt = 0; attempt <= TOOL_RETRY_LIMIT; attempt += 1) {
      const failed: string[] = [];
      sections.length = 0;
      streamedChunks.length = 0;

      for (const call of callsToProcess) {
        const label =
          call.name === DOC_CREATE_TOOL_NAME ? "Create Document" : "Update Document";
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
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label,
              phase: "error",
              error,
            });
            sections.push(`Tool result for ${DOC_CREATE_TOOL_NAME}: ${error}`);
            continue;
          }
          const docResult = await executeDocCreation(intent, conversationId);
          if (!docResult.applied) {
            const error = docResult.error ?? docResult.sanitizedText;
            failed.push(error);
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label,
              phase: "error",
              error,
            });
            sections.push(`Tool result for ${DOC_CREATE_TOOL_NAME}: ${error}`);
            continue;
          }
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "done",
            detail: docResult.sanitizedText,
            input: intent.title,
          });
          sections.push(
            `Tool result for ${DOC_CREATE_TOOL_NAME}(${JSON.stringify({ title: intent.title })}):\n\n${docResult.sanitizedText}`,
          );
          streamedChunks.push(docResult.sanitizedText);
        } else {
          const intent = docUpdateIntentFromToolCall(call);
          if (!intent) {
            const error = "Invalid doc_update tool arguments.";
            failed.push(error);
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label,
              phase: "error",
              error,
            });
            sections.push(`Tool result for ${DOC_UPDATE_TOOL_NAME}: ${error}`);
            continue;
          }
          const docResult = await executeDocUpdate(intent, conversationId);
          if (!docResult.applied) {
            const error = docResult.error ?? docResult.sanitizedText;
            failed.push(error);
            chatStore.setStreamingToolState({
              id: call.id,
              name: call.name,
              label,
              phase: "error",
              error,
            });
            sections.push(`Tool result for ${DOC_UPDATE_TOOL_NAME}: ${error}`);
            continue;
          }
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "done",
            detail: docResult.sanitizedText,
            input: intent.documentId,
          });
          sections.push(
            `Tool result for ${DOC_UPDATE_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${docResult.sanitizedText}`,
          );
          streamedChunks.push(docResult.sanitizedText);
        }
      }

      if (failed.length === 0 || attempt >= TOOL_RETRY_LIMIT) break;

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
              content: accumulatedContent,
              timestamp: Date.now(),
              modelId: options.model,
            },
            {
              id: crypto.randomUUID(),
              role: "user",
              content: `Your previous document tool call failed. Failure reason: ${failed.join("; ")}. Retry by calling exactly one corrected document tool. Do not answer in prose.`,
              timestamp: Date.now(),
            },
          ],
          [],
        ),
      });
      const nextCalls = retryToolCalls.filter(
        (call) =>
          call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
      );
      if (nextCalls.length === 0) break;
      callsToProcess = nextCalls;
    }

    return { sections, streamedChunks };
  };

  const executeToolRound = async (toolCalls: ProviderToolCall[]): Promise<ToolRoundResult> => {
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
          return await executeWebSearchCall(call, 0);
        } catch (error) {
          const chatStore = useChatStore.getState();
          const query = stringArg(call.arguments, "query");
          const message = error instanceof Error ? error.message : String(error);
          patchWebSearchRound({
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
      toolResultSections.push(await executeCodeExecutionCall(call));
    }

    if (docMutationCalls.length > 0) {
      const mutationResult = await executeDocMutationCalls(docMutationCalls);
      toolResultSections.push(...mutationResult.sections);
      streamedChunks.push(...mutationResult.streamedChunks);
    }

    return {
      toolResultSections,
      webSearchSources,
      webSearchContextBlocks,
      streamedChunks,
    };
  };

  const rePromptWithTools = async (
    chainMessages: ChatMessage[],
    round: number,
    accumulatedSearchSources: WebSearchSource[],
    accumulatedContextBlocks: string[],
  ): Promise<void> => {
    if (options.signal?.aborted) return;
    if (round >= MAX_TOOL_ROUNDS) {
      options.onError(`Stopped after ${MAX_TOOL_ROUNDS} tool rounds.`);
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

              const exec = await executeToolRound(toolCalls);
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

        const exec = await executeToolRound(toolCalls);
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
