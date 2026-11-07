import { create } from "zustand";
import type { Conversation, ModelLoadProgress } from "@/modules/chat/chat-types";
import { artifactByteLength, MAX_ARTIFACT_BYTES, normalizeArtifact } from "@/modules/chat/artifact";
import { loadConversationSnapshot, saveConversationSnapshot } from "@/lib/conversation-storage";
import { normalizeAttachment } from "@/lib/message-attachments";
import { notifyMemoryDeletion } from "@/modules/memory/memory-lifecycle";

/**
 * Conversation index over the Pi session log.
 *
 * The transcript itself is owned by `agent-store` (Pi events) and mirrored here
 * by `modules/agents/pi-conversation-storage.ts`, which is the only writer of
 * this collection. This store exposes what the shell needs: the ordered list,
 * the active id, hydration state, and the small set of edits that belong to a
 * conversation rather than to a session (title, project scope, artifact text).
 */

type ConversationHydrationState = "loading" | "ready";

type ChatStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
  hydrationState: ConversationHydrationState;
  modelLoadProgress: ModelLoadProgress;
  hydrateConversations: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  moveConversation: (id: string, projectId?: string) => void;
  clearProject: (projectId: string) => void;
  deleteConversation: (id: string) => void;
  deleteAllConversations: () => void;
  renameConversation: (id: string, title: string) => void;
  setConversationSummary: (id: string, summary: string, coversMessageCount: number) => void;
  updateAssistantDocument: (messageId: string, title: string, content: string) => boolean;
  setModelLoadProgress: (progress: ModelLoadProgress) => void;
};

let hydratePromise: Promise<void> | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  hydrationState: "loading",
  modelLoadProgress: null,
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
  moveConversation: (id, projectId) => set((state) => {
    const conversations = state.conversations.map((conversation) => conversation.id === id ? { ...conversation, projectId, agentSession: conversation.agentSession ? { ...conversation.agentSession, projectId } : undefined } : conversation);
    void saveConversationSnapshot(conversations);
    return { conversations };
  }),
  clearProject: (projectId) => set((state) => {
    const conversations = state.conversations.map((conversation) => conversation.projectId === projectId ? { ...conversation, projectId: undefined, agentSession: conversation.agentSession ? { ...conversation.agentSession, projectId: undefined } : undefined } : conversation);
    void saveConversationSnapshot(conversations);
    return { conversations };
  }),
  deleteConversation: (id) => {
    notifyMemoryDeletion({ sourceType: "chat", sourceId: id });
    set((state) => {
      const conversations = state.conversations.filter((conversation) => conversation.id !== id);
      void saveConversationSnapshot(conversations);
      return {
        conversations,
        activeConversationId:
          state.activeConversationId === id ? conversations[0]?.id ?? null : state.activeConversationId,
      };
    });
  },
  deleteAllConversations: () => {
    for (const conversation of get().conversations) {
      notifyMemoryDeletion({ sourceType: "chat", sourceId: conversation.id });
    }
    void saveConversationSnapshot([]);
    set({ conversations: [], activeConversationId: null });
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
  setModelLoadProgress: (progress) => set({ modelLoadProgress: progress }),
}));
