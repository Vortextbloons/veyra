import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { PrimarySidebar } from "@/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/components/chat-panel";
import { RightPanel } from "@/components/right-panel";
import { sendChatRequest } from "@/lib/chat-orchestrator";
import type { ChatMessage, ContextStats, RecentChatsItem, RequestStatus } from "@/lib/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { getContextStats } from "@/lib/context";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "veyra.zoom";
const DEFAULT_ZOOM = 1.1;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function loadZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return DEFAULT_ZOOM;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_ZOOM;
    if (parsed === 1) return DEFAULT_ZOOM;
    return clampZoom(parsed);
  } catch {
    return DEFAULT_ZOOM;
  }
}

function applyZoom(zoom: number) {
  const z = String(zoom);
  document.documentElement.style.zoom = z;
  document.body.style.zoom = z;
  document.documentElement.style.setProperty("--ui-zoom", z);
}

function App() {
  const [zoom, setZoom] = useState<number>(loadZoom);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const streamingBuffer = useChatStore((state) => state.streamingBuffer);
  const hydrateConversations = useChatStore((state) => state.hydrateConversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const deleteAllConversations = useChatStore((state) => state.deleteAllConversations);
  const addMessagePair = useChatStore((state) => state.addMessagePair);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const appendStreamingReasoning = useChatStore((state) => state.appendStreamingReasoning);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);
  const commitAssistantMessage = useChatStore((state) => state.commitAssistantMessage);

  const providers = useProviderStore((state) => state.providers);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const models = useProviderStore((state) => state.models);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const initializeProvider = useProviderStore((state) => state.initializeProvider);
  const selectProvider = useProviderStore((state) => state.selectProvider);
  const setSelectedModel = useProviderStore((state) => state.setSelectedModel);

  const activeNav = useSettingsStore((state) => state.activeNav);
  const recentChatsCollapsed = useSettingsStore((state) => state.recentChatsCollapsed);
  const rightPanelCollapsed = useSettingsStore((state) => state.rightPanelCollapsed);
  const setActiveNav = useSettingsStore((state) => state.setActiveNav);
  const setRecentChatsCollapsed = useSettingsStore((state) => state.setRecentChatsCollapsed);
  const setRightPanelCollapsed = useSettingsStore((state) => state.setRightPanelCollapsed);

  const sidebarsCollapsed =
    (recentChatsCollapsed ? 1 : 0) + (rightPanelCollapsed ? 1 : 0);

  useEffect(() => {
    applyZoom(zoom);
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // storage full or unavailable
    }
  }, [zoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key;
      if (key === "+" || key === "=") {
        e.preventDefault();
        setZoom((z) => clampZoom(+(z + ZOOM_STEP).toFixed(2)));
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        setZoom((z) => clampZoom(+(z - ZOOM_STEP).toFixed(2)));
      } else if (key === "0") {
        e.preventDefault();
        setZoom(DEFAULT_ZOOM);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    void hydrateConversations();
    void initializeProvider();
  }, [hydrateConversations, initializeProvider]);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? null;

  const visibleMessages = useMemo(() => {
    const messages = activeConversation?.messages ?? [];
    if (!streamingBuffer || streamingBuffer.conversationId !== activeConversation?.id) {
      return messages;
    }

    return messages.map((message) =>
      message.id === streamingBuffer.messageId
        ? {
            ...message,
            content: streamingBuffer.content,
            reasoning: streamingBuffer.reasoning || message.reasoning,
          }
        : message,
    );
  }, [activeConversation?.id, activeConversation?.messages, streamingBuffer]);

  const contextStats: ContextStats | undefined = activeConversation
    ? getContextStats(activeConversation.messages)
    : undefined;

  const recentChats: RecentChatsItem[] = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    meta: new Date(conversation.updatedAt).toLocaleDateString(),
  }));

  const handleNewChat = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeConversationId && abortRef.current) {
        abortRef.current.abort();
        setRequestStatus("idle");
        setStreamingMessageId(null);
        clearStreamingBuffer();
      }
      deleteConversation(id);
    },
    [activeConversationId, clearStreamingBuffer, deleteConversation],
  );

  const handleDeleteAllChats = useCallback(() => {
    abortRef.current?.abort();
    setRequestStatus("idle");
    setStreamingMessageId(null);
    deleteAllConversations();
  }, [deleteAllConversations]);

  const selectedModelInfo = models.find((model) => model.id === selectedModel);
  const supportsImages = selectedModelInfo?.supportsImages ?? false;

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[]) => {
      const trimmed = text.trim();
      const imageAttachments =
        attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [];
      if (!trimmed && imageAttachments.length === 0) return;

      if (imageAttachments.length > 0 && !supportsImages) {
        return;
      }

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        timestamp: Date.now(),
      };
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      const conversation = conversations.find((item) => item.id === conversationId);
      const messages = [...(conversation?.messages ?? []), userMessage];

      addMessagePair(conversationId, userMessage, assistantMessage);
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");

      const controller = new AbortController();
      abortRef.current = controller;

      void sendChatRequest({
        providerId: selectedProvider,
        messages,
        model: selectedModel,
        previousResponseId: conversation?.lmResponseId,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (chunk) appendStreamingContent(conversationId, assistantMessage.id, chunk);
        },
        onReasoningChunk: (chunk) => {
          if (chunk) appendStreamingReasoning(conversationId, assistantMessage.id, chunk);
        },
        onError: (error) => {
          commitAssistantMessage(conversationId, assistantMessage.id, {
            content: `Error: ${error}`,
          });
          clearStreamingBuffer();
          setRequestStatus("error");
          setStreamingMessageId(null);
        },
        onComplete: (result) => {
          commitAssistantMessage(conversationId, assistantMessage.id, {
            performance: result.performance,
            lmResponseId: result.responseId,
          });
        },
      }).then(() => {
        clearStreamingBuffer();
        setRequestStatus("idle");
        setStreamingMessageId(null);
      });
    },
    [
      activeConversationId,
      addMessagePair,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      commitAssistantMessage,
      conversations,
      createConversation,
      selectedModel,
      selectedProvider,
      supportsImages,
    ],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <TitleBar
        zoom={zoom}
        onZoomIn={() => setZoom((z) => clampZoom(+(z + ZOOM_STEP).toFixed(2)))}
        onZoomOut={() => setZoom((z) => clampZoom(+(z - ZOOM_STEP).toFixed(2)))}
        onZoomReset={() => setZoom(DEFAULT_ZOOM)}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <PrimarySidebar
          activeNav={activeNav}
          onNavChange={setActiveNav}
          onNewChat={handleNewChat}
        />
        <RecentChats
          chats={recentChats}
          activeId={activeConversationId ?? undefined}
          onSelect={setActiveConversationId}
          onDelete={handleDeleteChat}
          onDeleteAll={handleDeleteAllChats}
          collapsed={recentChatsCollapsed}
          onCollapsedChange={setRecentChatsCollapsed}
        />
        <ChatPanel
          title={activeConversation?.title}
          messages={visibleMessages}
          onSend={handleSend}
          isStreaming={requestStatus === "streaming"}
          streamingMessageId={streamingMessageId}
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderChange={selectProvider}
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          supportsImages={supportsImages}
          sidebarsCollapsed={sidebarsCollapsed}
        />
        <RightPanel
          contextStats={contextStats}
          collapsed={rightPanelCollapsed}
          onCollapsedChange={setRightPanelCollapsed}
        />
      </div>
    </div>
  );
}

export default App;
