import { create } from "zustand";
import type { ChatMessage, Conversation, ModelLoadProgress, ToolCallState, WebSearchRound, WebSearchState } from "@/modules/chat/chat-types";
import type { InteractiveAnswer } from "@/modules/chat/interactive-answer";
import { MAX_INTERACTIVE_ANSWER_CHARS } from "@/modules/chat/interactive-answer";
import type { Artifact } from "@/modules/chat/artifact";
import { artifactByteLength, MAX_ARTIFACT_BYTES, normalizeArtifact } from "@/modules/chat/artifact";
import { loadConversationSnapshot, saveConversationSnapshot } from "@/lib/conversation-storage";
import { normalizeAttachment } from "@/lib/message-attachments";
import { abortPendingQuestion } from "@/modules/chat/pending-question-registry";
import { notifyMemoryDeletion } from "@/modules/memory/memory-lifecycle";

type ConversationHydrationState = "loading" | "ready";

type StreamingBuffer = {
  conversationId: string;
  messageId: string;
  content: string;
  reasoning: string;
  webSearchState?: WebSearchState;
  toolStates?: ToolCallState[];
  scratchpadContent?: string;
  pendingQuestion?: {
    toolCallId: string;
    questions: Array<{ text: string; options?: string[] }>;
    answers: Record<number, string>;
  };
} | null;

type ChatStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
  hydrationState: ConversationHydrationState;
  streamingBuffer: StreamingBuffer;
  modelLoadProgress: ModelLoadProgress;
  _skipNextClear: boolean;
  hydrateConversations: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  createConversation: (projectId?: string) => string;
  deleteConversation: (id: string) => void;
  deleteAllConversations: () => void;
  addMessagePair: (
    conversationId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    options?: { deferTitle?: boolean },
  ) => void;
  appendAssistantMessage: (conversationId: string, assistantMessage: ChatMessage) => void;
  appendStreamingContent: (conversationId: string, messageId: string, chunk: string) => void;
  appendStreamingReasoning: (conversationId: string, messageId: string, chunk: string) => void;
  clearStreamingBuffer: () => void;
  clearStreamingBufferUnlessSkipped: () => void;
  isBufferClearSkipped: () => boolean;
  skipNextBufferClear: () => void;
  resetAfterRePrompt: () => void;
  setModelLoadProgress: (progress: ModelLoadProgress) => void;
  upsertStreamingWebSearchRound: (round: WebSearchRound) => void;
  completeStreamingWebSearchRounds: () => void;
  setStreamingToolState: (state: ToolCallState) => void;
  setAssistantToolState: (conversationId: string, messageId: string, state: ToolCallState) => boolean;
  setAssistantInteractiveAnswer: (
    conversationId: string,
    messageId: string,
    answer: InteractiveAnswer,
  ) => boolean;
  setAssistantArtifact: (conversationId: string, messageId: string, artifact: Artifact) => boolean;
  updateAssistantDocument: (messageId: string, title: string, content: string) => boolean;
  updateToolCallState: (toolCallId: string, patch: Partial<ToolCallState>) => void;
  appendToScratchpad: (conversationId: string, messageId: string, content: string) => void;
  setPendingQuestion: (question: { toolCallId: string; questions: Array<{ text: string; options?: string[] }>; answers: Record<number, string> } | null) => void;
  commitAssistantMessage: (
    conversationId: string,
    messageId: string,
    patch?: Partial<ChatMessage> & { lmResponseId?: string },
  ) => void;
  renameConversation: (id: string, title: string) => void;
  setConversationSummary: (
    id: string,
    summary: string,
    coversMessageCount: number,
  ) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  truncateAfterMessage: (conversationId: string, messageId: string) => void;
  removeLastMessagePair: (conversationId: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  forkConversation: (conversationId: string, upToMessageId: string) => string;
};

type SetChatStore = (
  partial: Partial<ChatStore> | ((state: ChatStore) => Partial<ChatStore>),
) => void;
let pendingStreamTarget: { conversationId: string; messageId: string } | null = null;
let pendingContent = "";
let pendingReasoning = "";
let pendingStreamTimer: number | null = null;

