import { refreshPiModelCatalog } from "@/lib/reasoning-capabilities";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/app/components/title-bar";
import { PrimarySidebar } from "@/app/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/app/components/chat-panel";
import { aiScheduler } from "@/lib/ai-scheduler";
import type { ContextStats, RecentChatsItem } from "@/modules/chat/chat-types";
import { isChatModeNav } from "@/modules/chat/chat-types";
import { ShutdownOverlay } from "@/app/components/shutdown-overlay";
import { registerAppShutdownHandler } from "@/lib/app-shutdown";
import {
  deferUntilIdle,
  emitAppReady,
  logStartupDuration,
  markStartup,
} from "@/lib/startup";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { ConnectivityToastHost } from "@/components/connectivity/connectivity-toast";
import { UpdateAvailableBanner } from "@/components/update/update-available-banner";
import { ConversationStorageBanner } from "@/components/conversation-storage-banner";
import { useAppUpdateCheck } from "@/hooks/use-app-update-check";
import { useIsFeatureAvailable } from "@/lib/connectivity/useConnectivity";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { installUiScaleShortcuts } from "@/lib/ui-scale";
import { useChatContextPanel } from "@/hooks/use-chat-context-panel";
import { useChatPipeline } from "@/hooks/use-chat-pipeline";
import { useAgentDispatch } from "@/hooks/use-agent-dispatch";
import { useAgentStore } from "@/modules/agents/agent-store";
import { initializePiConversations } from "@/modules/agents/pi-conversation-storage";
import { ProjectSidebar } from "@/modules/projects/components/project-sidebar";

