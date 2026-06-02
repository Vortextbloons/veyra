import { create } from "zustand";
import type { ChatMessage, Conversation } from "@/lib/chat-types";
import { loadConversationSnapshot, saveConversationSnapshot } from "@/lib/conversation-storage";

const STORAGE_KEY = "veyra.conversations";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

type StreamingBuffer = {
  conversationId: string;
  messageId: string;
  content: string;
  reasoning: string;
} | null;

type ChatStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingBuffer: StreamingBuffer;
  hydrateConversations: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  deleteAllConversations: () => void;
  addMessagePair: (conversationId: string, userMessage: ChatMessage, assistantMessage: ChatMessage) => void;
  appendStreamingContent: (conversationId: string, messageId: string, chunk: string) => void;
  appendStreamingReasoning: (conversationId: string, messageId: string, chunk: string) => void;
  clearStreamingBuffer: () => void;
  commitAssistantMessage: (
    conversationId: string,
    messageId: string,
    patch?: Partial<ChatMessage> & { lmResponseId?: string },
  ) => void;
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

const initialConversations = loadConversations();

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: initialConversations,
  activeConversationId: initialConversations[0]?.id ?? null,
  streamingBuffer: null,
  hydrateConversations: async () => {
    const conversations = await loadConversationSnapshot();
    set({ conversations, activeConversationId: conversations[0]?.id ?? null });
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
  addMessagePair: (conversationId, userMessage, assistantMessage) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const isFirstUser = conversation.messages.every((message) => message.role !== "user");
        return {
          ...conversation,
          title: isFirstUser ? userMessage.content.slice(0, 50) : conversation.title,
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
  clearStreamingBuffer: () => set({ streamingBuffer: null }),
  commitAssistantMessage: (conversationId, messageId, patch = {}) => {
    const buffer = get().streamingBuffer;
    set((state) => {
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
}));
