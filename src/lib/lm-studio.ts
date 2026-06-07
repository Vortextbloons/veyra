import type {
  ChatMessage,
  MessagePerformance,
  ModelInfo,
} from "@/lib/chat-types";
import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import { buildLmStudioInput, inferSupportsImages } from "@/lib/message-attachments";
import {
  buildMessagePerformance,
  type LmChatStats,
} from "@/lib/performance";
import { runLmStudioExclusive } from "@/lib/lm-studio-session";
import { withFetchTimeout } from "@/lib/abort-utils";
import { formatTranscript } from "@/lib/transcript";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

// Keep in sync with LM_STUDIO_DEFAULT_BASE_URL in src-tauri/src/constants.rs
const DEFAULT_BASE_URL = "http://localhost:1234";
const DEFAULT_TEMPERATURE = 0.7;

/** LM Studio 0.4+ native chat — accurate `stats` on `chat.end` when streaming. */
const CHAT_PATH = "/api/v1/chat";
const OPENAI_CHAT_PATH = "/v1/chat/completions";

export interface LmChatCompleteResult {
  performance: MessagePerformance;
  responseId?: string;
  toolCalls?: ProviderToolCall[];
}

type V1OutputItem =
  | { type: "message"; content: string; tool_calls?: unknown }
  | { type: "reasoning"; content: string }
  | {
      type: "tool_call" | "function_call";
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: unknown;
      args?: unknown;
      function?: { name?: string; arguments?: unknown };
    }
  | { type: string; content?: string };

type StreamState = {
  firstTokenAt?: number;
  accumulatedContent: string;
  accumulatedReasoning: string;
  stats?: LmChatStats;
  responseId?: string;
  toolCalls?: ProviderToolCall[];
};


function extractMessageText(output: V1OutputItem[] | undefined): string {
  if (!output?.length) return "";
  return output
    .filter((item): item is { type: "message"; content: string } => item.type === "message")
    .map((item) => item.content)
    .join("");
}

function extractReasoningText(output: V1OutputItem[] | undefined): string {
  if (!output?.length) return "";
  return output
    .filter((item): item is { type: "reasoning"; content: string } => item.type === "reasoning")
    .map((item) => item.content)
    .join("");
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractToolCalls(output: V1OutputItem[] | undefined): ProviderToolCall[] {
  if (!output?.length) return [];
  const calls: ProviderToolCall[] = [];

  const pushCall = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const fn = record.function && typeof record.function === "object"
      ? record.function as Record<string, unknown>
      : undefined;
    const name = typeof record.name === "string"
      ? record.name.trim()
      : typeof fn?.name === "string"
        ? fn.name.trim()
        : "";
    if (!name) return;
    calls.push({
      id: typeof record.id === "string" ? record.id : typeof record.call_id === "string" ? record.call_id : crypto.randomUUID(),
      name,
      arguments: parseToolArguments(record.arguments ?? record.args ?? fn?.arguments),
    });
  };

  for (const item of output) {
    if ("tool_calls" in item && Array.isArray(item.tool_calls)) {
      for (const call of item.tool_calls) pushCall(call);
    }

    if (item.type !== "tool_call" && item.type !== "function_call") continue;
    pushCall(item);
  }

  return calls;
}

function buildOpenAiMessage(message: ChatMessage): Record<string, unknown> {
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

  return body;
}

function buildV1ChatBody(options: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  contextLength?: number;
  previousResponseId?: string;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopSequences?: string[];
  store?: boolean;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
}): Record<string, unknown> {
  const {
    model,
    messages,
    temperature,
    previousResponseId,
    maxTokens,
    topP,
    repetitionPenalty,
    stopSequences,
    store = true,
    tools,
    toolChoice,
  } = options;
  const systemPrompt = messages
    .filter((m) => m.role === "system" && m.content.trim())
    .map((m) => m.content.trim())
    .join("\n\n");
  const dialogue = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    stream: true,
    store,
    temperature: temperature ?? DEFAULT_TEMPERATURE,
  };

  if (maxTokens != null && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  if (topP != null && topP < 1) {
    body.top_p = topP;
  }

  if (repetitionPenalty != null && repetitionPenalty !== 1) {
    body.repeat_penalty = repetitionPenalty;
  }

  if (stopSequences && stopSequences.length > 0) {
    body.stop = stopSequences;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice ?? "auto";
  }

  if (systemPrompt) {
    body.system_prompt = systemPrompt;
  }

  if (previousResponseId?.startsWith("resp_")) {
    body.previous_response_id = previousResponseId;
    const lastUser = [...dialogue].reverse().find((m) => m.role === "user");
    body.input = lastUser
      ? buildLmStudioInput(lastUser.content, lastUser.attachments)
      : "";
  } else {
    const lastUser = dialogue[dialogue.length - 1];
    const onlyUserTurn =
      dialogue.length === 1 && lastUser?.role === "user" && lastUser.attachments?.length;
    if (onlyUserTurn) {
      body.input = buildLmStudioInput(lastUser.content, lastUser.attachments);
    } else {
      body.input = formatTranscript(dialogue);
    }
  }

  if (typeof body.input === "string" && !body.input.trim()) {
    const lastUser = [...dialogue].reverse().find((m) => m.role === "user" && m.content.trim());
    if (lastUser) {
      body.input = buildLmStudioInput(lastUser.content.trim(), lastUser.attachments);
    }
  }

  return body;
}