function flushPendingStreaming(set: SetChatStore): void {
  if (pendingStreamTimer != null) {
    window.clearTimeout(pendingStreamTimer);
    pendingStreamTimer = null;
  }
  if (!pendingStreamTarget || (!pendingContent && !pendingReasoning)) return;

  const target = pendingStreamTarget;
  const content = pendingContent;
  const reasoning = pendingReasoning;
  pendingStreamTarget = null;
  pendingContent = "";
  pendingReasoning = "";

  set((state) => {
    const current = state.streamingBuffer;
    if (!current || current.conversationId !== target.conversationId || current.messageId !== target.messageId) {
      return {
        streamingBuffer: {
          conversationId: target.conversationId,
          messageId: target.messageId,
          content,
          reasoning,
        },
      };
    }
    return {
      streamingBuffer: {
        ...current,
        content: current.content + content,
        reasoning: current.reasoning + reasoning,
      },
    };
  });
}

function queueStreamingChunk(
  set: SetChatStore,
  conversationId: string,
  messageId: string,
  chunk: string,
  field: "content" | "reasoning",
): void {
  if (!chunk) return;
  if (
    pendingStreamTarget &&
    (pendingStreamTarget.conversationId !== conversationId || pendingStreamTarget.messageId !== messageId)
  ) {
    flushPendingStreaming(set);
  }

  pendingStreamTarget = { conversationId, messageId };
  if (field === "content") pendingContent += chunk;
  else pendingReasoning += chunk;

  if (pendingStreamTimer == null) {
    pendingStreamTimer = window.setTimeout(() => flushPendingStreaming(set), 16);
  }
}

function newConversation(projectId?: string): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
    projectId,
  };
}

