import type { ChatMessage } from "@/lib/chat-types";
import type { BuildChatContextOptions } from "@/lib/context";
import {
  buildContextAnchoringBlock,
  buildDocumentInstructionsBlock,
  buildProjectContextBlock,
} from "@/lib/prompts";
import { useSettingsStore } from "@/stores/settings-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { resolveCharacterBlock } from "@/lib/resolve-character-block";

export function buildContextPanelOptions(input: {
  conversation: {
    messages: ChatMessage[];
    conversationSummary?: string | null;
    summaryCoversMessageCount?: number;
    characterId?: string | null;
    groupId?: string | null;
    projectId?: string | null;
  };
  modelId: string;
  modelName?: string;
  providerName?: string;
  reservedOutputTokens: number;
}): BuildChatContextOptions {
  const settings = useSettingsStore.getState();
  const contextAnchoringBlock = settings.contextAnchoringEnabled
    ? buildContextAnchoringBlock()
    : undefined;

  const projectRecord = input.conversation.projectId
    ? useProjectStore.getState().projects.find((p) => p.id === input.conversation.projectId)
    : undefined;
  const projectPromptBlock = projectRecord?.systemPrompt?.trim()
    ? buildProjectContextBlock({
        name: projectRecord.name,
        kind: projectRecord.kind,
        description: projectRecord.description,
        systemPrompt: projectRecord.systemPrompt,
      })
    : undefined;

  const activeDocument = useDocumentStore.getState().documents.find(
    (doc) => doc.id === useDocumentStore.getState().activeDocumentId,
  );
  const documentInstructionsBlock = settings.documentPanelEnabled
    ? buildDocumentInstructionsBlock(
        activeDocument
          ? { id: activeDocument.id, title: activeDocument.title, type: activeDocument.type }
          : undefined,
      )
    : undefined;

  const userPrompt = settings.getModelSettings(input.modelId).systemPrompt || undefined;

  return {
    conversationSummary: input.conversation.conversationSummary,
    summaryCoversMessageCount: input.conversation.summaryCoversMessageCount,
    contextAnchoringBlock,
    documentInstructionsBlock,
    projectPromptBlock,
    userPrompt: userPrompt || undefined,
    reservedOutputTokens: input.reservedOutputTokens,
    modelName: input.modelName,
    providerName: input.providerName,
    characterBlock: resolveCharacterBlock(input.conversation, input.conversation.messages),
  };
}