function processV1StreamEvent(
  eventType: string,
  data: string,
  state: StreamState,
  onChunk: (content: string, done: boolean) => void,
  onReasoningChunk?: (content: string, done: boolean) => void,
  onModelLoadProgress?: (phase: string, percent?: number) => void,
): "continue" | "done" {
  if (!data) return "continue";

  try {
    const parsed = JSON.parse(data) as {
      type?: string;
      content?: string;
      result?: {
        output?: V1OutputItem[];
        stats?: LmChatStats;
        response_id?: string;
      };
      error?: { message?: string };
    };

    const type = parsed.type ?? eventType;

    if (type === "reasoning.delta" && parsed.content) {
      state.accumulatedReasoning += parsed.content;
      onReasoningChunk?.(parsed.content, false);
      return "continue";
    }

    if (type === "message.delta" && parsed.content) {
      if (state.firstTokenAt == null) state.firstTokenAt = Date.now();
      state.accumulatedContent += parsed.content;
      onChunk(parsed.content, false);
      return "continue";
    }

    if (type.startsWith("model_load.")) {
      const phase = type === "model_load.start" ? "loading"
        : type === "model_load.progress" ? "loading"
        : type === "model_load.end" ? "ready"
        : type === "model_load.error" ? "error"
        : "loading";
      const percent = typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).percent != null
          ? Number((parsed as Record<string, unknown>).percent)
          : undefined
        : undefined;
      onModelLoadProgress?.(phase, Number.isFinite(percent) ? percent : undefined);
      return "continue";
    }

    if (type === "error") {
      console.error("[LM Studio]", parsed.error?.message ?? "Stream error");
      return "continue";
    }

    if (type === "chat.end" && parsed.result) {
      if (parsed.result.stats) state.stats = parsed.result.stats;
      if (parsed.result.response_id) state.responseId = parsed.result.response_id;

      const toolCalls = extractToolCalls(parsed.result.output);
      if (toolCalls.length > 0) state.toolCalls = toolCalls;

      const finalReasoning = extractReasoningText(parsed.result.output);
      if (finalReasoning.length > state.accumulatedReasoning.length) {
        const reasoningRemainder = finalReasoning.slice(state.accumulatedReasoning.length);
        if (reasoningRemainder) {
          state.accumulatedReasoning = finalReasoning;
          onReasoningChunk?.(reasoningRemainder, false);
        }
      }

      const finalText = extractMessageText(parsed.result.output);
      if (finalText && finalText.length > state.accumulatedContent.length) {
        const remainder = finalText.slice(state.accumulatedContent.length);
        if (remainder) {
          if (state.firstTokenAt == null) state.firstTokenAt = Date.now();
          state.accumulatedContent = finalText;
          onChunk(remainder, false);
        }
      }

      onReasoningChunk?.("", true);
      onChunk("", true);
      return "done";
    }
  } catch {
    // skip malformed chunk
  }

  return "continue";
}

function isClosedTauriResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource id \d+ is invalid/i.test(message);
}

type OpenAiStreamState = StreamState & {
  toolCallAccumulators: Map<number, { id?: string; name?: string; arguments: string }>;
  notifiedToolIndices: Set<number>;
};

function finalizeOpenAiToolCalls(state: OpenAiStreamState): ProviderToolCall[] {
  if (state.toolCallAccumulators.size === 0) return [];
  return [...state.toolCallAccumulators.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, acc]) => ({
      id: acc.id ?? crypto.randomUUID(),
      name: acc.name ?? "",
      arguments: parseToolArguments(acc.arguments),
    }))
    .filter((call) => call.name);
}

