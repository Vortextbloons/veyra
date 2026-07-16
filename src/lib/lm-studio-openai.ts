import type { ChatMessage } from "@/modules/chat/chat-types";
import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import type {
  OpenAiStreamState,
} from "@/lib/lm-studio-types";
import type { LmChatStats } from "@/lib/performance";
import { buildMessagePerformance } from "@/lib/performance";
import { readV1SseStream } from "@/lib/lm-studio-sse";
import { withFetchTimeout } from "@/lib/abort-utils";
import { parseToolArguments, stableToolCallId, extractToolCalls } from "@/lib/lm-studio-v1";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@/lib/lm-studio-constants";
import { formatLmStudioCaughtError, formatLmStudioRequestError } from "@/lib/lm-studio-request";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  createReasoningProtocolState,
  processReasoningProtocolChunk,
} from "@/lib/reasoning-protocol";
const DEFAULT_TEMPERATURE = 0.7;
export const OPENAI_CHAT_PATH = "/v1/chat/completions";

function openAiChatUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return root.endsWith("/v1") ? `${root}/chat/completions` : `${root}${OPENAI_CHAT_PATH}`;
}

function buildOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  const imageAttachments = message.attachments?.filter((a) => a.fileType === "image") ?? [];
  const fileAttachments = message.attachments?.filter((a) => a.fileType !== "image" && a.textContent) ?? [];
  const hasImages = imageAttachments.length > 0;
  const hasFiles = fileAttachments.length > 0;

  if (hasImages || hasFiles) {
    const contentParts: Array<Record<string, unknown>> = [];

    const text = message.content.trim();
    if (text) {
      contentParts.push({ type: "text", text });
    }

    for (const att of fileAttachments) {
      contentParts.push({
        type: "text",
        text: `\n\n--- File: ${att.name} (${att.mimeType}) ---\n${att.textContent}\n--- End: ${att.name} ---`,
      });
    }

    for (const att of imageAttachments) {
      contentParts.push({
        type: "image_url",
        image_url: { url: att.dataUrl },
      });
    }

    return {
      role: message.role,
      content: contentParts.length > 0 ? contentParts : message.content,
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function buildOpenAiChatBody(options: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  stream?: boolean;
  reasoningEnabled?: boolean;
  responseFormat?: { type: "json_object" | "text" };
  omitUnsupportedFields?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages.map(buildOpenAiMessage),
    stream: options.stream ?? false,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
  };

  if (options.maxTokens != null && options.maxTokens > 0) body.max_tokens = options.maxTokens;
  if (options.topP != null && options.topP < 1) body.top_p = options.topP;
  if (options.stopSequences && options.stopSequences.length > 0) body.stop = options.stopSequences;
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }
  if (options.reasoningEnabled === false && !options.omitUnsupportedFields) {
    body.reasoning_effort = "none";
  }
  if (options.responseFormat?.type === "json_object") {
    body.response_format = { type: "json_object" };
  }

  return body;
}

export function finalizeOpenAiToolCalls(state: OpenAiStreamState): ProviderToolCall[] {
  if (state.toolCallAccumulators.size === 0) return [];
  return [...state.toolCallAccumulators.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, acc]) => ({
      id: acc.id ?? stableToolCallId(index),
      name: acc.name ?? "",
      arguments: parseToolArguments(acc.arguments),
    }))
    .filter((call) => call.name);
}

