import type { ChatMessage } from "@/lib/chat-types";
import { getContextStats } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import { useChatStore } from "@/stores/chat-store";

/** Recent turns kept verbatim; older content is folded into the rolling summary. */
const KEEP_RECENT_MESSAGES = 8;
const SUMMARIZE_THRESHOLD_PERCENT = 55;

const SUMMARIZE_PROMPT = `Summarize this chat for future context.

Rules:
- Capture goals, decisions, facts, and open questions
- Use concise bullet points or short paragraphs
- Omit greetings and filler
- Do not invent information not present in the transcript
- Maximum 400 words

{existingBlock}

Transcript:
{transcript}

Summary:`;

function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
    .filter((line) => line.length > 12)
    .join("\n\n");
}

export function shouldSummarizeConversation(
  messages: ChatMessage[],
  contextLimit: number,
): boolean {
  if (messages.length <= KEEP_RECENT_MESSAGES + 2) return false;
  const stats = getContextStats(messages, contextLimit);
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

  const existingBlock = existingSummary?.trim()
    ? `Existing summary (update and merge, do not repeat verbatim):\n${existingSummary.trim()}\n`
    : "";

  const prompt = SUMMARIZE_PROMPT.replace("{existingBlock}", existingBlock).replace(
    "{transcript}",
    formatTranscript(messages),
  );

  return new Promise((resolve) => {
    let summary = "";
    adapter
      .sendChat({
        model,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: prompt,
            timestamp: Date.now(),
          },
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
}): Promise<void> {
  const { conversationId, providerId, model, contextLimit, signal } = options;
  const latest = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  if (!latest || signal?.aborted) return;
  if (!shouldSummarizeConversation(latest.messages, contextLimit)) return;

  const start = latest.summaryCoversMessageCount ?? 0;
  const end = Math.max(0, latest.messages.length - KEEP_RECENT_MESSAGES);
  const batch = latest.messages.slice(start, end);
  if (batch.length < 2) return;

  const summary = await generateConversationSummary({
    providerId,
    model,
    messages: batch,
    existingSummary: latest.conversationSummary,
    signal: signal ?? new AbortController().signal,
  });

  if (summary && !signal?.aborted) {
    useChatStore.getState().setConversationSummary(conversationId, summary, end);
  }
}