function processOpenAiStreamData(
  data: string,
  state: OpenAiStreamState,
  onChunk: (content: string, done: boolean) => void,
  onReasoningChunk?: (content: string, done: boolean) => void,
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void,
): "continue" | "done" {
  if (data === "[DONE]") {
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
      if (state.firstTokenAt == null) state.firstTokenAt = Date.now();
      state.accumulatedContent += delta.content;
      onChunk(delta.content, false);
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

async function readV1SseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventType: string, data: string) => "continue" | "done",
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch((error: unknown) => {
          if (!isClosedTauriResourceError(error)) throw error;
        });
        return;
      }

      const { done, value } = await reader.read().catch((error: unknown) => {
        if (signal?.aborted || isClosedTauriResourceError(error)) {
          return { done: true, value: undefined } as ReadableStreamReadResult<Uint8Array>;
        }
        throw error;
      });
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        let eventType = "";
        let data = "";

        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            eventType = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            data = trimmed.slice(5).trim();
          }
        }

        if (data && onEvent(eventType, data) === "done") return;
      }
    }

    const tail = buffer.trim();
    if (tail) {
      let eventType = "";
      let data = "";
      for (const line of tail.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event:")) eventType = trimmed.slice(6).trim();
        else if (trimmed.startsWith("data:")) data = trimmed.slice(5).trim();
      }
      if (data) onEvent(eventType, data);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      if (!isClosedTauriResourceError(error)) throw error;
    }
  }
}

export async function isServerRunning(baseUrl?: string): Promise<boolean> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/v1/models`;
    const res = await tauriFetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startServer(baseUrl?: string): Promise<{ success: boolean; message: string }> {
  try {
    const endpoint = await invoke<string>("start_lm_studio_server", {
      baseUrl: baseUrl?.trim() || null,
    });
    return { success: true, message: `Server ready at ${endpoint}` };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to start LM Studio server",
    };
  }
}

export async function ensureServerRunning(baseUrl?: string): Promise<boolean> {
  const url = baseUrl?.trim() || DEFAULT_BASE_URL;
  if (await isServerRunning(url)) return true;

  const result = await startServer(url);
  if (!result.success) {
    console.error("[LM Studio]", result.message);
    return false;
  }

  return isServerRunning(url);
}

type LmStudioModelEntry = {
  id?: unknown;
  key?: unknown;
  model?: unknown;
  path?: unknown;
  loaded?: unknown;
  state?: unknown;
  status?: unknown;
  loaded_instances?: unknown;
};

export type LoadedLmStudioModelInstance = {
  modelId: string;
  instanceId: string;
};

function modelIdFromEntry(entry: LmStudioModelEntry): string {
  const value = entry.id ?? entry.key ?? entry.model ?? entry.path;
  return typeof value === "string" ? value.trim() : "";
}

function loadedInstancesFromEntry(entry: LmStudioModelEntry): LoadedLmStudioModelInstance[] {
  if (!Array.isArray(entry.loaded_instances)) return [];
  const modelId = modelIdFromEntry(entry);
  if (!modelId) return [];

  return entry.loaded_instances
    .map((instance) => {
      if (!instance || typeof instance !== "object") return null;
      const value = (instance as Record<string, unknown>).id;
      const instanceId = typeof value === "string" ? value.trim() : "";
      return instanceId ? { modelId, instanceId } : null;
    })
    .filter((instance): instance is LoadedLmStudioModelInstance => Boolean(instance));
}

function isLoadedModelEntry(entry: LmStudioModelEntry): boolean {
  if (entry.loaded === true) return true;
  const state = typeof entry.state === "string" ? entry.state.toLowerCase() : "";
  const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "";
  return state === "loaded" || status === "loaded";
}

function parseModelEntries(json: unknown): LmStudioModelEntry[] {
  if (Array.isArray(json)) return json as LmStudioModelEntry[];
  if (!json || typeof json !== "object") return [];

  const record = json as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as LmStudioModelEntry[];
  if (Array.isArray(record.models)) return record.models as LmStudioModelEntry[];
  if (Array.isArray(record.loaded)) return record.loaded as LmStudioModelEntry[];
  return [];
}

async function fetchModelEntries(url: string): Promise<LmStudioModelEntry[]> {
  const res = await tauriFetch(url);
  if (!res.ok) return [];
  return parseModelEntries(await res.json());
}

export async function fetchLoadedLmStudioModelInstancesDirect(
  baseUrl?: string,
): Promise<LoadedLmStudioModelInstance[]> {
  const root = baseUrl || DEFAULT_BASE_URL;
  const nativeEntries = await fetchModelEntries(`${root}/api/v1/models`);
  return nativeEntries.flatMap((entry) => {
    const instances = loadedInstancesFromEntry(entry);
    if (instances.length > 0) return instances;
    if (!isLoadedModelEntry(entry)) return [];

    const modelId = modelIdFromEntry(entry);
    return modelId ? [{ modelId, instanceId: modelId }] : [];
  });
}

export async function loadLmStudioModelDirect(
  model: string,
  options?: {
    baseUrl?: string;
    contextLength?: number;
    flashAttention?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  return loadModelImpl(model, options);
}

async function loadModelImpl(
  model: string,
  options?: {
    baseUrl?: string;
    contextLength?: number;
    flashAttention?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${options?.baseUrl || DEFAULT_BASE_URL}/api/v1/models/load`;
    const res = await tauriFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        context_length: options?.contextLength,
        flash_attention: options?.flashAttention,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `Load failed (${res.status}): ${text}` };
    }

    const json = await res.json();
    return {
      success: true,
      message: `Model loaded in ${json.load_time_seconds?.toFixed(1)}s`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to load model",
    };
  }
}

