import type { ChatMessage } from "@/modules/chat/chat-types";
import type { SendChatCompleteContext } from "@/modules/chat/chat-orchestrator";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import { summarizeInteractiveAnswer } from "@/modules/chat/interactive-answer";
import { summarizeArtifact } from "@/modules/chat/artifact";
import { buildMemoryReferenceBlock } from "@/lib/prompts";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";

function getAssistantVisibleText(message: ChatMessage | undefined): string {
  const content = message?.content?.trim();
  return content || (message?.artifact ? summarizeArtifact(message.artifact) : "") || (message?.interactiveAnswer ? summarizeInteractiveAnswer(message.interactiveAnswer) : "") || message?.reasoning?.trim() || "";
}

/** Memory extraction must never use reasoning traces or hidden model state. */
function getAssistantMemoryText(message: ChatMessage | undefined): string {
  const content = message?.content?.trim();
  if (content) return content;
  if (message?.artifact) return summarizeArtifact(message.artifact).trim();
  if (message?.interactiveAnswer) return summarizeInteractiveAnswer(message.interactiveAnswer).trim();
  return "";
}

type ChatSendParams = {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  trimmed: string;
  previousResponseId?: string;
  selectedProvider: string;
  selectedModel: string;
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode: boolean;
  projectId?: string;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
  onReasoningChunk: (chunk: string) => void;
  onModelLoadProgress?: (phase: string, percent?: number) => void;
  onError: (error: string) => void;
  onComplete: (result: LmChatCompleteResult, context: SendChatCompleteContext) => void;
};

/** Lazy-loaded chat pipeline — keeps heavy modules off the startup graph. */
export async function executeChatSend(params: ChatSendParams): Promise<string | undefined> {
  const [
    { sendChatRequest },
    { handoffAfterUserChat, queuePostChatJobs },
    { prepareProviderModel },
    { retrieveMemoryContext, queueMemoryExtraction },
  ] = await Promise.all([
    import("@/modules/chat/chat-orchestrator"),
    import("@/lib/post-chat-jobs"),
    import("@/lib/providers"),
    import("@/modules/memory/memory-service"),
  ]);

  const {
    conversationId,
    userMessage,
    assistantMessage,
    trimmed,
    previousResponseId,
    selectedProvider,
    selectedModel,
    webSearchEnabled,
    codeExecutionEnabled,
    enhancedMode,
    projectId,
    signal,
    onChunk,
    onReasoningChunk,
    onModelLoadProgress,
    onError,
    onComplete,
  } = params;

  const liveConversation = useChatStore
    .getState()
    .conversations.find((item) => item.id === conversationId);
  // Capture scope before any async work so navigation cannot change it mid-turn.
  const scopeProjectId = projectId || liveConversation?.projectId || undefined;
  const turnId = userMessage.id;
  const userText = trimmed;
  let memoryContextBlock: string | undefined;

  await Promise.all([
    prepareProviderModel(selectedProvider, selectedModel, {
      signal,
      onProgress: onModelLoadProgress,
    }),
    (async () => {
      if (signal.aborted) return;
      try {
        const retrieved = await retrieveMemoryContext({
          query: userText,
          projectId: scopeProjectId,
          signal,
        });
        memoryContextBlock = buildMemoryReferenceBlock(retrieved.block) || undefined;
      } catch {
        // Memory is optional context. A retrieval failure must not block the turn.
      }
    })(),
  ]);

  if (signal.aborted) return undefined;

  const userMessageIndex =
    liveConversation?.messages.findIndex((message) => message.id === userMessage.id) ?? -1;
  const messages =
    userMessageIndex >= 0 && liveConversation
      ? liveConversation.messages
          .slice(0, userMessageIndex + 1)
          .filter(
            (message) =>
              message.role !== "assistant" || getAssistantVisibleText(message).trim(),
          )
          .map((message) => {
            const { artifact, artifactReplacement: _artifactReplacement, ...providerMessage } = message;
            if (
              message.role === "assistant" &&
              !message.content.trim() &&
              message.interactiveAnswer
            ) {
              return {
                ...providerMessage,
                content: summarizeInteractiveAnswer(message.interactiveAnswer),
              };
            }
            if (message.role === "assistant" && !message.content.trim() && artifact) {
              return { ...providerMessage, content: summarizeArtifact(artifact) };
            }
            return providerMessage;
          })
      : [userMessage];

  let turnSucceeded = false;
  let turnFailed = false;

  await sendChatRequest({
    providerId: selectedProvider,
    messages,
    model: selectedModel,
    assistantMessageId: assistantMessage.id,
    previousResponseId,
    signal,
    webSearchEnabled,
    codeExecutionEnabled,
    enhancedMode,
    conversationId,
    projectId: scopeProjectId,
    memoryContextBlock,
    onChunk,
    onReasoningChunk,
    onError: (error) => {
      turnFailed = true;
      onError(error);
    },
    onComplete: (result, context) => {
      onComplete(result, context);
      turnSucceeded = true;
    },
    onModelLoadProgress,
  });

  const chatModel = selectedModel.trim();
  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  const assistantMsg = conv?.messages.find((m) => m.id === assistantMessage.id);
  const assistantText = getAssistantVisibleText(assistantMsg);
  const userMsgCount = conv?.messages.filter((m) => m.role === "user").length ?? 0;

  if (chatModel && assistantText) {
    const isFirstExchange = userMsgCount <= 1;
    await handoffAfterUserChat({
      chatModel,
      conversationId,
      isFirstExchange,
      signal,
    });

    queuePostChatJobs({
      conversationId,
      chatModel,
      providerId: selectedProvider,
      userMessage: trimmed,
      assistantMessage: assistantText,
      assistantMessageId: assistantMessage.id,
      isFirstExchange,
    });
  }

  if (turnSucceeded && !turnFailed && !signal.aborted && userText) {
    const assistantMemoryText = getAssistantMemoryText(assistantMsg);
    if (assistantMemoryText) {
      try {
        queueMemoryExtraction({
          sourceType: "chat",
          sourceId: conversationId,
          turnId,
          userText,
          assistantText: assistantMemoryText,
          projectId: scopeProjectId,
          model: selectedModel,
          providerId: selectedProvider,
        });
      } catch {
        // Memory extraction is best-effort and never changes chat behavior.
      }
    }
  }

  return assistantText || undefined;
}

export async function ensureProviderReady(): Promise<void> {
  await useProviderStore.getState().ensureProviderReady();
}
