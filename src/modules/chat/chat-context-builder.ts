import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type { ProviderChatOptions, ProviderToolDefinition } from "@/lib/providers/types";
import type { MemoryPack } from "@/modules/memory/memory-types";
import { buildChatContext } from "@/lib/context";
import { resolveCharacterBlock } from "@/lib/resolve-character-block";
import type { ResolvedModelSettings } from "@/modules/chat/chat-provider-options";

export type RoundMessagesContext = {
  memoryPack: MemoryPack | null;
  conversation?: Conversation;
  resolvedUserPrompt: string | undefined;
  resolvedReservedOutputTokens: number;
  activeModelName?: string;
  activeProviderName?: string;
  documentInstructionsBlock?: string;
  projectPromptBlock?: string;
  resolvedContextLength: number;
};

export function buildRoundMessages(
  chainMessages: ChatMessage[],
  webSearchContextBlocks: string[],
  context: RoundMessagesContext,
): ChatMessage[] {
  return buildChatContext(
    chainMessages,
    {
      memoryPack: context.memoryPack ?? null,
      conversationSummary: context.conversation?.conversationSummary,
      summaryCoversMessageCount: context.conversation?.summaryCoversMessageCount,
      webSearchContextBlock:
        webSearchContextBlocks.length > 0
          ? webSearchContextBlocks.join("\n\n")
          : undefined,
      documentInstructionsBlock: context.documentInstructionsBlock,
      projectPromptBlock: context.projectPromptBlock,
      userPrompt: context.resolvedUserPrompt,
      reservedOutputTokens: context.resolvedReservedOutputTokens,
      modelName: context.activeModelName,
      providerName: context.activeProviderName,
      characterBlock: resolveCharacterBlock(context.conversation, chainMessages),
    },
    context.resolvedContextLength,
  );
}

export function providerChatBase(
  options: Omit<ProviderChatOptions, "messages" | "onComplete">,
  resolved: ResolvedModelSettings,
  providerTools: ProviderToolDefinition[],
  handleToolCallDetected: (call: { id: string; name: string }) => void,
): Omit<ProviderChatOptions, "messages" | "onComplete"> {
  return {
    ...options,
    previousResponseId: undefined,
    reasoningEnabled: resolved.reasoningEnabled,
    temperature: options.temperature ?? resolved.temperature,
    contextLength: resolved.contextLength,
    maxTokens: resolved.maxTokens || undefined,
    topP: resolved.topP,
    repetitionPenalty: resolved.repetitionPenalty,
    stopSequences: resolved.stopSequences,
    tools: providerTools,
    toolChoice: providerTools.length > 0 ? ("auto" as const) : ("none" as const),
    onToolCallDetected: handleToolCallDetected,
  };
}

export function formatToolResultsMessage(sections: string[]): string {
  if (sections.length === 0) {
    return "Tool calls completed with no usable results. Continue or answer from context.";
  }
  return `${sections.join("\n\n")}\n\nUse the tool results above. You may call more tools if needed before answering. For web search, sources are displayed separately — do not list or cite URLs in prose.`;
}
