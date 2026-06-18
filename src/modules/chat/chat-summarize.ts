import type { ChatMessage } from "@/modules/chat/chat-types";
import { getContextStats } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import { buildSummarizeUserMessage, CHAT_SUMMARIZE_SYSTEM } from "@/lib/prompts";
import { formatTranscript } from "@/lib/transcript";
import { useChatStore } from "@/stores/chat-store";

/** Recent turns kept verbatim; older content is folded into the rolling summary. */
const KEEP_RECENT_MESSAGES = 8;
const SUMMARIZE_THRESHOLD_PERCENT = 55;

export function shouldSummarizeConversation(
  messages: ChatMessage[],
  contextLimit: number,
): boolean {
  if (messages.length <= KEEP_RECENT_MESSAGES + 2) return false;
  const stats = getContextStats(messages, contextLimit);
  if (!stats) return false;
  return stats.percentUsed >= SUMMARIZE_THRESHOLD_PERCENT || stats.droppedMessages > 0;
}

export function generateConversationSummary(options: {
  providerId: string;
  model: string;
  messages: ChatMessage[];
  existingSummary?: string;
  signal: AbortSignal;
}): Promise<string> {
  const { providerId, model, messages, existingSummary, signal } = options;
  const adapter = getProviderAdapter(providerId);
  if (!adapter || messages.length === 0) return Promise.resolve("");

  const userContent = buildSummarizeUserMessage({
    existingSummary,
    transcript: formatTranscript(messages),
  });

  return new Promise((resolve) => {
    let summary = "";
    adapter
      .sendChat({
        model,
        messages: [
          { id: "chat-summarize-system", role: "system", content: CHAT_SUMMARIZE_SYSTEM, timestamp: 0 },
          { id: crypto.randomUUID(), role: "user", content: userContent, timestamp: Date.now() },
        ],
        signal,
        temperature: 0.3,
        onChunk: (chunk) => {
          summary += chunk;
        },
        onReasoningChunk: () => {},
        onError: () => resolve(""),
        onComplete: () => {
          const cleaned = summary.trim();
          resolve(cleaned.length > 0 ? cleaned.slice(0, 2000) : "");
        },
      })
      .catch(() => resolve(""));
  });
}

export async function runSummarizeForConversation(options: {
  conversationId: string;
  providerId: string;
  model: string;
  contextLimit: number;
  signal?: AbortSignal;
}): Promise<{ prompt?: string; output?: string } | void> {
  const { conversationId, providerId, model, contextLimit, signal } = options;
  const latest = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  if (!latest || signal?.aborted) return;
  if (!shouldSummarizeConversation(latest.messages, contextLimit)) return;

  const start = latest.summaryCoversMessageCount ?? 0;
  const end = Math.max(0, latest.messages.length - KEEP_RECENT_MESSAGES);
  const batch = latest.messages.slice(start, end);
  if (batch.length < 2) return;

  const userContent = buildSummarizeUserMessage({
    existingSummary: latest.conversationSummary,
    transcript: formatTranscript(batch),
  });
  const fullPrompt = `${CHAT_SUMMARIZE_SYSTEM}\n\n---\n\n${userContent}`;

  const summary = await generateConversationSummary({
    providerId,
    model,
    messages: batch,
    existingSummary: latest.conversationSummary,
    signal: signal ?? AbortSignal.timeout(120_000),
  });

  if (summary && !signal?.aborted) {
    useChatStore.getState().setConversationSummary(conversationId, summary, end);
    return { prompt: fullPrompt, output: summary };
  }
}
