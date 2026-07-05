import type { ChatMessage } from "@/modules/chat/chat-types";
import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import type { LmChatCompleteResult, StreamState } from "@/lib/lm-studio-types";
import { runLmStudioBackground, runLmStudioExclusive } from "@/lib/lm-studio-session";
import { withFetchTimeout } from "@/lib/abort-utils";
import { readV1SseStream } from "@/lib/lm-studio-sse";
import { buildMessagePerformance } from "@/lib/performance";
import {
  CHAT_PATH,
  buildV1ChatBody,
  processV1StreamEvent,
  extractToolCalls,
  extractMessageText,
  extractReasoningText,
} from "@/lib/lm-studio-v1";
import { sendOpenAiCompatibleChat } from "@/lib/lm-studio-openai";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@/lib/lm-studio-constants";
import { formatLmStudioCaughtError, formatLmStudioRequestError } from "@/lib/lm-studio-request";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type LmStudioChatOptions = {
  messages: ChatMessage[];
  model: string;
  baseUrl?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopSequences?: string[];
  store?: boolean;
  previousResponseId?: string;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  reasoningEnabled?: boolean;
  responseFormat?: { type: "json_object" | "text" };
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onModelLoadProgress?: (phase: string, percent?: number) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
  /** Use the email AI concurrency pool instead of the global exclusive lane. */
  background?: boolean;
};

export async function sendLmStudioChat(options: LmStudioChatOptions): Promise<void> {
  const run = () => sendLmStudioChatImpl(options);
  if (options.background) {
    return runLmStudioBackground(run);
  }
  return runLmStudioExclusive(run);
}

async function sendLmStudioChatImpl(options: LmStudioChatOptions): Promise<void> {
  const {
    messages,
    model,
    baseUrl,
    temperature,
    contextLength,
    maxTokens,
    topP,
    repetitionPenalty,
    stopSequences,
    store,
    previousResponseId,
    tools,
    toolChoice,
    reasoningEnabled,
    responseFormat,
    signal,
    onChunk,
    onReasoningChunk,
    onModelLoadProgress,
    onToolCallDetected,
    onComplete,
    onError,
  } = options;

  const startedAt = Date.now();
  const streamState: StreamState = {
    accumulatedContent: "",
    accumulatedReasoning: "",
  };

  if (tools && tools.length > 0) {
    await sendOpenAiCompatibleChat({
      messages,
      model,
      baseUrl,
      temperature,
      maxTokens,
      topP,
      stopSequences,
      tools,
      toolChoice,
      reasoningEnabled,
      responseFormat,
      signal,
      startedAt,
      onChunk,
      onReasoningChunk,
      onToolCallDetected,
      onComplete,
      onError,
    });
    return;
  }

  try {
    const { signal: fetchSignal, cleanup: cleanupFetchTimeout } = withFetchTimeout(signal);
    try {
      const res = await tauriFetch(`${baseUrl || DEFAULT_LM_STUDIO_BASE_URL}${CHAT_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildV1ChatBody({
            model,
            messages,
            temperature,
            contextLength,
            maxTokens,
            topP,
            repetitionPenalty,
            stopSequences,
            store,
            previousResponseId,
            tools,
            toolChoice,
            reasoningEnabled,
            responseFormat,
          }),
        ),
        signal: fetchSignal,
      });

    if (!res.ok) {
      onError(await formatLmStudioRequestError(res));
      return;
    }

    const handleEvent = (eventType: string, data: string) =>
      processV1StreamEvent(eventType, data, streamState, onChunk, onReasoningChunk, onModelLoadProgress);

    if (res.body) {
      await readV1SseStream(res.body, handleEvent, signal);
    } else {
      const json = (await res.json()) as {
        output?: Array<{ type: string; content: string; tool_calls?: unknown }>;
        stats?: import("@/lib/performance").LmChatStats;
        response_id?: string;
      };
      streamState.stats = json.stats;
      streamState.responseId = json.response_id;
      const toolCalls = extractToolCalls(json.output);
      if (toolCalls.length > 0) streamState.toolCalls = toolCalls;
      const reasoning = extractReasoningText(json.output);
      if (reasoning) {
        streamState.accumulatedReasoning = reasoning;
        onReasoningChunk?.(reasoning, false);
      }
      const text = extractMessageText(json.output);
      if (text) {
        streamState.firstTokenAt = Date.now();
        streamState.accumulatedContent = text;
        onChunk(text, false);
      }
      onReasoningChunk?.("", true);
      onChunk("", true);
    }

    onComplete?.({
      performance: buildMessagePerformance({
        content: streamState.accumulatedContent,
        startedAt,
        completedAt: Date.now(),
        firstTokenAt: streamState.firstTokenAt,
        stats: streamState.stats,
      }),
      responseId: streamState.responseId,
      toolCalls: streamState.toolCalls,
    });
    } finally {
      cleanupFetchTimeout();
    }
  } catch (err: unknown) {
    onError(formatLmStudioCaughtError(err, signal));
  }
}
