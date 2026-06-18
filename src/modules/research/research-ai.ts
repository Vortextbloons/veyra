import type { ChatMessage } from "@/modules/chat/chat-types";
import { getProviderAdapter, prepareProviderModel } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { estimateTokens } from "@/lib/context";
import { pickResearchAiOutputText } from "./research-json-utils";

// ── AI helper ────────────────────────────────────────────────────────────────

export type CallResearchAiOptions = {
  reasoningEnabled?: boolean;
  modelId?: string;
  providerId?: string;
  temperature?: number;
  responseFormat?: { type: "json_object" | "text" };
  jsonModeHint?: boolean;
};

export type CallResearchAiResult = {
  text: string;
  tokens: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export async function callResearchAi(
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal: AbortSignal,
  onChunk?: (chunk: string) => void,
  maxTokens?: number,
  options: CallResearchAiOptions = {},
): Promise<CallResearchAiResult> {
  const providerState = useProviderStore.getState();
  const selectedProvider = options.providerId ?? providerState.selectedProvider;
  const selectedModel = options.modelId ?? providerState.selectedModel;

  if (!selectedProvider || !selectedModel) {
    throw new Error("No provider or model selected");
  }

  const adapter = getProviderAdapter(selectedProvider);
  if (!adapter) {
    throw new Error(`Provider ${selectedProvider} not found`);
  }
  const adapterRef = adapter;

  const settings = useSettingsStore.getState();
  const modelSettings = settings.getModelSettings(selectedModel);

  await prepareProviderModel(selectedProvider, selectedModel, {
    signal,
    contextLength: modelSettings.contextLength || undefined,
  });
  if (signal.aborted) {
    throw new DOMException("Research aborted", "AbortError");
  }

  const reservedOutput = maxTokens ?? modelSettings.maxTokens ?? 512;
  const contextWindow = modelSettings.contextLength;
  if (contextWindow && contextWindow > 0) {
    const available = contextWindow - reservedOutput;
    if (available > 0) {
      const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
      if (total > available) {
        const overflow = total - available;
        console.debug(
          `[research-runtime] prompt exceeds context window: ${total} > ${available} — truncating ${overflow} tokens`,
        );
        const systemMsg = messages.find((m) => m.role === "system");
        const lastUserIdx = (() => {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]!.role === "user") return i;
          }
          return -1;
        })();
        const lastUser = lastUserIdx >= 0 ? messages[lastUserIdx] : undefined;
        const flexMsgs = messages
          .map((m, i) => ({ m, i }))
          .filter(({ m, i }) => m !== systemMsg && i !== lastUserIdx);
        const kept: typeof messages = [];
        let running = (systemMsg ? estimateTokens(systemMsg.content) : 0) + (lastUser ? estimateTokens(lastUser.content) : 0);
        for (const { m } of flexMsgs) {
          const t = estimateTokens(m.content);
          if (running + t > available) break;
          kept.push(m);
          running += t;
        }
        const truncatedMessages: typeof messages = [
          ...(systemMsg ? [systemMsg] : []),
          ...kept,
          ...(lastUser ? [lastUser] : []),
        ];
        const chatMessages: ChatMessage[] = truncatedMessages.map((m) => makeChatMessage(m.role, m.content));
        return runSendChat(chatMessages);
      }
    }
  }

  const chatMessages: ChatMessage[] = messages.map((m) => makeChatMessage(m.role, m.content));
  return runSendChat(chatMessages);

  function runSendChat(msgs: ChatMessage[]): Promise<CallResearchAiResult> {
    return new Promise((resolve, reject) => {
      let fullText = "";
      let fullReasoning = "";
      let captured: CallResearchAiResult["tokens"] = {};

      adapterRef
        .sendChat({
          messages: msgs,
          model: selectedModel,
          temperature: options.temperature ?? 0.2, // Lower temperature for more factual, deterministic output
          contextLength: modelSettings.contextLength || undefined,
          maxTokens: maxTokens || modelSettings.maxTokens || undefined,
          topP: 0.9,
          repetitionPenalty: 1.0,
          stopSequences: modelSettings.stopSequences || undefined,
          toolChoice: "none",
          ...(options.reasoningEnabled !== undefined
            ? { reasoningEnabled: options.reasoningEnabled }
            : {}),
          ...(options.responseFormat
            ? { responseFormat: options.responseFormat }
            : options.jsonModeHint && adapterRef.capabilities?.jsonMode
              ? { responseFormat: { type: "json_object" as const } }
              : {}),
          signal,
          onChunk: (content) => {
            fullText += content;
            onChunk?.(content);
          },
          onReasoningChunk: (content) => {
            fullReasoning += content;
          },
          onError: (error) => {
            reject(new Error(error));
          },
          onComplete: (result) => {
            const perf = result?.performance;
            let inputTokens: number | undefined;
            let outputTokens: number | undefined;
            let totalTokens: number | undefined;
            if (perf) {
              inputTokens = perf.inputTokens;
              outputTokens =
                perf.outputTokens ?? (perf.totalTokens != null && inputTokens != null
                  ? Math.max(0, perf.totalTokens - inputTokens)
                  : undefined);
              totalTokens =
                perf.totalTokens ??
                (inputTokens != null && outputTokens != null
                  ? inputTokens + outputTokens
                  : undefined);
            }
            if (totalTokens == null) {
              const allText = msgs.map((m) => m.content).join("\n");
              const fallbackInput = estimateTokens(allText);
              const fallbackOutput = estimateTokens(fullText);
              inputTokens = inputTokens ?? fallbackInput;
              outputTokens = outputTokens ?? fallbackOutput;
              totalTokens = totalTokens ?? fallbackInput + fallbackOutput;
            }
            captured = {
              ...(inputTokens != null ? { inputTokens } : {}),
              ...(outputTokens != null ? { outputTokens } : {}),
              ...(totalTokens != null ? { totalTokens } : {}),
            };
            resolve({
              text: pickResearchAiOutputText(fullText, fullReasoning).trim(),
              tokens: captured,
            });
          },
        })
        .catch((error) => reject(error));
    });
  }
}

export function getTemporalContext(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString("en-US", { month: "long" });
  const day = now.getDate();
  return `Current date: ${month} ${day}, ${year}. When generating search queries, prefer recent sources (last 1-2 years) unless the topic requires historical data. Use date-specific queries (e.g., "${year}", "latest", "recent") when recency matters. When evaluating source currency, consider that information older than 2-3 years may be outdated for fast-moving topics.`;
}

export function makeChatMessage(role: "system" | "user", content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}
