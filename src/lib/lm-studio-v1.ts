import type { ChatMessage } from "@/lib/chat-types";
import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import type {
  V1OutputItem,
  StreamState,
} from "@/lib/lm-studio-types";
import type { LmChatStats } from "@/lib/performance";
import { buildLmStudioInput } from "@/lib/message-attachments";
import { formatTranscript } from "@/lib/transcript";

export const CHAT_PATH = "/api/v1/chat";
const DEFAULT_TEMPERATURE = 0.7;

export function parseToolArguments(value: unknown): Record<string, unknown> {
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

export function stableToolCallId(index: number): string {
  return `tool-${index}`;
}

export function extractMessageText(output: V1OutputItem[] | undefined): string {
  if (!output?.length) return "";
  return output
    .filter((item): item is { type: "message"; content: string } => item.type === "message")
    .map((item) => item.content)
    .join("");
}

export function extractReasoningText(output: V1OutputItem[] | undefined): string {
  if (!output?.length) return "";
  return output
    .filter((item): item is { type: "reasoning"; content: string } => item.type === "reasoning")
    .map((item) => item.content)
    .join("");
}

export function extractToolCalls(output: V1OutputItem[] | undefined): ProviderToolCall[] {
  if (!output?.length) return [];
  const calls: ProviderToolCall[] = [];
  let fallbackIndex = 0;

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
      id:
        typeof record.id === "string"
          ? record.id
          : typeof record.call_id === "string"
            ? record.call_id
            : stableToolCallId(fallbackIndex),
      name,
      arguments: parseToolArguments(record.arguments ?? record.args ?? fn?.arguments),
    });
    fallbackIndex += 1;
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

export function buildV1ChatBody(options: {
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
  reasoningEnabled?: boolean;
  responseFormat?: { type: "json_object" | "text" };
}): Record<string, unknown> {
  const {
    model,
    messages,
    temperature,
    previousResponseId,
    topP,
    repetitionPenalty,
    stopSequences,
    store = true,
    tools,
    toolChoice,
    reasoningEnabled,
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

  // NOTE: LM Studio's /api/v1/chat endpoint does not accept `max_tokens`.
  // Token limits should be managed via the OpenAI-compatible endpoint if needed.

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

  if (reasoningEnabled === false) {
    body.reasoning = "off";
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

export function processV1StreamEvent(
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
