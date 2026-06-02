import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { PrimarySidebar } from "@/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/components/chat-panel";
import { RightPanel } from "@/components/right-panel";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeChatSend, ensureProviderReady, triggerMemoryExtractionNow } from "@/lib/chat-actions";
import type { ChatMessage, ContextStats, RecentChatsItem, RequestStatus } from "@/lib/chat-types";
import { isChatModeNav } from "@/lib/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { getContextStats } from "@/lib/context";
import {
  deferUntilIdle,
  emitAppReady,
  logStartupDuration,
  markStartup,
} from "@/lib/startup";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { invokeCheckSearxngSetup, invokeStartSearxngContainer, invokeStopSearxngContainer } from "@/modules/web-search/searxng-setup";

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "veyra.zoom";
const DEFAULT_ZOOM = 1.1;

const MemoryPage = lazy(() => import("@/components/memory/memory-page"));
const SettingsPage = lazy(() => import("@/components/settings/settings-page"));

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

function ChatHydrationSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
      <div className="h-6 w-48 animate-pulse rounded bg-white/5" />
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <div className="h-16 w-2/3 animate-pulse rounded-xl bg-white/5" />
        <div className="ml-auto h-16 w-1/2 animate-pulse rounded-xl bg-white/5" />
        <div className="h-16 w-3/5 animate-pulse rounded-xl bg-white/5" />
      </div>
    </div>
  );
}