let hydratePromise: Promise<void> | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  hydrationState: "loading",
  streamingBuffer: null,
  modelLoadProgress: null,
  _skipNextClear: false,
  hydrateConversations: async () => {
    if (get().hydrationState === "ready") return;
    hydratePromise ??= (async () => {
      let conversations: Conversation[];
      try {
        conversations = await loadConversationSnapshot();
      } catch {
        // The storage layer surfaces a persistent banner and blocks writes so
        // recovery data cannot be overwritten. Keep the rest of the app usable.
        conversations = [];
      }
      const normalized: Conversation[] = conversations.map((conv) => ({
        ...conv,
        messages: conv.messages.map((msg) => ({
          ...msg,
          attachments: msg.attachments?.map(normalizeAttachment),
        })),
      }));
      set({
        conversations: normalized,
        activeConversationId: normalized[0]?.id ?? null,
        hydrationState: "ready",
      });
    })().finally(() => {
      hydratePromise = null;
    });
    await hydratePromise;
  },
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  createConversation: (projectId?: string) => {
    const conversation = newConversation(projectId);
    set((state) => {
      const conversations = [conversation, ...state.conversations];
      void saveConversationSnapshot(conversations);
      return { conversations, activeConversationId: conversation.id };
    });
    return conversation.id;
  },
  deleteConversation: (id) => {
    notifyMemoryDeletion({ sourceType: "chat", sourceId: id });
    set((state) => {
      const conversations = state.conversations.filter((conversation) => conversation.id !== id);
      void saveConversationSnapshot(conversations);
      return {
        conversations,
        activeConversationId:
          state.activeConversationId === id ? conversations[0]?.id ?? null : state.activeConversationId,
        streamingBuffer:
          state.streamingBuffer?.conversationId === id ? null : state.streamingBuffer,
      };
    });
  },
  deleteAllConversations: () => {
    for (const conversation of get().conversations) {
      notifyMemoryDeletion({ sourceType: "chat", sourceId: conversation.id });
    }
    void saveConversationSnapshot([]);
    set({ conversations: [], activeConversationId: null, streamingBuffer: null });
  },
  addMessagePair: (conversationId, userMessage, assistantMessage, options) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const isFirstUser = conversation.messages.every((message) => message.role !== "user");
        const provisionalTitle = options?.deferTitle
          ? "New conversation"
          : (userMessage.content.trim() ||
              userMessage.attachments?.[0]?.name ||
              "Image message").slice(0, 50);
        const now = Date.now();
        return {
          ...conversation,
          title: isFirstUser ? provisionalTitle : conversation.title,
          messages: [...conversation.messages, userMessage, assistantMessage],
          updatedAt: now,
        };
      });
      void saveConversationSnapshot(conversations);
      return {
        conversations,
        streamingBuffer: {
          conversationId,
          messageId: assistantMessage.id,
          content: "",
          reasoning: "",
        },
      };
    });
  },
  appendAssistantMessage: (conversationId, assistantMessage) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: [...conversation.messages, assistantMessage],
              updatedAt: Date.now(),
            }
          : conversation,
      );
      void saveConversationSnapshot(conversations);
      return {
        conversations,
        streamingBuffer: {
          conversationId,
          messageId: assistantMessage.id,
          content: "",
          reasoning: "",
        },
      };
    });
  },
  appendStreamingContent: (conversationId, messageId, chunk) => {
    queueStreamingChunk(set, conversationId, messageId, chunk, "content");
  },
  appendStreamingReasoning: (conversationId, messageId, chunk) => {
    queueStreamingChunk(set, conversationId, messageId, chunk, "reasoning");
  },
  clearStreamingBuffer: () => {
    abortPendingQuestion();
    flushPendingStreaming(set);
    set({ streamingBuffer: null, _skipNextClear: false });
  },
  clearStreamingBufferUnlessSkipped: () => {
    if (get()._skipNextClear) {
      set({ _skipNextClear: false });
      return;
    }
    abortPendingQuestion();
    flushPendingStreaming(set);
    set({ streamingBuffer: null });
  },
  isBufferClearSkipped: () => get()._skipNextClear,
  skipNextBufferClear: () => set({ _skipNextClear: true }),
  resetAfterRePrompt: () => {
    abortPendingQuestion();
    flushPendingStreaming(set);
    set({ streamingBuffer: null, _skipNextClear: false });
  },
  setModelLoadProgress: (progress) => set({ modelLoadProgress: progress }),
  upsertStreamingWebSearchRound: (round) => {
    set((state) => {
      const buffer = state.streamingBuffer;
      if (!buffer) return state;
      const existing = buffer.webSearchState?.rounds ?? [];
      const rounds = existing.some((item) => item.id === round.id)
        ? existing.map((item) => (item.id === round.id ? { ...item, ...round } : item))
        : [...existing, round];
      return {
        streamingBuffer: {
          ...buffer,
          webSearchState: { rounds },
        },
      };
    });
  },
  completeStreamingWebSearchRounds: () => {
    set((state) => {
      const buffer = state.streamingBuffer;
      if (!buffer?.webSearchState?.rounds?.length) return state;
      return {
        streamingBuffer: {
          ...buffer,
          webSearchState: {
            rounds: buffer.webSearchState.rounds.map((round) => ({
              ...round,
              phase: round.phase === "error" ? "error" : "done",
            })),
          },
        },
      };
    });
  },
  setStreamingToolState: (toolState) => {
    set((state) => {
      const buffer = state.streamingBuffer;
      if (!buffer) return state;
      const existing = buffer.toolStates ?? [];
      const next = existing.some((item) => item.id === toolState.id)
        ? existing.map((item) => item.id === toolState.id ? { ...item, ...toolState } : item)
        : [...existing, toolState];
      return { streamingBuffer: { ...buffer, toolStates: next } };
    });
  },
  setAssistantToolState: (conversationId, messageId, toolState) => {
    let updated = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const messages = conversation.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") return message;
          const existing = message.toolStates ?? [];
          const toolStates = existing.some((item) => item.id === toolState.id)
            ? existing.map((item) => item.id === toolState.id ? { ...item, ...toolState } : item)
            : [...existing, toolState];
          updated = true;
          return { ...message, toolStates };
        });
        return updated ? { ...conversation, messages, updatedAt: Date.now() } : conversation;
      });
      if (!updated) return state;
      let streamingBuffer = state.streamingBuffer;
      if (
        streamingBuffer?.conversationId === conversationId &&
        streamingBuffer.messageId === messageId
      ) {
        const existing = streamingBuffer.toolStates ?? [];
        const toolStates = existing.some((item) => item.id === toolState.id)
          ? existing.map((item) => item.id === toolState.id ? { ...item, ...toolState } : item)
          : [...existing, toolState];
        streamingBuffer = { ...streamingBuffer, toolStates };
      }
      void saveConversationSnapshot(conversations);
      return { conversations, streamingBuffer };
    });
    return updated;
  },
  setAssistantInteractiveAnswer: (conversationId, messageId, answer) => {
    if (answer.version !== 1 || JSON.stringify(answer).length > MAX_INTERACTIVE_ANSWER_CHARS) {
      return false;
    }
    let updated = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const messages = conversation.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") return message;
          updated = true;
          return { ...message, interactiveAnswer: answer };
        });
        return updated ? { ...conversation, messages, updatedAt: Date.now() } : conversation;
      });
      if (!updated) return state;
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
    return updated;
  },
  setAssistantArtifact: (conversationId, messageId, artifact) => {
    if (artifactByteLength(artifact.content) > MAX_ARTIFACT_BYTES) return false;
    let updated = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        let conversationUpdated = false;
        let replacement: ChatMessage["artifactReplacement"];
        const messages = conversation.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant" || message.artifact) return message;
          updated = conversationUpdated = true;
          replacement = message.artifactReplacement;
          const { artifactReplacement: _artifactReplacement, ...storedMessage } = message;
          return { ...storedMessage, artifact };
        });
        if (!conversationUpdated) return conversation;

        const replacementTarget = replacement;
        const oldUserIndex = replacementTarget
          ? conversation.messages.findIndex((message) => message.id === replacementTarget.userMessageId)
          : -1;
        const oldAssistant = oldUserIndex >= 0 ? conversation.messages[oldUserIndex + 1] : undefined;
        const committedMessages = replacementTarget &&
          oldAssistant?.id === replacementTarget.assistantMessageId &&
          oldAssistant.role === "assistant" &&
          oldAssistant.artifact
          ? messages.filter((message) => message.id !== replacementTarget.userMessageId && message.id !== replacementTarget.assistantMessageId)
          : messages;
        return { ...conversation, messages: committedMessages, updatedAt: Date.now() };
      });
      if (!updated) return state;
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
    return updated;
  },
  updateAssistantDocument: (messageId, title, content) => {
    if (artifactByteLength(content) > MAX_ARTIFACT_BYTES) return false;
    let updated = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        let conversationUpdated = false;
        const messages = conversation.messages.map((message) => {
          const existing = message.artifact;
          if (message.id !== messageId || message.role !== "assistant" || existing?.format !== "document") return message;
          const normalized = normalizeArtifact({ ...existing, title, content }, existing.id, existing.createdAt);
          if (!normalized.ok) return message;
          updated = conversationUpdated = true;
          return { ...message, artifact: normalized.artifact };
        });
        return conversationUpdated ? { ...conversation, messages, updatedAt: Date.now() } : conversation;
      });
      if (!updated) return state;
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
    return updated;
  },
  updateToolCallState: (toolCallId, patch) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({
          ...message,
          toolStates: message.toolStates?.map((toolState) =>
            toolState.id === toolCallId ? { ...toolState, ...patch } : toolState,
          ),
        })),
      }));
      void saveConversationSnapshot(conversations);
      const buffer = state.streamingBuffer;
      const toolStates = buffer?.toolStates?.map((toolState) =>
        toolState.id === toolCallId ? { ...toolState, ...patch } : toolState,
      );
      return {
        conversations,
        streamingBuffer: buffer && toolStates ? { ...buffer, toolStates } : buffer,
      };
    });
  },
  appendToScratchpad: (conversationId, messageId, content) => {
    set((state) => {
      const buffer = state.streamingBuffer;
      if (!buffer || buffer.conversationId !== conversationId || buffer.messageId !== messageId) return state;
      const existing = buffer.scratchpadContent ?? "";
      const separator = existing ? "\n\n" : "";
      return { streamingBuffer: { ...buffer, scratchpadContent: existing + separator + content } };
    });
  },
  setPendingQuestion: (question) => {
    set((state) => {
      const buffer = state.streamingBuffer;
      if (!buffer) return state;
      return { streamingBuffer: { ...buffer, pendingQuestion: question ?? undefined } };
    });
  },
  commitAssistantMessage: (conversationId, messageId, patch = {}) => {
    flushPendingStreaming(set);
    set((state) => {
      const buffer =
        state.streamingBuffer?.conversationId === conversationId &&
        state.streamingBuffer.messageId === messageId
          ? state.streamingBuffer
          : null;
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const now = Date.now();
        return {
          ...conversation,
          lmResponseId: patch.lmResponseId ?? conversation.lmResponseId,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  ...patch,
                  content: patch.content ?? buffer?.content ?? message.content,
                  reasoning: patch.reasoning ?? buffer?.reasoning ?? message.reasoning,
                  webSearchState: patch.webSearchState ?? buffer?.webSearchState ?? message.webSearchState,
                  toolStates: patch.toolStates ?? buffer?.toolStates ?? message.toolStates,
                  scratchpadContent: patch.scratchpadContent ?? buffer?.scratchpadContent ?? message.scratchpadContent,
                }
              : message,
          ),
          updatedAt: now,
        };
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  renameConversation: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const limited = trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
    set((state) => {
      const conversations = state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, title: limited } : conversation,
      );
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  setConversationSummary: (id, summary, coversMessageCount) => {
    const trimmed = summary.trim();
    if (!trimmed || coversMessageCount < 1) return;
    set((state) => {
      const conversations = state.conversations.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              conversationSummary: trimmed,
              summaryCoversMessageCount: coversMessageCount,
              updatedAt: Date.now(),
            }
          : conversation,
      );
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  updateMessage: (conversationId, messageId, content) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId ? { ...message, content } : message,
          ),
          updatedAt: Date.now(),
        };
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  truncateAfterMessage: (conversationId, messageId) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const idx = conversation.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return conversation;
        const truncated = conversation.messages.slice(0, idx + 1);
        return {
          ...conversation,
          messages: truncated,
          updatedAt: Date.now(),
        };
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  removeLastMessagePair: (conversationId) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const messages = conversation.messages;
        if (messages.length < 2) return conversation;
        const last = messages[messages.length - 1];
        const secondLast = messages[messages.length - 2];
        const isPair =
          (last.role === "assistant" && secondLast.role === "user") ||
          (last.role === "user" && secondLast.role === "assistant");
        const sliced = isPair ? messages.slice(0, -2) : messages.slice(0, -1);
        return {
          ...conversation,
          messages: sliced,
          updatedAt: Date.now(),
        };
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          messages: conversation.messages.filter((m) => m.id !== messageId),
          updatedAt: Date.now(),
        };
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  forkConversation: (conversationId, upToMessageId) => {
    let newId = "";
    set((state) => {
      const source = state.conversations.find((c) => c.id === conversationId);
      if (!source) return state;
      const idx = source.messages.findIndex((m) => m.id === upToMessageId);
      if (idx < 0) return state;
      const forkedMessages = source.messages.slice(0, idx + 1);
      const now = Date.now();
      const messageIdMap = new Map<string, string>();
      const remappedMessages = forkedMessages.map((message) => {
        const nextId = crypto.randomUUID();
        messageIdMap.set(message.id, nextId);
        return {
          ...message,
          id: nextId,
          timestamp: now,
        };
      });
      const forked: Conversation = {
        id: crypto.randomUUID(),
        title: `${source.title} (fork)`,
        messages: remappedMessages,
        createdAt: now,
        updatedAt: now,
        projectId: source.projectId,
      };
      newId = forked.id;
      const conversations = [forked, ...state.conversations];
      void saveConversationSnapshot(conversations);
      return { conversations, activeConversationId: forked.id };
    });
    return newId;
  },
}));
