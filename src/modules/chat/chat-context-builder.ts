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
  contextAnchoringBlock?: string;
  projectPromptBlock?: string;
  skillContextBlock?: string;
  resolvedContextLength: number;
};

export function stripImageAttachments(messages: ChatMessage[]): ChatMessage[] {
  let changed = false;
  const result = messages.map((message) => {
    const attachments = message.attachments;
    if (!attachments?.some((attachment) => attachment.fileType === "image")) {
      return message;
    }
    changed = true;
    const filtered = attachments.filter((attachment) => attachment.fileType !== "image");
    return { ...message, attachments: filtered.length > 0 ? filtered : undefined };
  });
  return changed ? result : messages;
}

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
      contextAnchoringBlock: context.contextAnchoringBlock,
      projectPromptBlock: context.projectPromptBlock,
      skillContextBlock: context.skillContextBlock,
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
  const hasWebSearch = sections.some(
    (section) => section.includes("<veyra_web_search>"),
  );
  const base = `${sections.join("\n\n")}\n\nUse the tool results above. You may call more tools if needed before answering.`;
  if (!hasWebSearch) return base;
  return `${base} For this chat reply, source links are shown in the UI separately — do not repeat URLs in prose unless the user explicitly asks for inline citations.`;
}
