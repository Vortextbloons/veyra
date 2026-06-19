import type { ChatMessage, ContextStats } from "@/modules/chat/chat-types";
import type { MemoryPack } from "@/modules/memory/memory-types";
import {
  buildMemoryContextBlock,
  buildSummaryContextBlock,
  composeMainSystemPrompt,
  VEYRA_CORE_SYSTEM,
} from "@/lib/prompts";

const DEFAULT_CONTEXT_LIMIT = 8192;
const DEFAULT_RESERVED_OUTPUT_TOKENS = 1024;
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
  /** Tools block injected into the system prompt. */
  toolsBlock?: string | null;
  /** Web search results injected when re-prompting after a search. */
  webSearchContextBlock?: string | null;
  /** Context anchoring block for first message (date/time, platform). */
  contextAnchoringBlock?: string | null;
  /** Document creation instructions when the feature is enabled. */
  documentInstructionsBlock?: string | null;
  /** Project-level instructions and context. */
  projectPromptBlock?: string | null;
  /** Custom user system prompt prepended before the core prompt. */
  userPrompt?: string | null;
  /** Number of tokens reserved for the model's response. */
  reservedOutputTokens?: number;
  /** Active model display name — injected into the system prompt so the
   *  model knows its own identity for this turn. */
  modelName?: string | null;
  /** Active provider display name — paired with `modelName`. */
  providerName?: string | null;
  /** Character context block (persona, lorebook, examples) for roleplay
   *  chats. Injected after the core prompt and before the memory block. */
  characterBlock?: string | null;
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
    message.attachments?.filter((a) => a.fileType === "image").length ?? 0;
  const fileTextTokens =
    message.attachments
      ?.filter((a) => a.fileType !== "image" && a.textContent)
      .reduce((sum, a) => sum + estimateTokens(a.textContent!), 0) ?? 0;
  return textTokens + imageCount * TOKENS_PER_IMAGE + fileTextTokens;
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

  const webSearchBlock = options.webSearchContextBlock?.trim()
    || options.toolsBlock?.trim()
    || undefined;

  const contextAnchoringBlock = options.contextAnchoringBlock?.trim() || undefined;
  const documentInstructionsBlock = options.documentInstructionsBlock?.trim() || undefined;
  const projectPromptBlock = options.projectPromptBlock?.trim() || undefined;
  const userPrompt = options.userPrompt?.trim() || undefined;

  const characterBlock = options.characterBlock?.trim() || undefined;

  return composeMainSystemPrompt({
    userPrompt,
    projectPromptBlock,
    characterBlock,
    memoryBlock,
    summaryBlock,
    toolsBlock: webSearchBlock,
    contextAnchoringBlock,
    documentInstructionsBlock,
    modelName: options.modelName ?? undefined,
    providerName: options.providerName ?? undefined,
  });
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
  const reserved = options.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS;
  const budget = limit - reserved;
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
export function getContextStats(
  messages: ChatMessage[],
  contextLimit?: number,
  reservedOutputTokens?: number,
): ContextStats | undefined {
  if (messages.length === 0) return undefined;

  const limit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const reserved = reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS;
  const systemTokens = estimateTokens(VEYRA_CORE_SYSTEM);
  const totalMessageTokens = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );
  const estimatedTokens = systemTokens + totalMessageTokens;
  const percentUsed = Math.round((estimatedTokens / limit) * 100);

  let includedMessages = messages.length;
  let droppedMessages = 0;
  if (percentUsed >= 50 || estimatedTokens > limit * 0.5) {
    const built = buildChatContext(messages, { reservedOutputTokens: reserved }, limit);
    includedMessages = built.length - 1;
    droppedMessages = messages.length - includedMessages;
  }

  return {
    estimatedTokens,
    contextLimit: limit,
    percentUsed,
    includedMessages,
    droppedMessages,
    reservedOutputTokens: reserved,
  };
}
