import type { ChatMessage, ContextStats } from "@/lib/chat-types";

const DEFAULT_SYSTEM_PROMPT = "You are Veyra, a helpful local AI assistant.";
const DEFAULT_CONTEXT_LIMIT = 8192;
const RESERVED_OUTPUT_TOKENS = 1024;
const CHARS_PER_TOKEN = 4; // rough estimate

/**
 * Estimates the number of tokens in a string using a simple character-based heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Builds the final request messages for the LM Studio chat.
 * Always starts with a system message, then includes as many recent messages
 * as fit within the token budget (context limit minus reserved output tokens).
 */
export function buildChatContext(messages: ChatMessage[]): ChatMessage[] {
  const systemMessage: ChatMessage = {
    id: "system",
    role: "system",
    content: DEFAULT_SYSTEM_PROMPT,
    timestamp: 0,
  };

  const budget = DEFAULT_CONTEXT_LIMIT - RESERVED_OUTPUT_TOKENS;
  const systemTokens = estimateTokens(systemMessage.content);
  let remaining = budget - systemTokens;

  const included: ChatMessage[] = [];

  // Walk backwards from newest to oldest, including messages that fit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.content);

    if (tokens <= remaining) {
      included.push(msg);
      remaining -= tokens;
    }
  }

  // Reverse to restore chronological order
  included.reverse();

  return [systemMessage, ...included];
}

/**
 * Calculates context usage statistics for the current conversation.
 */
export function getContextStats(messages: ChatMessage[]): ContextStats {
  const systemTokens = estimateTokens(DEFAULT_SYSTEM_PROMPT);
  const totalMessageTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0,
  );
  const estimatedTokens = systemTokens + totalMessageTokens;

  const built = buildChatContext(messages);
  // Subtract 1 for the system message we always inject
  const includedMessages = built.length - 1;
  const droppedMessages = messages.length - includedMessages;

  return {
    estimatedTokens,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    percentUsed: Math.round((estimatedTokens / DEFAULT_CONTEXT_LIMIT) * 100),
    includedMessages,
    droppedMessages,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
  };
}