const SettingsPage = lazy(() => import("@/components/settings/settings-page"));

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
  const conversations = useChatStore((state) => state.conversations);
  const hydrationState = useChatStore((state) => state.hydrationState);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const deleteAllConversations = useChatStore((state) => state.deleteAllConversations);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  const initializeProvider = useProviderStore((state) => state.initializeProvider);
  const selectProvider = useProviderStore((state) => state.selectProvider);
  const reconnectProvider = useProviderStore((state) => state.reconnectProvider);
  const startProviderServer = useProviderStore((state) => state.startProviderServer);
  const setSelectedModel = useProviderStore((state) => state.setSelectedModel);

  const activeNav = useSettingsStore((state) => state.activeNav);
  const recentChatsCollapsed = useSettingsStore((state) => state.recentChatsCollapsed);
  const setActiveNav = useSettingsStore((state) => state.setActiveNav);
  const setRecentChatsCollapsed = useSettingsStore((state) => state.setRecentChatsCollapsed);
  const defaultWebSearchEnabled = useSettingsStore(
    (state) => state.defaultWebSearchEnabled,
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(defaultWebSearchEnabled);
  const effectiveConnectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const startProbeListener = useConnectivityStore((state) => state.startProbeListener);

  const webSearchAvailability = useIsFeatureAvailable("webSearch");

  const isChatMode = isChatModeNav(activeNav);

  // ── Startup / hydration ──────────────────────────────────────────────────

  useEffect(() => {
    markStartup("veyra:app-mounted");
    logStartupDuration("veyra:main-start", "veyra:app-mounted", "main-to-mount");
  }, []);

  // Ctrl/Cmd +/-/0 and Ctrl+wheel drive the native webview scale.
  useEffect(() => installUiScaleShortcuts(), []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void registerAppShutdownHandler().then((unregister) => {
      cleanup = unregister;
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    void emitAppReady();

    void (async () => {
      await ensureSettingsHydrated();
      setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
      await useChatStore.getState().hydrateConversations();
      await useProjectStore.getState().hydrateProjects();
      initializePiConversations();
      markStartup("veyra:hydration-ready");
      logStartupDuration("veyra:main-start", "veyra:hydration-ready", "main-to-hydration");
      initializeProvider();
    })();

    const stopProbeListener = startProbeListener();

    return () => {
      stopProbeListener();
    };
  }, [initializeProvider, startProbeListener]);

  useEffect(() => {
    return deferUntilIdle(() => {
      void useProviderStore.getState().ensureProviderReady(true).catch(() => undefined);
      if (useConnectivityStore.getState().effectiveConnectivity === "online") {
        void refreshPiModelCatalog();
      }
    }, 3000);
  }, []);

  useAppUpdateCheck();

  // ── Connectivity effects ─────────────────────────────────────────────────

  const prevEffectiveConnectivityRef = useRef(effectiveConnectivity);

  useEffect(() => {
    const prev = prevEffectiveConnectivityRef.current;
    prevEffectiveConnectivityRef.current = effectiveConnectivity;
    if (prev === "offline" && effectiveConnectivity === "online") {
      setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    }
  }, [effectiveConnectivity]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || !event.shiftKey || event.key.toLowerCase() !== "o") return;
      event.preventDefault();
      const current = useSettingsStore.getState().connectivityPreference;
      useSettingsStore
        .getState()
        .setConnectivityPreference(current === "offline" ? "auto" : "offline");
      useConnectivityStore.getState().recomputeEffective();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Hooks ────────────────────────────────────────────────────────────────

  const agent = useAgentDispatch();

  const {
    displayContextStats,
    resolvedContextLength,
    resolvedReservedOutputTokens,
    supportsImages,
  } = useChatContextPanel({ activeAgentSession: agent.activeAgentSession });

  // New chats have no conversation yet — still show the context meter at 0%.
  const composerContextStats: ContextStats = useMemo(
    () =>
      displayContextStats ?? {
        estimatedTokens: 0,
        contextLimit: resolvedContextLength,
        percentUsed: 0,
        includedMessages: 0,
        droppedMessages: 0,
        reservedOutputTokens: resolvedReservedOutputTokens,
      },
    [displayContextStats, resolvedContextLength, resolvedReservedOutputTokens],
  );

  const pipeline = useChatPipeline({
    projectId: activeProjectId ?? undefined,
    webSearchEnabled,
  });


  // ── Derived ──────────────────────────────────────────────────────────────


  const recentChats: RecentChatsItem[] = useMemo(() => {
    const scoped = conversations.filter((conversation) => !conversation.projectId);

    const importedIds = new Set(agent.agentSessions.map((session) => session.sourceConversationId ?? session.id));
    return [...agent.agentSessions.filter((session) => !session.projectId).map((session) => ({
      id: `pi:${session.id}`, title: session.title,
      meta: session.status === "running" ? "Working" : new Date(session.endedAt ?? session.startedAt).toLocaleDateString(),
    })), ...scoped.filter((conversation) => !importedIds.has(conversation.id)).map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      meta: new Date(conversation.updatedAt).toLocaleDateString(),
    }))];
  }, [conversations, agent.agentSessions]);


  const sidebarsCollapsed = recentChatsCollapsed ? 1 : 0;

  const {
    handleNewChat: pipelineHandleNewChat,
    handleDeleteChat: pipelineHandleDeleteChat,
    handleSend: pipelineHandleSend,
    ...pipelineRest
  } = pipeline;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    pipelineHandleNewChat();
    agent.setAgentProjectPath("");
    agent.newAgentSession();
    useProjectStore.getState().setActiveProjectId(null);
    setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    setActiveNav("chat");
  }, [pipelineHandleNewChat, setActiveNav, agent]);

  const handleDeleteAllChats = useCallback(() => {
    pipelineHandleNewChat();
    const snapshot = aiScheduler.getSchedulerSnapshot();
    for (const job of snapshot.queuedJobs) {
      aiScheduler.cancelAiJob(job.id);
    }
    deleteAllConversations();
    useAgentStore.getState().clearSessions();
  }, [pipelineHandleNewChat, deleteAllConversations]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg)]">
      <ShutdownOverlay />
      <ConnectivityToastHost />
      <UpdateAvailableBanner />
      <ConversationStorageBanner />
      <TitleBar />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <PrimarySidebar
          activeNav={activeNav}
          onNavChange={(nav) => {
            setActiveNav(nav);
          }}
          onNewChat={handleNewChat}
        >
          <ProjectSidebar onOpenChat={(id) => {
            const conversation = useChatStore.getState().conversations.find((item) => item.id === id);
            if (!conversation) return;
            useAgentStore.getState().importConversation(conversation, conversation.agentSession?.projectPath ?? "");
            setActiveConversationId(id);
            setActiveNav("chat");
          }} onNewProjectChat={(id, workspacePath) => {
            const project = useProjectStore.getState().projects.find((item) => item.id === id);
            pipelineHandleNewChat();
            useAgentStore.getState().newSession();
            useAgentStore.getState().setProjectPath(workspacePath ?? project?.settings.resources?.find((resource) => resource.directory)?.path ?? "");
            useAgentStore.getState().newSession();
            useProjectStore.getState().setActiveProjectId(id);
            setActiveNav("chat");
          }} />
          <RecentChats
            chats={recentChats}
            activeId={agent.activeAgentSessionId ? `pi:${agent.activeAgentSessionId}` : undefined}
            onSelect={(id) => {
              if (id.startsWith("pi:")) agent.handleAgentSessionSelect(id.slice(3));
              else {
                const conversation = conversations.find((item) => item.id === id);
                if (conversation) useAgentStore.getState().importConversation(conversation, useProjectStore.getState().projects.find((project) => project.id === conversation.projectId)?.settings.agentProjectPath ?? "");
                setActiveConversationId(id);
              }
              setActiveNav("chat");
            }}
            onDelete={(id) => {
              if (id.startsWith("pi:")) {
                const sourceId = agent.agentSessions.find((session) => session.id === id.slice(3))?.sourceConversationId;
                void agent.deleteAgentSession(id.slice(3));
                if (sourceId) pipelineHandleDeleteChat(sourceId);
              } else pipelineHandleDeleteChat(id);
            }}
            onDeleteAll={handleDeleteAllChats}
            collapsed={recentChatsCollapsed}
            onCollapsedChange={setRecentChatsCollapsed}
            hidden={!isChatMode}
          />
        </PrimarySidebar>
        <div className={`flex min-w-0 flex-1 basis-0 ${isChatMode ? "hidden" : ""}`}>
          <Suspense fallback={null}>
            {activeNav === "settings" && <SettingsPage />}
          </Suspense>
        </div>
        {isChatMode && hydrationState === "loading" && <ChatHydrationSkeleton />}
        {isChatMode && hydrationState === "ready" && (
          <ChatPanel
            onSend={pipelineHandleSend}
            providers={pipelineRest.providers}
            selectedProvider={pipelineRest.selectedProvider}
            onProviderChange={selectProvider}
            providerConnectionPhase={pipelineRest.connectionPhase}
            providerConnectionError={pipelineRest.connectionError}
            onProviderReconnect={(id) => void reconnectProvider(id)}
            onProviderStartServer={(id) => void startProviderServer(id)}
            models={pipelineRest.models}
            selectedModel={pipelineRest.selectedModel}
            onModelChange={setSelectedModel}
            favoriteModels={pipelineRest.favoriteModels}
            onToggleFavorite={(id) => useSettingsStore.getState().toggleFavoriteModel(id)}
            supportsImages={supportsImages}
            sidebarsCollapsed={sidebarsCollapsed}
            contextStats={composerContextStats}
            webSearchEnabled={webSearchEnabled}
            onWebSearchChange={setWebSearchEnabled}
            webSearchDisabled={!webSearchAvailability.available}
            webSearchDisabledReason={webSearchAvailability.reason}
            modelLoadProgress={pipelineRest.modelLoadProgress}
            agentSessions={agent.agentSessions}
            activeAgentSessionId={agent.activeAgentSessionId}
            agentRuntimeAvailable={agent.agentRuntimeAvailable}
            agentProjectPath={agent.agentProjectPath}
            onAgentProjectPathChange={agent.setAgentProjectPath}
            onAgentRuntimeCheck={() => void agent.checkAgentRuntime()}
            onAgentSessionStop={agent.stopAgentSession}
          />
        )}
      </div>
    </div>
  );
}

export default App;
