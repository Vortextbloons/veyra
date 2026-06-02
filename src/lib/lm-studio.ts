import type {
  ChatMessage,
  MessagePerformance,
  ModelInfo,
  ProviderConfig,
} from "@/lib/chat-types";
import {
  buildMessagePerformance,
  type LmChatStats,
} from "@/lib/performance";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { Command } from "@tauri-apps/plugin-shell";

const DEFAULT_BASE_URL = "http://localhost:1234";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_CONTEXT_LENGTH = 8192;
const RESERVED_OUTPUT_TOKENS = 1024;

/** LM Studio 0.4+ native chat — accurate `stats` on `chat.end` when streaming. */
const CHAT_PATH = "/api/v1/chat";

export interface LmChatCompleteResult {
  performance: MessagePerformance;
  responseId?: string;
}

type V1OutputItem =
  | { type: "message"; content: string }
  | { type: "reasoning"; content: string }
  | { type: string; content?: string };

type StreamState = {
  firstTokenAt?: number;
  accumulatedContent: string;
  accumulatedReasoning: string;
  stats?: LmChatStats;
  responseId?: string;
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

function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const label =
        msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      return `${label}: ${msg.content}`;
    })
    .join("\n\n");
}

function buildV1ChatBody(options: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  previousResponseId?: string;
}): Record<string, unknown> {
  const { model, messages, temperature, previousResponseId } = options;
  const systemMessage = messages.find((m) => m.role === "system");
  const dialogue = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    stream: true,
    store: true,
    temperature: temperature ?? DEFAULT_TEMPERATURE,
    context_length: DEFAULT_CONTEXT_LENGTH - RESERVED_OUTPUT_TOKENS,
  };

  if (systemMessage?.content) {
    body.system_prompt = systemMessage.content;
  }

  if (previousResponseId?.startsWith("resp_")) {
    body.previous_response_id = previousResponseId;
    const lastUser = [...dialogue].reverse().find((m) => m.role === "user");
    body.input = lastUser?.content ?? "";
  } else {
    body.input = formatTranscript(dialogue);
  }

  return body;
}

function processV1StreamEvent(
  eventType: string,
  data: string,
  state: StreamState,
  onChunk: (content: string, done: boolean) => void,
  onReasoningChunk?: (content: string, done: boolean) => void,
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

    if (type === "error") {
      console.error("[LM Studio]", parsed.error?.message ?? "Stream error");
      return "continue";
    }

    if (type === "chat.end" && parsed.result) {
      if (parsed.result.stats) state.stats = parsed.result.stats;
      if (parsed.result.response_id) state.responseId = parsed.result.response_id;

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
        await reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
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
    reader.releaseLock();
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

export async function startServer(): Promise<{ success: boolean; message: string }> {
  try {
    const lmsCheck = await new Command("lms", ["--version"]).execute();
    if (lmsCheck.code !== 0) {
      return {
        success: false,
        message: "LM Studio CLI (lms) not found. Install LM Studio and ensure 'lms' is in your PATH.",
      };
    }

    const daemonResult = await new Command("lms", ["daemon", "up"]).execute();
    if (daemonResult.code !== 0) {
      return {
        success: false,
        message: `Failed to start daemon: ${daemonResult.stderr || daemonResult.stdout}`,
      };
    }

    const serverResult = await new Command("lms", ["server", "start"]).execute();
    if (serverResult.code !== 0) {
      return {
        success: false,
        message: `Failed to start server: ${serverResult.stderr || serverResult.stdout}`,
      };
    }

    return { success: true, message: "Server started successfully" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to start LM Studio server",
    };
  }
}

export async function ensureServerRunning(baseUrl?: string): Promise<boolean> {
  const running = await isServerRunning(baseUrl);
  if (running) return true;

  const result = await startServer();
  if (!result.success) {
    console.error("[LM Studio]", result.message);
    return false;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(baseUrl)) return true;
  }

  console.error("[LM Studio] Server started but not responding");
  return false;
}

export async function loadModel(
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

export async function unloadModel(
  model: string,
  baseUrl?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/api/v1/models/unload`;
    const res = await tauriFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
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
  previousResponseId?: string;
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onReasoningChunk?: (content: string, done: boolean) => void;
  onComplete?: (result: LmChatCompleteResult) => void;
  onError: (error: string) => void;
}): Promise<void> {
  const {
    messages,
    model,
    baseUrl,
    temperature,
    previousResponseId,
    signal,
    onChunk,
    onReasoningChunk,
    onComplete,
    onError,
  } = options;

  const startedAt = Date.now();
  const streamState: StreamState = {
    accumulatedContent: "",
    accumulatedReasoning: "",
  };

  try {
    const res = await tauriFetch(`${baseUrl || DEFAULT_BASE_URL}${CHAT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildV1ChatBody({ model, messages, temperature, previousResponseId }),
      ),
      signal,
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
      processV1StreamEvent(eventType, data, streamState, onChunk, onReasoningChunk);

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
    });
  } catch (err: unknown) {
    if (signal?.aborted) {
      onError("Request aborted");
    } else {
      onError(err instanceof Error ? err.message : "Unknown error");
    }
  }
}

export function getDefaultProviderConfig(modelId?: string): ProviderConfig {
  return {
    baseUrl: DEFAULT_BASE_URL,
    model: modelId || "local-model",
    temperature: DEFAULT_TEMPERATURE,
  };
}
