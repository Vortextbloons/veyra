import type { ChatMessage, ContextStats } from "@/lib/chat-types";
import type { MemoryPack } from "@/lib/memory-types";
import {
  buildMemoryContextBlock,
  buildSummaryContextBlock,
  composeMainSystemPrompt,
  VEYRA_CORE_SYSTEM,
} from "@/lib/prompts";

const DEFAULT_CONTEXT_LIMIT = 8192;
const RESERVED_OUTPUT_TOKENS = 1024;
const TOKENS_PER_IMAGE = 512; // rough vision patch budget

/**
 * Options for buildChatContext.
 */
export interface BuildChatContextOptions {
  /**
   * Optional memory pack to inject into the composed system prompt. When
   * undefined or null, no memory block is added.
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
  const CHARS_PER_TOKEN = 4;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: ChatMessage): number {
  const textTokens = estimateTokens(message.content);
  const imageCount =
    message.attachments?.filter((a) => a.mimeType.startsWith("image/")).length ?? 0;
  return textTokens + imageCount * TOKENS_PER_IMAGE;
}

function buildSystemContent(options: BuildChatContextOptions): string {
  const memoryBlock =
    options.memoryPack && options.memoryPack.content.trim().length > 0
      ? buildMemoryContextBlock(options.memoryPack.content)
      : undefined;

  const summaryText = options.conversationSummary?.trim() ?? "";
  const summaryCovers = Math.max(0, options.summaryCoversMessageCount ?? 0);
  const summaryBlock =
    summaryText.length > 0 && summaryCovers > 0
      ? buildSummaryContextBlock(summaryText)
      : undefined;

  return composeMainSystemPrompt({ memoryBlock, summaryBlock });
}

/**
 * Builds the final request messages for the LM Studio chat.
 * Always starts with a single composed system message, then includes as many
 * recent messages as fit within the token budget (context limit minus reserved
 * output tokens).
 *
 * Memory and conversation summary are embedded in the system prompt (memory
 * before summary). The memory pack body is always included when supplied —
 * retrieval is responsible for keeping it under `maxMemoryTokens`.
 */
export function buildChatContext(
  messages: ChatMessage[],
  options: BuildChatContextOptions = {},
  contextLimit?: number,
): ChatMessage[] {
  const systemContent = buildSystemContent(options);
  const systemMessage: ChatMessage = {
    id: "system",
    role: "system",
    content: systemContent,
    timestamp: 0,
  };

  const summaryCovers = Math.max(0, options.summaryCoversMessageCount ?? 0);
  const hasSummary =
    (options.conversationSummary?.trim().length ?? 0) > 0 && summaryCovers > 0;

  const activeMessages =
    hasSummary && summaryCovers > 0
      ? messages.slice(Math.min(summaryCovers, messages.length))
      : messages;

  const limit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const budget = limit - RESERVED_OUTPUT_TOKENS;
  let remaining = budget - estimateTokens(systemMessage.content);

  const included: ChatMessage[] = [];

  for (let i = activeMessages.length - 1; i >= 0; i--) {
    const msg = activeMessages[i];
    const tokens = estimateMessageTokens(msg);

    if (tokens <= remaining) {
      included.push(msg);
      remaining -= tokens;
    }
  }

  included.reverse();

  return [systemMessage, ...included];
}

/**
 * Calculates context usage statistics for the current conversation.
 * Does NOT account for an injected memory pack — it is an estimate of the
 * raw conversation length. The caller can add pack token count to the result
 * if they need budget visibility for memory.
 */
export function getContextStats(messages: ChatMessage[], contextLimit?: number): ContextStats {
  const limit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const systemTokens = estimateTokens(VEYRA_CORE_SYSTEM);
  const totalMessageTokens = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );
  const estimatedTokens = systemTokens + totalMessageTokens;

  const built = buildChatContext(messages, {}, limit);
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
