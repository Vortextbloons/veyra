import type { ChatMessage, ContextBlock, ContextBreakdown, ContextStats } from "@/modules/chat/chat-types";
import { estimateTokens, buildChatContext, type BuildChatContextOptions } from "@/lib/context";
import {
  VEYRA_CORE_SYSTEM,
  buildMemoryContextBlock,
  buildSummaryContextBlock,
  buildModelIdentityBlock,
} from "@/lib/prompts";

const BLOCK_SEPARATOR_TOKENS = 2;

function buildSystemBlocks(options: BuildChatContextOptions): {
  blocks: ContextBlock[];
  totalTokens: number;
} {
  const blocks: ContextBlock[] = [];

  if (options.userPrompt?.trim()) {
    blocks.push({
      category: "user_prompt",
      label: "Custom Instructions",
      tokenCount: estimateTokens(options.userPrompt.trim()),
      dropped: false,
    });
  }

  blocks.push({
    category: "system_core",
    label: "System Core",
    tokenCount: estimateTokens(VEYRA_CORE_SYSTEM),
    dropped: false,
  });

  const identityBlock = buildModelIdentityBlock(options.modelName, options.providerName);
  if (identityBlock) {
    blocks.push({
      category: "model_identity",
      label: "Model Identity",
      tokenCount: estimateTokens(identityBlock),
      dropped: false,
    });
  }

  if (options.projectPromptBlock?.trim()) {
    blocks.push({
      category: "project",
      label: "Project",
      tokenCount: estimateTokens(options.projectPromptBlock.trim()),
      dropped: false,
    });
  }

  if (options.characterBlock?.trim()) {
    blocks.push({
      category: "character",
      label: "Character",
      tokenCount: estimateTokens(options.characterBlock.trim()),
      dropped: false,
    });
  }

  if (options.contextAnchoringBlock?.trim()) {
    blocks.push({
      category: "context_anchor",
      label: "Context Anchoring",
      tokenCount: estimateTokens(options.contextAnchoringBlock.trim()),
      dropped: false,
    });
  }

  if (options.documentInstructionsBlock?.trim()) {
    blocks.push({
      category: "documents_instructions",
      label: "Document Instructions",
      tokenCount: estimateTokens(options.documentInstructionsBlock.trim()),
      dropped: false,
    });
  }

  if (options.memoryPack && options.memoryPack.content.trim().length > 0) {
    const blockText = buildMemoryContextBlock(options.memoryPack.content);
    const memoryNodeCount = options.memoryPack.sourceNodeIds.length;
    blocks.push({
      category: "memory",
      label: "Memory",
      tokenCount: estimateTokens(blockText),
      dropped: false,
      detail: memoryNodeCount > 0 ? `${memoryNodeCount} node${memoryNodeCount !== 1 ? "s" : ""}` : undefined,
    });
  }

  if (options.conversationSummary?.trim() && (options.summaryCoversMessageCount ?? 0) > 0) {
    const blockText = buildSummaryContextBlock(options.conversationSummary);
    blocks.push({
      category: "summary",
      label: "Conversation Summary",
      tokenCount: estimateTokens(blockText),
      dropped: false,
    });
  }

  const webSearchContextBlock = options.webSearchContextBlock?.trim();
  if (webSearchContextBlock) {
    blocks.push({
      category: "web_search_results",
      label: "Web Search Results",
      tokenCount: estimateTokens(webSearchContextBlock),
      dropped: false,
    });
  }

  const toolsBlock = options.toolsBlock?.trim();
  if (!webSearchContextBlock && toolsBlock) {
    blocks.push({
      category: "tool_definitions",
      label: "Tool Definitions",
      tokenCount: estimateTokens(toolsBlock),
      dropped: false,
    });
  }

  const totalTokens = blocks.reduce((sum, b) => sum + b.tokenCount, 0) + BLOCK_SEPARATOR_TOKENS * Math.max(0, blocks.length - 1);

  return { blocks, totalTokens };
}

export function getContextBreakdown(
  messages: ChatMessage[],
  options: BuildChatContextOptions = {},
  contextLimit?: number,
): ContextBreakdown | undefined {
  if (messages.length === 0) return undefined;

  const built = buildChatContext(messages, options, contextLimit);
  const sourceMessageIds = new Set(messages.map((message) => message.id));
  const includedMessages = built.filter((message) => sourceMessageIds.has(message.id));
  const includedIds = new Set(includedMessages.map((m) => m.id));
  const droppedMessages = messages.filter((m) => !includedIds.has(m.id));
  const limit = contextLimit ?? 8192;
  const reserved = options.reservedOutputTokens ?? 1024;

  const { blocks: systemBlocks, totalTokens: totalSystemTokens } = buildSystemBlocks(options);

  const messageBlocks: ContextBlock[] = [];

  const includedBlocks = includedMessages.map((msg) => ({
    category: msg.role === "user" ? "user_message" as const : msg.role === "assistant" ? "assistant_message" as const : "system_message" as const,
    label: msg.role === "user" ? "User Message" : msg.role === "assistant" ? "Assistant" : "System",
    tokenCount: estimateTokens(msg.content),
    dropped: false,
  }));
  messageBlocks.push(...includedBlocks);

  const droppedBlocks = droppedMessages.map((msg) => ({
    category: msg.role === "user" ? "user_message" as const : msg.role === "assistant" ? "assistant_message" as const : "system_message" as const,
    label: msg.role === "user" ? "User Message" : msg.role === "assistant" ? "Assistant" : "System",
    tokenCount: estimateTokens(msg.content),
    dropped: true,
  }));
  messageBlocks.push(...droppedBlocks);

  const totalMessageTokens = messageBlocks.reduce((sum, b) => sum + b.tokenCount, 0);
  const totalTokens = totalSystemTokens + totalMessageTokens;

  return {
    systemBlocks,
    messageBlocks,
    droppedCount: droppedMessages.length,
    totalSystemTokens,
    totalMessageTokens,
    totalTokens,
    contextLimit: limit,
    reservedOutputTokens: reserved,
  };
}

export function getBreakdownInputTokens(breakdown: ContextBreakdown): number {
  const includedMessageTokens = breakdown.messageBlocks
    .filter((block) => !block.dropped)
    .reduce((sum, block) => sum + block.tokenCount, 0);
  return breakdown.totalSystemTokens + includedMessageTokens;
}

export function getContextStatsFromBreakdown(breakdown: ContextBreakdown): ContextStats {
  const estimatedTokens = getBreakdownInputTokens(breakdown);
  const includedMessages = breakdown.messageBlocks.filter((block) => !block.dropped).length;

  return {
    estimatedTokens,
    contextLimit: breakdown.contextLimit,
    percentUsed: Math.round((estimatedTokens / breakdown.contextLimit) * 100),
    includedMessages,
    droppedMessages: breakdown.droppedCount,
    reservedOutputTokens: breakdown.reservedOutputTokens,
  };
}