export function processOpenAiStreamData(
  data: string,
  state: OpenAiStreamState,
  onChunk: (content: string, done: boolean) => void,
  onReasoningChunk?: (content: string, done: boolean) => void,
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void,
): "continue" | "done" {
  if (data === "[DONE]") {
    const normalized = processReasoningProtocolChunk(
      state.reasoningProtocol ??= createReasoningProtocolState(),
      "",
      true,
    );
    if (normalized.reasoning) {
      state.accumulatedReasoning += normalized.reasoning;
      onReasoningChunk?.(normalized.reasoning, false);
    }
    if (normalized.content) {
      if (state.firstTokenAt == null) state.firstTokenAt = Date.now();
      state.accumulatedContent += normalized.content;
      onChunk(normalized.content, false);
    }
    if (!state.toolCalls?.length) {
      const toolCalls = finalizeOpenAiToolCalls(state);
      if (toolCalls.length > 0) state.toolCalls = toolCalls;
    }
    onReasoningChunk?.("", true);
    onChunk("", true);
    return "done";
  }

  try {
    const parsed = JSON.parse(data) as {
      id?: string;
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    if (parsed.id) state.responseId = parsed.id;

    const choice = parsed.choices?.[0];
    const delta = choice?.delta;

    if (delta?.reasoning_content) {
      state.accumulatedReasoning += delta.reasoning_content;
      onReasoningChunk?.(delta.reasoning_content, false);
    }

    if (delta?.content) {
      const normalized = processReasoningProtocolChunk(
        state.reasoningProtocol ??= createReasoningProtocolState(),
        delta.content,
      );
      if (normalized.reasoning) {
        state.accumulatedReasoning += normalized.reasoning;
        onReasoningChunk?.(normalized.reasoning, false);
      }
      if (normalized.content) {
        if (state.firstTokenAt == null) state.firstTokenAt = Date.now();
        state.accumulatedContent += normalized.content;
        onChunk(normalized.content, false);
      }
    }

    if (delta?.tool_calls) {
      for (const call of delta.tool_calls) {
        const index = call.index ?? 0;
        let acc = state.toolCallAccumulators.get(index);
        if (!acc) {
          acc = { arguments: "" };
          state.toolCallAccumulators.set(index, acc);
        }
        if (call.id) acc.id = call.id;
        if (call.function?.name) acc.name = call.function.name;
        if (call.function?.arguments) acc.arguments += call.function.arguments;

        if (call.function?.name && !state.notifiedToolIndices.has(index)) {
          state.notifiedToolIndices.add(index);
          onToolCallDetected?.({
            id: call.id ?? acc.id ?? `tool-${index}`,
            name: call.function.name,
          });
        }
      }
    }

    if (parsed.usage) {
      state.stats = {
        tokens_per_second: 0,
        time_to_first_token: 0,
        generation_time: 0,
        stop_reason: choice?.finish_reason ?? undefined,
        input_tokens: parsed.usage.prompt_tokens,
        total_output_tokens: parsed.usage.completion_tokens,
      } as LmChatStats;
    }

    if (choice?.finish_reason === "tool_calls") {
      const toolCalls = finalizeOpenAiToolCalls(state);
      if (toolCalls.length > 0) state.toolCalls = toolCalls;
    }
  } catch {
    // skip malformed chunk
  }

  return "continue";
}

export type OpenAiChatSendOptions = {
  messages: ChatMessage[];
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  reasoningEnabled?: boolean;
  responseFormat?: { type: "json_object" | "text" };
  headers?: Record<string, string>;
  omitUnsupportedFields?: boolean;
  signal?: AbortSignal;
  startedAt: number;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: import("@/lib/lm-studio-types").LmChatCompleteResult) => void;
  onError: (error: string) => void;
};

export async function sendOpenAiCompatibleChat(
  options: OpenAiChatSendOptions,
): Promise<void> {
  const streamState: OpenAiStreamState = {
    accumulatedContent: "",
    accumulatedReasoning: "",
    toolCallAccumulators: new Map(),
    notifiedToolIndices: new Set(),
  };

  try {
    const { signal: fetchSignal, cleanup: cleanupFetchTimeout } = withFetchTimeout(options.signal);
    try {
      const res = await tauriFetch(openAiChatUrl(options.baseUrl || DEFAULT_LM_STUDIO_BASE_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...options.headers },
        body: JSON.stringify(buildOpenAiChatBody({ ...options, stream: true })),
        signal: fetchSignal,
      });

      if (!res.ok) {
        options.onError(await formatLmStudioRequestError(res));
        return;
      }

      const handleEvent = (_eventType: string, data: string) =>
        processOpenAiStreamData(data, streamState, options.onChunk, options.onReasoningChunk, options.onToolCallDetected);

      if (res.body) {
        await readV1SseStream(res.body, handleEvent, options.signal);
      } else {
        const json = await res.json() as {
          id?: string;
          choices?: Array<{
            message?: {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: unknown;
            };
            finish_reason?: string;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const choice = json.choices?.[0];
        const message = choice?.message;
        streamState.responseId = json.id;
        const reasoning = message?.reasoning_content?.trim() ?? "";
        if (reasoning) {
          streamState.accumulatedReasoning = reasoning;
          options.onReasoningChunk?.(reasoning, false);
        }
        const content = message?.content ?? "";
        if (content) {
          const normalized = processReasoningProtocolChunk(
            streamState.reasoningProtocol ??= createReasoningProtocolState(),
            content,
            true,
          );
          if (normalized.reasoning) {
            streamState.accumulatedReasoning += normalized.reasoning;
            options.onReasoningChunk?.(normalized.reasoning, false);
          }
          if (normalized.content) {
            streamState.firstTokenAt = Date.now();
            streamState.accumulatedContent = normalized.content;
            options.onChunk(normalized.content, false);
          }
        }
        if (json.usage) {
          streamState.stats = {
            tokens_per_second: 0,
            time_to_first_token: 0,
            generation_time: 0,
            stop_reason: choice?.finish_reason,
            input_tokens: json.usage.prompt_tokens,
            total_output_tokens: json.usage.completion_tokens,
          } as LmChatStats;
        }
        streamState.toolCalls = extractToolCalls([
          { type: "message", content, tool_calls: message?.tool_calls },
        ]);
        options.onReasoningChunk?.("", true);
        options.onChunk("", true);
      }

      if (!streamState.toolCalls?.length) {
        const toolCalls = finalizeOpenAiToolCalls(streamState);
        if (toolCalls.length > 0) streamState.toolCalls = toolCalls;
      }

      options.onComplete?.({
        performance: buildMessagePerformance({
          content: streamState.accumulatedContent,
          startedAt: options.startedAt,
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
    options.onError(formatLmStudioCaughtError(err, options.signal));
  }
}
