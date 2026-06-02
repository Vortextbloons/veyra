import { create } from "zustand";
import type { ChatMessage, Conversation, WebSearchState } from "@/lib/chat-types";
import { loadConversationSnapshot, saveConversationSnapshot } from "@/lib/conversation-storage";

export type ConversationHydrationState = "loading" | "ready";

type StreamingBuffer = {
  conversationId: string;
  messageId: string;
  content: string;
  reasoning: string;
  webSearchState?: WebSearchState;
} | null;

type ChatStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
  hydrationState: ConversationHydrationState;
  streamingBuffer: StreamingBuffer;
  hydrateConversations: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  deleteAllConversations: () => void;
  addMessagePair: (
    conversationId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    options?: { deferTitle?: boolean },
  ) => void;
  appendStreamingContent: (conversationId: string, messageId: string, chunk: string) => void;
  appendStreamingReasoning: (conversationId: string, messageId: string, chunk: string) => void;
  clearStreamingBuffer: () => void;
  clearStreamingBufferUnlessSkipped: () => void;
  isBufferClearSkipped: () => boolean;
  skipNextBufferClear: () => void;
  resetAfterRePrompt: () => void;
  setStreamingBufferContent: (content: string) => void;
  setStreamingWebSearchState: (state: WebSearchState) => void;
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
  markMemoryPending: (id: string, pendingSince?: number) => void;
  setMemoryProcessed: (id: string, processedMessageCount: number) => void;
};

function newConversation(): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

let hydratePromise: Promise<void> | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  hydrationState: "loading",
  streamingBuffer: null,
  _skipNextClear: false,
  hydrateConversations: async () => {
    if (get().hydrationState === "ready") return;
    hydratePromise ??= (async () => {
      const conversations = await loadConversationSnapshot();
      set({
        conversations,
        activeConversationId: conversations[0]?.id ?? null,
        hydrationState: "ready",
      });
    })().finally(() => {
      hydratePromise = null;
    });
    await hydratePromise;
  },
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  createConversation: () => {
    const conversation = newConversation();
    set((state) => {
      const conversations = [conversation, ...state.conversations];
      void saveConversationSnapshot(conversations);
      return { conversations, activeConversationId: conversation.id };
    });
    return conversation.id;
  },
  deleteConversation: (id) => {
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
        return {
          ...conversation,
          title: isFirstUser ? provisionalTitle : conversation.title,
          messages: [...conversation.messages, userMessage, assistantMessage],
          updatedAt: Date.now(),
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
  appendStreamingContent: (conversationId, messageId, chunk) => {
    set((state) => {
      const current = state.streamingBuffer;
      if (!current || current.conversationId !== conversationId || current.messageId !== messageId) {
        return {
          streamingBuffer: { conversationId, messageId, content: chunk, reasoning: "" },
        };
      }
      return { streamingBuffer: { ...current, content: current.content + chunk } };
    });
  },
  appendStreamingReasoning: (conversationId, messageId, chunk) => {
    set((state) => {
      const current = state.streamingBuffer;
      if (!current || current.conversationId !== conversationId || current.messageId !== messageId) {
        return {
          streamingBuffer: { conversationId, messageId, content: "", reasoning: chunk },
        };
      }
      return { streamingBuffer: { ...current, reasoning: current.reasoning + chunk } };
    });
  },
  clearStreamingBuffer: () => set({ streamingBuffer: null, _skipNextClear: false }),
  clearStreamingBufferUnlessSkipped: () => {
    if (get()._skipNextClear) {
      set({ _skipNextClear: false });
      return;
    }
    set({ streamingBuffer: null });
  },
  isBufferClearSkipped: () => get()._skipNextClear,
  skipNextBufferClear: () => set({ _skipNextClear: true }),
  resetAfterRePrompt: () => set({ streamingBuffer: null, _skipNextClear: false }),
  setStreamingBufferContent: (content) => {
    set((state) => {
      if (!state.streamingBuffer) return state;
      return { streamingBuffer: { ...state.streamingBuffer, content } };
    });
  },
  setStreamingWebSearchState: (webSearchState) => {
    set((state) => {
      if (!state.streamingBuffer) return state;
      return { streamingBuffer: { ...state.streamingBuffer, webSearchState } };
    });
  },
  commitAssistantMessage: (conversationId, messageId, patch = {}) => {
    set((state) => {
      const buffer =
        state.streamingBuffer?.conversationId === conversationId &&
        state.streamingBuffer.messageId === messageId
          ? state.streamingBuffer
          : null;
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
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
                }
              : message,
          ),
          updatedAt: Date.now(),
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
  markMemoryPending: (id, pendingSince = Date.now()) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              memoryPendingSince: conversation.memoryPendingSince ?? pendingSince,
            }
          : conversation,
      );
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  setMemoryProcessed: (id, processedMessageCount) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              memoryLastProcessedMessageCount: processedMessageCount,
              memoryPendingSince: undefined,
              updatedAt: Date.now(),
            }
          : conversation,
      );
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
}));
