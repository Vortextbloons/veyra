import type { ContextBreakdown } from "@/modules/chat/chat-types";

/** Prompt tokens currently sent to the model (system blocks + included messages). */
export function getBreakdownInputTokens(breakdown: ContextBreakdown): number {
  const includedMessageTokens = breakdown.messageBlocks
    .filter((block) => !block.dropped)
    .reduce((sum, block) => sum + block.tokenCount, 0);
  return breakdown.totalSystemTokens + includedMessageTokens;
}
