import { create } from "zustand";
import type { ChatMessage, Conversation, ModelLoadProgress, ToolCallState, WebSearchRound, WebSearchState } from "@/modules/chat/chat-types";
import { loadConversationSnapshot, saveConversationSnapshot } from "@/lib/conversation-storage";
import { normalizeAttachment } from "@/lib/message-attachments";
import { abortPendingQuestion } from "@/modules/chat/pending-question-registry";
import type {
  ConversationExperience,
  StudioResponseRevision,
  StudioResponseStatus,
  StudioValidationIssue,
  StudioScene,
  StudioTransition,
  StudioWorkspaceStatus,
} from "@/modules/chat/studio/studio-types";
import {
  copyStudioResponseForFork,
  normalizeConversationStudio,
  previousStudioResponseRevision,
  resolveConversationExperience,
  trimStudioResponseRevisions,
  trimStudioScenes,
} from "@/modules/chat/studio/studio-normalize";

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
  createConversation: (projectId?: string, options?: { experience?: ConversationExperience }) => string;
  setConversationExperience: (id: string, experience: ConversationExperience) => boolean;
  commitStudioScene: (conversationId: string, assistantMessageId: string, scene: { title: string; html: string; css: string; caption?: string; transition?: StudioTransition }, options?: { pointerSceneIdAtStart?: string }) => StudioScene | null;
  setStudioWorkspaceStatus: (conversationId: string, status: StudioWorkspaceStatus, assistantMessageId?: string, error?: StudioValidationIssue[]) => boolean;
  selectStudioScene: (conversationId: string, sceneId: string) => boolean;
  commitStudioResponseRevision: (conversationId: string, assistantMessageId: string, revision: Omit<StudioResponseRevision, "revision" | "createdAt" | "assistantMessageId">, options?: { pointerRevisionAtStart?: number }) => StudioResponseRevision | null;
  setStudioResponseStatus: (conversationId: string, assistantMessageId: string, status: StudioResponseStatus, error?: StudioValidationIssue[]) => boolean;
  selectStudioResponseRevision: (conversationId: string, assistantMessageId: string, revision: number) => boolean;
  undoStudioResponseRevision: (conversationId: string, assistantMessageId: string) => boolean;
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
  setStreamingWebSearchState: (state: WebSearchState) => void;
  upsertStreamingWebSearchRound: (round: WebSearchRound) => void;
  completeStreamingWebSearchRounds: () => void;
  setStreamingToolState: (state: ToolCallState) => void;
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
  markMemoryPending: (id: string, pendingSince?: number) => void;
  setMemoryProcessed: (id: string, processedMessageCount: number) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  truncateAfterMessage: (conversationId: string, messageId: string) => void;
  removeLastMessagePair: (conversationId: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  forkConversation: (conversationId: string, upToMessageId: string) => string;
  /** Strip the character binding from a conversation (escape hatch). */
  unbindCharacter: (conversationId: string) => void;
  /** Recent conversations bound to a given character id. */
  recentChatsForCharacter: (characterId: string, limit?: number) => Conversation[];
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

function newConversation(
  projectId?: string,
  experience: ConversationExperience = "standard",
): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
    projectId,
    experience,
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
      const normalized: Conversation[] = conversations.map((conv) =>
        normalizeConversationStudio({
          ...conv,
          messages: conv.messages.map((msg) => ({
            ...msg,
            attachments: msg.attachments?.map(normalizeAttachment),
          })),
        }),
      );
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
  createConversation: (projectId?: string, options?: { experience?: ConversationExperience }) => {
    const conversation = newConversation(projectId, options?.experience ?? "standard");
    set((state) => {
      const conversations = [conversation, ...state.conversations];
      void saveConversationSnapshot(conversations);
      return { conversations, activeConversationId: conversation.id };
    });
    return conversation.id;
  },
  setConversationExperience: (id, experience) => {
    let changed = false;
    set((state) => {
      let nextConversations = state.conversations;
      nextConversations = state.conversations.map((conversation) => {
        if (conversation.id !== id) return conversation;
        if (conversation.messages.length > 0) return conversation;
        if (resolveConversationExperience(conversation) === experience) return conversation;
        changed = true;
        return { ...conversation, experience, updatedAt: Date.now() };
      });
      if (!changed) return {};
      void saveConversationSnapshot(nextConversations);
      return { conversations: nextConversations };
    });
    return changed;
  },
  commitStudioScene: (conversationId, assistantMessageId, input, options) => {
    let committed: StudioScene | null = null;
    set((state) => {
      let changed = false;
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || resolveConversationExperience(conversation) !== "studio" || conversation.characterId || conversation.groupId) return conversation;
        const target = conversation.messages.find((message) => message.id === assistantMessageId);
        if (!target || target.role !== "assistant") return conversation;
        const now = Date.now();
        const previous = conversation.studioWorkspace;
        const priorForMessage = [...(previous?.scenes ?? [])].reverse().find((scene) => scene.assistantMessageId === assistantMessageId);
        committed = { ...input, id: crypto.randomUUID(), assistantMessageId, transition: input.transition ?? "fade", lineageId: priorForMessage?.lineageId ?? crypto.randomUUID(), revision: (priorForMessage?.revision ?? 0) + 1, createdAt: now };
        const pointerAtStart = options?.pointerSceneIdAtStart ?? previous?.currentSceneId;
        const currentPointer = previous?.currentSceneId;
        const desiredPointer = currentPointer === pointerAtStart ? committed.id : currentPointer ?? committed.id;
        const scenes = trimStudioScenes([...(previous?.scenes ?? []), committed], desiredPointer);
        const currentSceneId = scenes.some((scene) => scene.id === desiredPointer) ? desiredPointer : committed.id;
        const workspaceId = previous?.id ?? crypto.randomUUID();
        changed = true;
        return { ...conversation, updatedAt: now, studioWorkspace: { id: workspaceId, scenes, currentSceneId, latestSceneId: committed.id, status: "idle" as const, createdAt: previous?.createdAt ?? now, updatedAt: now } };
      });
      if (changed) void saveConversationSnapshot(conversations);
      return changed ? { conversations } : {};
    });
    return committed;
  },
  setStudioWorkspaceStatus: (conversationId, status, assistantMessageId, error) => {
    let changed = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || resolveConversationExperience(conversation) !== "studio") return conversation;
        const now = Date.now();
        const previous = conversation.studioWorkspace;
        changed = true;
        return { ...conversation, updatedAt: now, studioWorkspace: { id: previous?.id ?? crypto.randomUUID(), scenes: previous?.scenes ?? [], currentSceneId: previous?.currentSceneId, latestSceneId: previous?.latestSceneId, status, pendingAssistantMessageId: status === "generating" || status === "validating" ? assistantMessageId : undefined, error: error?.length ? error : undefined, createdAt: previous?.createdAt ?? now, updatedAt: now } };
      });
      if (changed) void saveConversationSnapshot(conversations);
      return changed ? { conversations } : {};
    });
    return changed;
  },
  selectStudioScene: (conversationId, sceneId) => {
    let selected = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        const workspace = conversation.studioWorkspace;
        if (conversation.id !== conversationId || !workspace?.scenes.some((scene) => scene.id === sceneId)) return conversation;
        selected = true;
        return { ...conversation, updatedAt: Date.now(), studioWorkspace: { ...workspace, currentSceneId: sceneId, updatedAt: Date.now() } };
      });
      if (selected) void saveConversationSnapshot(conversations);
      return selected ? { conversations } : {};
    });
    return selected;
  },
  commitStudioResponseRevision: (conversationId, assistantMessageId, input, options) => {
    let committed: StudioResponseRevision | null = null;
    set((state) => {
      let changed = false;
      const conversations = state.conversations.map((conversation) => {
        if (
          conversation.id !== conversationId ||
          resolveConversationExperience(conversation) !== "studio" ||
          conversation.characterId ||
          conversation.groupId
        ) return conversation;

        const target = conversation.messages.find((message) => message.id === assistantMessageId);
        if (!target || target.role !== "assistant") return conversation;

        const now = Date.now();
        const previous = target.studioResponse;
        const nextNumber = (previous?.latestRevision ?? 0) + 1;
        committed = { ...input, revision: nextNumber, createdAt: now };
        const pointerAtStart = options?.pointerRevisionAtStart ?? previous?.currentRevision ?? 0;
        const currentPointer = previous?.currentRevision ?? 0;
        const desiredPointer = currentPointer === pointerAtStart ? nextNumber : currentPointer;
        const revisions = trimStudioResponseRevisions(
          [...(previous?.revisions ?? []), committed],
          desiredPointer,
        );
        const currentRevision = revisions.some((item) => item.revision === desiredPointer)
          ? desiredPointer
          : nextNumber;
        const current = revisions.find((item) => item.revision === currentRevision) ?? committed;
        changed = true;
        return {
          ...conversation,
          updatedAt: now,
          messages: conversation.messages.map((message) => message.id === assistantMessageId
            ? {
                ...message,
                studioResponse: {
                  id: previous?.id ?? crypto.randomUUID(),
                  title: current.title,
                  currentRevision,
                  latestRevision: nextNumber,
                  revisions,
                  status: "ready" as const,
                  createdAt: previous?.createdAt ?? now,
                  updatedAt: now,
                },
              }
            : message),
        };
      });
      if (changed) void saveConversationSnapshot(conversations);
      return changed ? { conversations } : state;
    });
    return committed;
  },
  setStudioResponseStatus: (conversationId, assistantMessageId, status, error) => {
    let updated = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || resolveConversationExperience(conversation) !== "studio") return conversation;
        const target = conversation.messages.find((message) => message.id === assistantMessageId);
        if (!target || target.role !== "assistant") return conversation;
        const now = Date.now();
        updated = true;
        return {
          ...conversation,
          updatedAt: now,
          messages: conversation.messages.map((message) => message.id === assistantMessageId
            ? {
                ...message,
                studioResponse: message.studioResponse
                  ? { ...message.studioResponse, status, error: error?.length ? error : undefined, updatedAt: now }
                  : {
                      id: crypto.randomUUID(),
                      title: "Studio response",
                      currentRevision: 0,
                      latestRevision: 0,
                      revisions: [],
                      status,
                      error: error?.length ? error : undefined,
                      createdAt: now,
                      updatedAt: now,
                    },
              }
            : message),
        };
      });
      if (updated) void saveConversationSnapshot(conversations);
      return updated ? { conversations } : state;
    });
    return updated;
  },
  selectStudioResponseRevision: (conversationId, assistantMessageId, revision) => {
    let selected = false;
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const now = Date.now();
        const messages = conversation.messages.map((message) => {
          if (message.id !== assistantMessageId || message.role !== "assistant" || !message.studioResponse) return message;
          const match = message.studioResponse.revisions.find((item) => item.revision === revision);
          if (!match) return message;
          selected = true;
          return { ...message, studioResponse: { ...message.studioResponse, title: match.title, currentRevision: revision, updatedAt: now } };
        });
        return selected ? { ...conversation, messages, updatedAt: now } : conversation;
      });
      if (selected) void saveConversationSnapshot(conversations);
      return selected ? { conversations } : state;
    });
    return selected;
  },
  undoStudioResponseRevision: (conversationId, assistantMessageId) => {
    const conversation = get().conversations.find((item) => item.id === conversationId);
    const response = conversation?.messages.find((message) => message.id === assistantMessageId)?.studioResponse;
    if (!response) return false;
    const previous = previousStudioResponseRevision(response);
    return previous ? get().selectStudioResponseRevision(conversationId, assistantMessageId, previous.revision) : false;
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
        const now = Date.now();
        const workspace = conversation.studioWorkspace;
        return {
          ...conversation,
          title: isFirstUser ? provisionalTitle : conversation.title,
          messages: [...conversation.messages, userMessage, assistantMessage],
          updatedAt: now,
          studioWorkspace: resolveConversationExperience(conversation) === "studio" ? {
            id: workspace?.id ?? crypto.randomUUID(),
            scenes: workspace?.scenes ?? [],
            currentSceneId: workspace?.currentSceneId,
            latestSceneId: workspace?.latestSceneId,
            status: "generating" as const,
            pendingAssistantMessageId: assistantMessage.id,
            createdAt: workspace?.createdAt ?? now,
            updatedAt: now,
          } : workspace,
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
  setStreamingWebSearchState: (webSearchState) => {
    set((state) => {
      if (!state.streamingBuffer) return state;
      return { streamingBuffer: { ...state.streamingBuffer, webSearchState } };
    });
  },
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
        const workspace = conversation.studioWorkspace;
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
          studioWorkspace: workspace?.pendingAssistantMessageId === messageId
            ? { ...workspace, status: workspace.status === "rejected" || workspace.status === "render_error" ? workspace.status : "idle" as const, pendingAssistantMessageId: undefined, updatedAt: now }
            : workspace,
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
        return normalizeConversationStudio({
          ...conversation,
          messages: truncated,
          updatedAt: Date.now(),
        });
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
        return normalizeConversationStudio({
          ...conversation,
          messages: sliced,
          updatedAt: Date.now(),
        });
      });
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return normalizeConversationStudio({
          ...conversation,
          messages: conversation.messages.filter((m) => m.id !== messageId),
          updatedAt: Date.now(),
        });
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
          studioResponse: copyStudioResponseForFork(message.studioResponse),
        };
      });
      const forked: Conversation = {
        id: crypto.randomUUID(),
        title: `${source.title} (fork)`,
        messages: remappedMessages,
        createdAt: now,
        updatedAt: now,
        projectId: source.projectId,
        experience: resolveConversationExperience(source),
        studioWorkspace: source.studioWorkspace ? (() => {
          const scenes = source.studioWorkspace.scenes.filter((scene) => messageIdMap.has(scene.assistantMessageId)).map((scene) => ({ ...scene, id: crypto.randomUUID(), assistantMessageId: messageIdMap.get(scene.assistantMessageId)!, lineageId: crypto.randomUUID() }));
          const latest = scenes[scenes.length - 1];
          return { id: crypto.randomUUID(), scenes, currentSceneId: latest?.id, latestSceneId: latest?.id, status: "idle" as const, createdAt: now, updatedAt: now };
        })() : undefined,
      };
      newId = forked.id;
      const conversations = [forked, ...state.conversations];
      void saveConversationSnapshot(conversations);
      return { conversations, activeConversationId: forked.id };
    });
    return newId;
  },
  unbindCharacter: (conversationId) => {
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              characterId: undefined,
              characterSnapshot: undefined,
              characterGreetingIndex: undefined,
              updatedAt: Date.now(),
            }
          : c,
      );
      void saveConversationSnapshot(conversations);
      return { conversations };
    });
  },
  recentChatsForCharacter: (characterId, limit = 5) => {
    return get()
      .conversations.filter((c) => c.characterId === characterId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },
}));
