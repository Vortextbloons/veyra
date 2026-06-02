import type { ChatMessage, ContextStats } from "@/lib/chat-types";
import type { MemoryPack } from "@/lib/memory-types";

const DEFAULT_SYSTEM_PROMPT = "You are Veyra, a helpful local AI assistant.";
const DEFAULT_CONTEXT_LIMIT = 8192;
const RESERVED_OUTPUT_TOKENS = 1024;
const CHARS_PER_TOKEN = 4; // rough estimate
const TOKENS_PER_IMAGE = 512; // rough vision patch budget

/**
 * Options for buildChatContext.
 */
export interface BuildChatContextOptions {
  /**
   * Optional memory pack to inject as a system message. When undefined or
   * null, no memory system message is added and behavior is identical to the
   * pre-memory buildChatContext(messages) call.
   */
  memoryPack?: MemoryPack | null;
  /** Rolling summary of older messages (auto-summarize). */
  conversationSummary?: string | null;
  /** How many leading messages are represented by the summary. */
  summaryCoversMessageCount?: number;
}

/**
 * Estimates the number of tokens in a string using a simple character-based heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: ChatMessage): number {
  const textTokens = estimateTokens(message.content);
  const imageCount =
    message.attachments?.filter((a) => a.mimeType.startsWith("image/")).length ?? 0;
  return textTokens + imageCount * TOKENS_PER_IMAGE;
}

const MEMORY_SYSTEM_MESSAGE_ID = "system-memory";
const SUMMARY_SYSTEM_MESSAGE_ID = "system-conversation-summary";

function makeMemorySystemMessage(pack: MemoryPack): ChatMessage {
  return {
    id: MEMORY_SYSTEM_MESSAGE_ID,
    role: "system",
    content: pack.content,
    timestamp: 0,
  };
}

function makeSummarySystemMessage(summary: string): ChatMessage {
  return {
    id: SUMMARY_SYSTEM_MESSAGE_ID,
    role: "system",
    content: `Earlier conversation summary:\n${summary.trim()}`,
    timestamp: 0,
  };
}

/**
 * Builds the final request messages for the LM Studio chat.
 * Always starts with a system message, then includes as many recent messages
 * as fit within the token budget (context limit minus reserved output tokens).
 *
 * If a memory pack is supplied, it is inserted as a second system message
 * (after the default system prompt, before any user/assistant turns). The
 * memory message is always included — the retrieval service is responsible
 * for keeping it under `maxMemoryTokens`, so by the time it reaches here it
 * should already fit. If it does not fit, it is still included (the system
 * prompt + memory are not dropped from the budget walk) and we let the
 * caller decide whether to truncate upstream.
 */
export function buildChatContext(
  messages: ChatMessage[],
  options: BuildChatContextOptions = {},
  contextLimit?: number,
): ChatMessage[] {
  const systemMessage: ChatMessage = {
    id: "system",
    role: "system",
    content: DEFAULT_SYSTEM_PROMPT,
    timestamp: 0,
  };

  const memoryMessage =
    options.memoryPack && options.memoryPack.content.trim().length > 0
      ? makeMemorySystemMessage(options.memoryPack)
      : null;

  const summaryText = options.conversationSummary?.trim() ?? "";
  const summaryCovers = Math.max(0, options.summaryCoversMessageCount ?? 0);
  const summaryMessage =
    summaryText.length > 0 && summaryCovers > 0
      ? makeSummarySystemMessage(summaryText)
      : null;

  const activeMessages =
    summaryMessage && summaryCovers > 0
      ? messages.slice(Math.min(summaryCovers, messages.length))
      : messages;

  const limit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const budget = limit - RESERVED_OUTPUT_TOKENS;
  let remaining =
    budget -
    estimateTokens(systemMessage.content) -
    (memoryMessage ? estimateTokens(memoryMessage.content) : 0) -
    (summaryMessage ? estimateTokens(summaryMessage.content) : 0);

  const included: ChatMessage[] = [];

  // Walk backwards from newest to oldest, including messages that fit
  for (let i = activeMessages.length - 1; i >= 0; i--) {
    const msg = activeMessages[i];
    const tokens = estimateMessageTokens(msg);

    if (tokens <= remaining) {
      included.push(msg);
      remaining -= tokens;
    }
  }

  // Reverse to restore chronological order
  included.reverse();

  const prefix = [systemMessage];
  if (summaryMessage) prefix.push(summaryMessage);
  if (memoryMessage) prefix.push(memoryMessage);
  return [...prefix, ...included];
}

/**
 * Calculates context usage statistics for the current conversation.
 * Does NOT account for an injected memory pack — it is an estimate of the
 * raw conversation length. The caller can add pack token count to the result
 * if they need budget visibility for memory.
 */
export function getContextStats(messages: ChatMessage[], contextLimit?: number): ContextStats {
  const limit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const systemTokens = estimateTokens(DEFAULT_SYSTEM_PROMPT);
  const totalMessageTokens = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );
  const estimatedTokens = systemTokens + totalMessageTokens;

  const built = buildChatContext(messages, {}, limit);
  // Subtract 1 for the system message we always inject
  const includedMessages = built.length - 1;
  const droppedMessages = messages.length - includedMessages;

  return {
    estimatedTokens,
    contextLimit: limit,
    percentUsed: Math.round((estimatedTokens / limit) * 100),
    includedMessages,
    droppedMessages,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
  };
}