export async function unloadLmStudioModelDirect(
  model: string,
  baseUrl?: string,
): Promise<{ success: boolean; message: string }> {
  return unloadModelImpl(model, baseUrl);
}

async function unloadModelImpl(
  instanceId: string,
  baseUrl?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/api/v1/models/unload`;
    const res = await tauriFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `Unload failed (${res.status}): ${text}` };
    }

    return { success: true, message: "Model unloaded" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to unload model",
    };
  }
}

export async function fetchModels(baseUrl?: string): Promise<ModelInfo[]> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/v1/models`;
    const res = await tauriFetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      supportsImages: inferSupportsImages(m.id),
    }));
  } catch {
    return [];
  }
}

export async function sendLmStudioChat(options: {
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
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onModelLoadProgress?: (phase: string, percent?: number) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
}): Promise<void> {
  return runLmStudioExclusive(() => sendLmStudioChatImpl(options));
}

async function sendLmStudioChatImpl(options: {
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
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onModelLoadProgress?: (phase: string, percent?: number) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
}): Promise<void> {
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
      const res = await tauriFetch(`${baseUrl || DEFAULT_BASE_URL}${CHAT_PATH}`, {
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
          }),
        ),
        signal: fetchSignal,
      });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      onError(
        text
          ? `Request failed (${res.status}): ${text.slice(0, 200)}`
          : `Request failed with status ${res.status}`,
      );
      return;
    }

    const handleEvent = (eventType: string, data: string) =>
      processV1StreamEvent(eventType, data, streamState, onChunk, onReasoningChunk, onModelLoadProgress);

    if (res.body) {
      await readV1SseStream(res.body, handleEvent, signal);
    } else {
      const json = (await res.json()) as {
        output?: V1OutputItem[];
        stats?: LmChatStats;
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
    if (signal?.aborted) {
      onError("Request aborted");
    } else {
      onError(err instanceof Error ? err.message : "Unknown error");
    }
  }
}

async function sendOpenAiCompatibleChat(options: {
  messages: ChatMessage[];
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
  startedAt: number;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onToolCallDetected?: (call: Pick<ProviderToolCall, "id" | "name">) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
}): Promise<void> {
  const streamState: OpenAiStreamState = {
    accumulatedContent: "",
    accumulatedReasoning: "",
    toolCallAccumulators: new Map(),
    notifiedToolIndices: new Set(),
  };

  try {
    const { signal: fetchSignal, cleanup: cleanupFetchTimeout } = withFetchTimeout(options.signal);
    try {
      const res = await tauriFetch(`${options.baseUrl || DEFAULT_BASE_URL}${OPENAI_CHAT_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOpenAiChatBody({ ...options, stream: true })),
        signal: fetchSignal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        options.onError(
          text
            ? `Request failed (${res.status}): ${text.slice(0, 200)}`
            : `Request failed with status ${res.status}`,
        );
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
          streamState.firstTokenAt = Date.now();
          streamState.accumulatedContent = content;
          options.onChunk(content, false);
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
    if (options.signal?.aborted) {
      options.onError("Request aborted");
    } else {
      options.onError(err instanceof Error ? err.message : "Unknown error");
    }
  }
}