function App() {
  const [zoom, setZoom] = useState<number>(loadZoom);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const activeChatJobIdRef = useRef<string | null>(null);

  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const hydrationState = useChatStore((state) => state.hydrationState);
  const streamingBuffer = useChatStore((state) => state.streamingBuffer);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const deleteAllConversations = useChatStore((state) => state.deleteAllConversations);
  const addMessagePair = useChatStore((state) => state.addMessagePair);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const appendStreamingReasoning = useChatStore((state) => state.appendStreamingReasoning);
  const clearStreamingBuffer = useChatStore((state) => state.clearStreamingBuffer);
  const clearStreamingBufferUnlessSkipped = useChatStore((state) => state.clearStreamingBufferUnlessSkipped);
  const commitAssistantMessage = useChatStore((state) => state.commitAssistantMessage);

  const providers = useProviderStore((state) => state.providers);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const models = useProviderStore((state) => state.models);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const initializeProvider = useProviderStore((state) => state.initializeProvider);
  const selectProvider = useProviderStore((state) => state.selectProvider);
  const reconnectProvider = useProviderStore((state) => state.reconnectProvider);
  const startProviderServer = useProviderStore((state) => state.startProviderServer);
  const connectionPhase = useProviderStore((state) => state.connectionPhase);
  const connectionError = useProviderStore((state) => state.connectionError);
  const setSelectedModel = useProviderStore((state) => state.setSelectedModel);

  const activeNav = useSettingsStore((state) => state.activeNav);
  const recentChatsCollapsed = useSettingsStore((state) => state.recentChatsCollapsed);
  const rightPanelCollapsed = useSettingsStore((state) => state.rightPanelCollapsed);
  const favoriteModels = useSettingsStore((state) => state.favoriteModels);
  const getModelSettings = useSettingsStore((state) => state.getModelSettings);
  const setActiveNav = useSettingsStore((state) => state.setActiveNav);
  const setRecentChatsCollapsed = useSettingsStore((state) => state.setRecentChatsCollapsed);
  const setRightPanelCollapsed = useSettingsStore((state) => state.setRightPanelCollapsed);

  const sidebarsCollapsed =
    (recentChatsCollapsed ? 1 : 0) + (rightPanelCollapsed ? 1 : 0);

  const isChatMode = isChatModeNav(activeNav);

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
    markStartup("veyra:app-mounted");
    logStartupDuration("veyra:main-start", "veyra:app-mounted", "main-to-mount");
  }, []);

  useEffect(() => {
    void (async () => {
      await ensureSettingsHydrated();
      await useChatStore.getState().hydrateConversations();
      markStartup("veyra:hydration-ready");
      logStartupDuration("veyra:main-start", "veyra:hydration-ready", "main-to-hydration");
      initializeProvider();
      await emitAppReady();
    })();

    return deferUntilIdle(() => {
      void ensureProviderReady();
    }, 3000);
  }, [initializeProvider]);

  // Auto-setup SearXNG via Docker — deferred so it does not compete with first paint.
  useEffect(() => {
    let cancelled = false;
    let startedByUs = false;

    const cancelIdle = deferUntilIdle(() => {
      void (async () => {
      try {
        const status = await invokeCheckSearxngSetup();
        if (cancelled) return;

        if (status.container_running && status.searxng_url) {
          // Container already running — just wire it up, don't stop on close
          useSettingsStore.getState().setWebSearchSearxngUrl(status.searxng_url);
          useSettingsStore.getState().setWebSearchEnabled(true);
        } else if (status.docker_installed) {
          // Docker available but container not running — start it
          const url = await invokeStartSearxngContainer();
          if (cancelled) return;
          startedByUs = true;
          useSettingsStore.getState().setWebSearchSearxngUrl(url);
          useSettingsStore.getState().setWebSearchEnabled(true);
        }
        // If Docker is not installed, do nothing — user can configure manually
      } catch (err) {
        console.warn("[SearXNG] Auto-setup skipped:", err);
      }
      })();
    }, 5000);

    return () => {
      cancelled = true;
      cancelIdle();
      if (startedByUs) {
        // Fire-and-forget stop — app is closing, don't await
        invokeStopSearxngContainer().catch(() => {});
      }
    };
  }, []);

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
            webSearchState: streamingBuffer.webSearchState ?? message.webSearchState,
          }
        : message,
    );
  }, [activeConversation?.id, activeConversation?.messages, streamingBuffer]);

  const resolvedContextLength = getModelSettings(selectedModel).contextLength;

  const contextStats: ContextStats | undefined = useMemo(
    () =>
      activeConversation
        ? getContextStats(activeConversation.messages, resolvedContextLength)
        : undefined,
    [activeConversation, resolvedContextLength],
  );

  const recentChats: RecentChatsItem[] = useMemo(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        meta: new Date(conversation.updatedAt).toLocaleDateString(),
      })),
    [conversations],
  );

  const handleNewChat = useCallback(() => {
    if (activeChatJobIdRef.current) aiScheduler.cancelAiJob(activeChatJobIdRef.current);
    setRequestStatus("idle");
    setStreamingMessageId(null);
    clearStreamingBuffer();
    setActiveNav("chat");
    createConversation();
  }, [clearStreamingBuffer, createConversation, setActiveNav]);

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeConversationId && activeChatJobIdRef.current) {
        aiScheduler.cancelAiJob(activeChatJobIdRef.current);
        setRequestStatus("idle");
        setStreamingMessageId(null);
        clearStreamingBuffer();
      }
      aiScheduler.cancelAiJobsByConversation(id);
      deleteConversation(id);
    },
    [activeConversationId, clearStreamingBuffer, deleteConversation],
  );

  const handleDeleteAllChats = useCallback(() => {
    if (activeChatJobIdRef.current) aiScheduler.cancelAiJob(activeChatJobIdRef.current);
    setRequestStatus("idle");
    setStreamingMessageId(null);
    // Cancel all queued jobs - active user job will finish naturally
    const snapshot = aiScheduler.getSchedulerSnapshot();
    for (const job of snapshot.queuedJobs) {
      aiScheduler.cancelAiJob(job.id);
    }
    deleteAllConversations();
  }, [deleteAllConversations]);

  const selectedModelInfo = models.find((model) => model.id === selectedModel);
  const supportsImages = selectedModelInfo?.supportsImages ?? false;
  const defaultMemoryEnabled = useSettingsStore((s) => s.defaultMemoryEnabled);

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[], options?: { memoryEnabled: boolean }) => {
      const memoryEnabled =
        options?.memoryEnabled ?? useSettingsStore.getState().defaultMemoryEnabled;
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

      const previousResponseId = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId)?.lmResponseId;

      addMessagePair(conversationId, userMessage, assistantMessage, {
        deferTitle: useSettingsStore.getState().autoNameEnabled,
      });
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");

      // Abort any active background job to prioritize user message
      aiScheduler.abortActiveBackgroundJob();

      const jobId = aiScheduler.enqueueAiJob({
        type: "user_chat",
        priority: 0,
        title: "Sending message",
        description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
        prompt: trimmed,
        conversationId,
        model: selectedModel,
        run: async (signal) => {
          try {
            await ensureProviderReady();

            return await executeChatSend({
              conversationId,
              userMessage,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              signal,
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
              onComplete: (result, context) => {
                // Skip premature commit when orchestrator is doing a web search re-prompt
                if (useChatStore.getState().isBufferClearSkipped()) return;
                const memoryPack = context?.memoryPack ?? null;
                const memoryRetrieval = context?.memoryRetrieval;
                const webSearchSources = context?.webSearchSources;
                commitAssistantMessage(conversationId, assistantMessage.id, {
                  performance: result.performance,
                  lmResponseId: result.responseId,
                  ...(memoryPack ? { memoryPack } : {}),
                  ...(memoryEnabled && memoryRetrieval ? { memoryRetrieval } : {}),
                  ...(webSearchSources ? { webSearchSources } : {}),
                });
              },
            });
          } catch (error) {
            if (!signal.aborted) {
              commitAssistantMessage(conversationId, assistantMessage.id, {
                content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              });
              setRequestStatus("error");
            }
          } finally {
            clearStreamingBufferUnlessSkipped();
            if (!useChatStore.getState().isBufferClearSkipped()) {
              setStreamingMessageId(null);
              setRequestStatus((status) => (status === "error" ? "error" : "idle"));
            }
            if (activeChatJobIdRef.current === jobId) activeChatJobIdRef.current = null;
          }
        },
      });
      activeChatJobIdRef.current = jobId;
    },
    [
      activeConversationId,
      addMessagePair,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      createConversation,
      selectedModel,
      selectedProvider,
      supportsImages,
    ],
  );

  const handleTriggerMemoryExtraction = useCallback(() => {
    if (!activeConversationId) return;
    const chatModel = useProviderStore.getState().selectedModel.trim();
    const providerId = useProviderStore.getState().selectedProvider;
    if (!chatModel) return;
    void triggerMemoryExtractionNow({
      conversationId: activeConversationId,
      chatModel,
      providerId,
    });
  }, [activeConversationId]);

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
          hidden={!isChatMode}
        />
        <Suspense fallback={null}>
          {activeNav === "memory" && <MemoryPage />}
          {activeNav === "settings" && <SettingsPage />}
        </Suspense>
        {isChatMode && hydrationState === "loading" && <ChatHydrationSkeleton />}
        {isChatMode && hydrationState === "ready" && (
          <ChatPanel
            title={activeConversation?.title}
            messages={visibleMessages}
            onSend={handleSend}
            isStreaming={requestStatus === "streaming"}
            streamingMessageId={streamingMessageId}
            providers={providers}
            selectedProvider={selectedProvider}
            onProviderChange={selectProvider}
            providerConnectionPhase={connectionPhase}
            providerConnectionError={connectionError}
            onProviderReconnect={(id) => void reconnectProvider(id)}
            onProviderStartServer={(id) => void startProviderServer(id)}
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            favoriteModels={favoriteModels}
            onToggleFavorite={(id) => useSettingsStore.getState().toggleFavoriteModel(id)}
            supportsImages={supportsImages}
            defaultMemoryEnabled={defaultMemoryEnabled}
            onTriggerMemoryExtraction={handleTriggerMemoryExtraction}
            sidebarsCollapsed={sidebarsCollapsed}
          />
        )}
        <RightPanel
          contextStats={contextStats}
          collapsed={rightPanelCollapsed}
          onCollapsedChange={setRightPanelCollapsed}
          hidden={!isChatMode}
        />
      </div>
    </div>
  );
}

export default App;
