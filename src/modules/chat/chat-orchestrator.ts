import type { ChatMessage, WebSearchSource } from "@/modules/chat/chat-types";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import type { ProviderChatOptions, ProviderToolCall } from "@/lib/providers/types";
import type { MemoryPack } from "@/modules/memory/memory-types";
import type { MemoryRetrievalInfo } from "@/modules/memory/memory-types";
import { getProviderAdapter } from "@/lib/providers";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { buildChatContext } from "@/lib/context";
import { resolveCharacterBlock } from "@/lib/resolve-character-block";
import { buildMemoryPackWithInfo } from "@/modules/memory/memory-retrieval";
import { buildContextAnchoringBlock, buildDocumentInstructionsBlock, buildProjectContextBlock } from "@/lib/prompts";
import { useDocumentStore, selectActiveDocumentMeta } from "@/modules/documents/document-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { registerStreamingToolCall } from "@/modules/chat/chat-tool-utils";
import { resolveModelSettings, resolveProviderTooling } from "@/modules/chat/chat-provider-options";
import {
  buildRoundMessages,
  providerChatBase as buildProviderChatBase,
  formatToolResultsMessage,
  stripImageAttachments,
} from "@/modules/chat/chat-context-builder";
import { rePromptWithTools, createExecuteToolRoundLocal } from "@/modules/chat/chat-tool-loop";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { buildSkillContext } from "@/modules/extensions/skill-runtime";
import { getStudioSystemInstruction, buildStudioResponseContextBlock, buildModeContextBlock, findLatestReadyStudioResponse, inferStudioContextMode, shouldIncludeStudioArtifactContext } from "@/modules/chat/studio/studio-context";
import { resolveConversationExperience } from "@/modules/chat/studio/studio-normalize";

export interface SendChatCompleteContext {
  memoryPack: MemoryPack | null;
  memoryRetrieval: MemoryRetrievalInfo;
  webSearchSources?: WebSearchSource[];
  scratchpadContent?: string;
}

type SendChatRequest = Omit<ProviderChatOptions, "messages" | "onComplete"> & {
  providerId: string;
  messages: ChatMessage[];
  memoryEnabled: boolean;
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode: boolean;
  conversationId?: string;
  projectId?: string;
  onComplete?: (
    result: LmChatCompleteResult,
    context: SendChatCompleteContext,
  ) => void;
};

function latestUserMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export async function sendChatRequest({
  providerId,
  messages,
  memoryEnabled,
  webSearchEnabled,
  codeExecutionEnabled,
  enhancedMode,
  conversationId,
  projectId,
  ...options
}: SendChatRequest): Promise<void> {
  const provider = getProviderAdapter(providerId);
  if (!provider) {
    options.onError(`Provider not found: ${providerId}`);
    return;
  }

  const settings = useSettingsStore.getState();

  const { pack: memoryPack, info: memoryRetrieval } = await buildMemoryPackWithInfo({
    enabled: memoryEnabled,
    mode: settings.memoryMode,
    query: latestUserMessageText(messages),
    messages,
    projectId,
    budget: settings.maxMemoryTokens,
    maxNodes: settings.maxMemoryNodes,
  });

  const userOnComplete = options.onComplete;

  const resolved = resolveModelSettings(options.model, {
    contextLength: options.contextLength,
    maxTokens: options.maxTokens,
    topP: options.topP,
    repetitionPenalty: options.repetitionPenalty,
    stopSequences: options.stopSequences,
  });

  const projectRecord = projectId
    ? useProjectStore.getState().projects.find((p) => p.id === projectId)
    : undefined;
  const projectPromptBlock = projectRecord
    ? buildProjectContextBlock({
        name: projectRecord.name,
        kind: projectRecord.kind,
        description: projectRecord.description,
        systemPrompt: projectRecord.systemPrompt,
      })
    : undefined;

  const conversation = conversationId
    ? useChatStore.getState().conversations.find((c) => c.id === conversationId)
    : undefined;
  const sentSkillSnapshot = [...messages].reverse().find((message) => message.role === "user" && message.skillSnapshot)?.skillSnapshot;
  const extensionState = useExtensionsStore.getState();
  const activeSkill = sentSkillSnapshot
    ? (() => {
        const skill = extensionState.skills.find((item) => item.id === sentSkillSnapshot.id && item.version === sentSkillSnapshot.version);
        return skill ? { skill, workflowId: sentSkillSnapshot.workflowId } : undefined;
      })()
    : extensionState.resolveActiveSkillSelection(conversationId ?? "new-chat", projectId);
  const baseSkillContextBlock = activeSkill ? buildSkillContext(activeSkill.skill, activeSkill.workflowId) : undefined;
  const experience = resolveConversationExperience(conversation ?? {});
  const studioEligible =
    settings.studioModeEnabled &&
    experience === "studio" &&
    !conversation?.characterId &&
    !conversation?.groupId;
  const studioEnabled = studioEligible;
  const studioContextMode = studioEnabled ? inferStudioContextMode({
    characterId: conversation?.characterId,
    groupId: conversation?.groupId,
    projectId: conversation?.projectId,
  }) : undefined;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestStudioResponse = studioEnabled ? findLatestReadyStudioResponse(messages) : undefined;
  const studioResponseBlock =
    studioEnabled &&
    studioContextMode &&
    lastUserMessage?.content &&
    shouldIncludeStudioArtifactContext(lastUserMessage.content) &&
    latestStudioResponse
      ? buildStudioResponseContextBlock(latestStudioResponse)
      : undefined;
  const modeContextBlock = studioContextMode
    ? buildModeContextBlock(studioContextMode, {
        persona: conversation?.characterSnapshot?.name
          ? `${conversation.characterSnapshot.name}${conversation.characterSnapshot.title ? ` — ${conversation.characterSnapshot.title}` : ""}`
          : undefined,
        projectName: projectRecord?.name,
        projectKind: projectRecord?.kind,
        projectDescription: projectRecord?.description,
      })
    : undefined;
  const studioInstruction = studioContextMode ? getStudioSystemInstruction(studioContextMode) : undefined;
  const skillContextBlock = [baseSkillContextBlock, studioInstruction, modeContextBlock, studioResponseBlock]
    .filter(Boolean).join("\n\n") || undefined;

  const contextAnchoringBlock = settings.contextAnchoringEnabled
    ? buildContextAnchoringBlock()
    : undefined;

  const activeDocument = selectActiveDocumentMeta(useDocumentStore.getState());
  const documentInstructionsBlock = settings.documentPanelEnabled
    ? buildDocumentInstructionsBlock(activeDocument)
    : undefined;

  const { providerTools, webSearchEnabled: effectiveWebSearchEnabled, webSearchAvailability } = resolveProviderTooling({
    webSearchEnabled,
    codeExecutionEnabled,
    enhancedMode,
    projectId,
    conversationId,
    studioEnabled,
  });

  const providerStore = useProviderStore.getState();
  const activeModelInfo = providerStore.models.find((m) => m.id === options.model);
  const activeProviderInfo = providerStore.providers.find((p) => p.id === providerId);
  const activeModelName = activeModelInfo?.name;
  const activeProviderName = activeProviderInfo?.name;

  const roundMessagesContext = {
    memoryPack: memoryPack ?? null,
    conversation,
    resolvedUserPrompt: resolved.userPrompt,
    resolvedReservedOutputTokens: resolved.reservedOutputTokens,
    activeModelName,
    activeProviderName,
    documentInstructionsBlock,
    contextAnchoringBlock,
    projectPromptBlock,
    skillContextBlock,
    resolvedContextLength: resolved.contextLength,
  };

  let accumulatedContent = "";
  const wrappedOnChunk = (content: string, done: boolean) => {
    accumulatedContent += content;
    options.onChunk(content, done);
  };

  const wrappedOnReasoningChunk = options.onReasoningChunk
    ? (content: string, done: boolean) => {
        if (!resolved.reasoningEnabled) return;
        options.onReasoningChunk?.(content, done);
      }
    : undefined;

  let toolCompletion: Promise<void> = Promise.resolve();

  const handleToolCallDetected = (call: Pick<ProviderToolCall, "id" | "name">) => {
    registerStreamingToolCall(call, "pending");
  };

  const finalizeToUser = (
    result: LmChatCompleteResult,
    webSearchSources: WebSearchSource[],
  ) => {
    const chatStore = useChatStore.getState();
    const bufferScratchpad = chatStore.streamingBuffer?.scratchpadContent;
    if (webSearchSources.length > 0) {
      chatStore.completeStreamingWebSearchRounds();
    }
    chatStore.clearStreamingBufferUnlessSkipped();
    userOnComplete?.(result, {
      memoryPack,
      memoryRetrieval,
      webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
      scratchpadContent: bufferScratchpad,
    });
    chatStore.resetAfterRePrompt();
  };

  const buildRoundMessagesBound = (
    chainMessages: ChatMessage[],
    webSearchContextBlocks: string[],
  ) => buildRoundMessages(chainMessages, webSearchContextBlocks, roundMessagesContext);

  const providerChatBaseBound = () =>
    buildProviderChatBase(options, resolved, providerTools, handleToolCallDetected);

  const modelSupportsImages = activeModelInfo?.supportsImages ?? false;

  const retryDocMutationWithLLM = async (
    assistantContent: string,
    errorMessage: string,
  ): Promise<ProviderToolCall[]> => {
    let retryToolCalls: ProviderToolCall[] = [];
    const retryMessages = buildRoundMessagesBound(
      [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent || accumulatedContent,
          timestamp: Date.now(),
          modelId: options.model,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: `Your previous document tool call failed. Failure reason: ${errorMessage}. Retry by calling exactly one corrected document tool. Do not answer in prose.`,
          timestamp: Date.now(),
        },
      ],
      [],
    );
    await provider.sendChat({
      ...providerChatBaseBound(),
      onChunk: () => {},
      onReasoningChunk: () => {},
      onComplete: (nextResult) => {
        retryToolCalls = nextResult.toolCalls ?? [];
      },
      messages: modelSupportsImages ? retryMessages : stripImageAttachments(retryMessages),
    });
    return retryToolCalls;
  };

  const executeToolRoundLocal = createExecuteToolRoundLocal({
    signal: options.signal,
    projectId,
    conversationId,
    studioMode: studioContextMode,
    effectiveWebSearchEnabled,
    webSearchAvailability,
    retryDocMutationWithLLM,
    conversationIdForDocMutation: conversationId,
  });

  const rePromptWithToolsBound = (
    chainMessages: ChatMessage[],
    round: number,
    accumulatedSearchSources: WebSearchSource[],
    accumulatedContextBlocks: string[],
  ) =>
    rePromptWithTools({
      provider,
      providerChatBase: providerChatBaseBound,
      chainMessages,
      round,
      accumulatedSearchSources,
      accumulatedContextBlocks,
      accumulatedContent,
      enhancedMode,
      signal: options.signal,
      model: options.model,
      modelSupportsImages,
      onChunk: options.onChunk,
      onReasoningChunk: wrappedOnReasoningChunk,
      onError: options.onError,
      finalizeToUser,
      roundMessagesContext,
      executeToolRoundLocal,
    });

  const wrappedOnComplete: ProviderChatOptions["onComplete"] = (result) => {
    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      userOnComplete?.(result, { memoryPack, memoryRetrieval });
      return;
    }

    useChatStore.getState().skipNextBufferClear();

    toolCompletion = (async () => {
      try {
        if (options.signal?.aborted) return;

        const exec = await executeToolRoundLocal(toolCalls);
        for (const chunk of exec.streamedChunks) {
          accumulatedContent = accumulatedContent
            ? `${accumulatedContent}\n\n${chunk}`
            : chunk;
          options.onChunk(chunk, false);
        }

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: accumulatedContent,
          timestamp: Date.now(),
          modelId: options.model,
        };
        const toolUserMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: formatToolResultsMessage(exec.toolResultSections),
          timestamp: Date.now(),
        };
        const chain = [...messages, assistantMsg, toolUserMsg];

        await rePromptWithToolsBound(
          chain,
          1,
          exec.webSearchSources,
          exec.webSearchContextBlocks,
        );
      } catch (error) {
        if (options.signal?.aborted) return;
        console.error("[chat-orchestrator] Tool round failed:", error);
        const message = error instanceof Error ? error.message : String(error);
        options.onError(message);
        useChatStore.getState().clearStreamingBufferUnlessSkipped();
        userOnComplete?.(result, { memoryPack, memoryRetrieval });
        useChatStore.getState().resetAfterRePrompt();
      }
    })();
  };

  const contextMessages = buildChatContext(
    messages,
    {
      memoryPack: memoryPack ?? null,
      conversationSummary: conversation?.conversationSummary,
      summaryCoversMessageCount: conversation?.summaryCoversMessageCount,
      contextAnchoringBlock,
      documentInstructionsBlock,
      projectPromptBlock,
      skillContextBlock,
      userPrompt: resolved.userPrompt,
      reservedOutputTokens: resolved.reservedOutputTokens,
      modelName: activeModelName,
      providerName: activeProviderName,
      characterBlock: resolveCharacterBlock(conversation, messages),
    },
    resolved.contextLength,
  );

  await provider.sendChat({
    ...options,
    temperature: options.temperature ?? settings.getModelSettings(options.model).temperature,
    contextLength: resolved.contextLength,
    maxTokens: resolved.maxTokens || undefined,
    topP: resolved.topP,
    repetitionPenalty: resolved.repetitionPenalty,
    stopSequences: resolved.stopSequences,
    tools: providerTools,
    toolChoice: providerTools.length > 0 ? "auto" : "none",
    onChunk: wrappedOnChunk,
    onReasoningChunk: wrappedOnReasoningChunk,
    reasoningEnabled: resolved.reasoningEnabled,
    onToolCallDetected: handleToolCallDetected,
    onComplete: wrappedOnComplete,
    messages: modelSupportsImages ? contextMessages : stripImageAttachments(contextMessages),
  });
  await toolCompletion;
}
