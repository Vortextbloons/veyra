import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/app/components/title-bar";
import { PrimarySidebar } from "@/app/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/app/components/chat-panel";
import { RightPanel } from "@/app/components/right-panel";
import { DocEditorPanel } from "@/modules/documents/components/doc-editor-panel";
import { aiScheduler } from "@/lib/ai-scheduler";
import { ensureProviderReady } from "@/modules/chat/chat-actions";
import type { RecentChatsItem } from "@/modules/chat/chat-types";
import { isChatModeNav } from "@/modules/chat/chat-types";
import { useWorkspaceModeChange } from "@/lib/workspace-mode";
import { ShutdownOverlay } from "@/app/components/shutdown-overlay";
import { registerAppShutdownHandler } from "@/lib/app-shutdown";
import {
  deferUntilIdle,
  emitAppReady,
  logStartupDuration,
  markStartup,
} from "@/lib/startup";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { useProviderStore } from "@/stores/provider-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { ConnectivityToastHost } from "@/components/connectivity/connectivity-toast";
import { UpdateAvailableBanner } from "@/components/update/update-available-banner";
import { useAppUpdateCheck } from "@/hooks/use-app-update-check";
import { useIsFeatureAvailable } from "@/lib/connectivity/useConnectivity";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useResearchStore } from "@/modules/research/research-store";
import { useCharacterStore } from "@/modules/characters/character-store";
import {
  invokeCheckSearxngSetup,
  runSearxngAutoSetup,
} from "@/modules/web-search/searxng-setup";
import { useAppZoom } from "@/hooks/use-app-zoom";
import { useChatContextPanel } from "@/hooks/use-chat-context-panel";
import { useChatPipeline } from "@/hooks/use-chat-pipeline";
import { useAgentDispatch } from "@/hooks/use-agent-dispatch";

const MemoryPage = lazy(() => import("@/modules/memory/components/memory-page").then(m => ({ default: m.MemoryPage })));
const SettingsPage = lazy(() => import("@/components/settings/settings-page"));
const ProjectsPage = lazy(() => import("@/modules/projects/components/projects-page").then(m => ({ default: m.ProjectsPage })));
const ResearchPage = lazy(() => import("@/modules/research/components/ResearchPage").then(m => ({ default: m.ResearchPage })));
const EmailPage = lazy(() => import("@/modules/email/components/EmailPage").then(m => ({ default: m.EmailPage })));
const CharacterPage = lazy(() => import("@/modules/characters/components/CharacterPage").then(m => ({ default: m.CharacterPage })));
const DocumentsPage = lazy(() => import("@/modules/documents/components/DocumentsPage").then(m => ({ default: m.DocumentsPage })));

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
  const { zoom, zoomIn, zoomOut, zoomReset } = useAppZoom();

  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
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
  const rightPanelCollapsed = useSettingsStore((state) => state.rightPanelCollapsed);
  const codeExecutionDefaultEnabled = useSettingsStore((state) => state.codeExecutionEnabled);
  const setActiveNav = useSettingsStore((state) => state.setActiveNav);
  const workspaceChatMode = useSettingsStore((state) => state.workspaceChatMode);
  const setRecentChatsCollapsed = useSettingsStore((state) => state.setRecentChatsCollapsed);
  const setRightPanelCollapsed = useSettingsStore((state) => state.setRightPanelCollapsed);
  const defaultWebSearchEnabled = useSettingsStore(
    (state) => state.defaultWebSearchEnabled,
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(defaultWebSearchEnabled);
  const [codeExecutionActive, setCodeExecutionActive] = useState(codeExecutionDefaultEnabled);
  const effectiveConnectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const startProbeListener = useConnectivityStore((state) => state.startProbeListener);

  const webSearchAvailability = useIsFeatureAvailable("webSearch");
  const codeExecutionAvailability = useIsFeatureAvailable("codeExecution");
  const defaultMemoryEnabled = useSettingsStore((s) => s.defaultMemoryEnabled);

  const isChatMode = isChatModeNav(activeNav);

  // ── Startup / hydration ──────────────────────────────────────────────────

  useEffect(() => {
    markStartup("veyra:app-mounted");
    logStartupDuration("veyra:main-start", "veyra:app-mounted", "main-to-mount");
  }, []);

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
      setCodeExecutionActive(useSettingsStore.getState().codeExecutionEnabled);
      await useChatStore.getState().hydrateConversations();
      void useDocumentStore.getState().hydrateDocuments();
      void useProjectStore.getState().hydrateProjects();
      void useResearchStore.getState().hydrateRuns();
      void useCharacterStore.getState().hydrateCharacters();
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
      void ensureProviderReady();
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
      setCodeExecutionActive(useSettingsStore.getState().codeExecutionEnabled);
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

  // Auto-setup SearXNG via Docker — deferred so it does not compete with first paint.
  useEffect(() => {
    let cancelled = false;

    const cancelIdle = deferUntilIdle(() => {
      void (async () => {
        if (useConnectivityStore.getState().effectiveConnectivity !== "online") {
          return;
        }

        const { setSearxngSetupError, setWebSearchSearxngUrl } = useSettingsStore.getState();
        setSearxngSetupError("");

        await runSearxngAutoSetup();
        if (cancelled) return;

        const status = await invokeCheckSearxngSetup();
        if (status.searxng_url) {
          setWebSearchSearxngUrl(status.searxng_url);
        }
      })().catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        useSettingsStore.getState().setSearxngSetupError(message);
        console.error("[SearXNG] Auto-setup failed:", err);
      });
    }, 5000);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  // ── Hooks ────────────────────────────────────────────────────────────────

  const agent = useAgentDispatch({
    workspaceChatMode,
  });

  const { displayContextStats, displayContextBreakdown, supportsImages } =
    useChatContextPanel({ workspaceChatMode, activeAgentSession: agent.activeAgentSession });

  const pipeline = useChatPipeline({
    projectId: activeProjectId ?? undefined,
    agentModeEnabled: workspaceChatMode === "agents",
    webSearchEnabled,
    onWebSearchChange: setWebSearchEnabled,
    codeExecutionEnabled: codeExecutionActive,
  });

  const handleModeChange = useWorkspaceModeChange();

  // ── Derived ──────────────────────────────────────────────────────────────

  const activeConversation = pipeline.activeConversation;
  const hasActiveConversation = Boolean(activeConversation);

  const recentChats: RecentChatsItem[] = useMemo(() => {
    const scoped = activeProjectId
      ? conversations.filter((conversation) => conversation.projectId === activeProjectId)
      : conversations;

    return scoped.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      meta: new Date(conversation.updatedAt).toLocaleDateString(),
    }));
  }, [activeProjectId, conversations]);

  const codeExecutionPanelDisabled =
    !codeExecutionAvailability.available || workspaceChatMode === "agents";
  const codeExecutionPanelDisabledReason =
    workspaceChatMode === "agents"
      ? "Code execution is only available in chat and characters mode."
      : codeExecutionAvailability.reason;

  const sidebarsCollapsed =
    (recentChatsCollapsed ? 1 : 0) + (rightPanelCollapsed ? 1 : 0);

  const {
    handleNewChat: pipelineHandleNewChat,
    handleDeleteChat: pipelineHandleDeleteChat,
    handleSend: pipelineHandleSend,
    ...pipelineRest
  } = pipeline;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    pipelineHandleNewChat();
    setCodeExecutionActive(useSettingsStore.getState().codeExecutionEnabled);
    setActiveNav("chat");
  }, [pipelineHandleNewChat, setActiveNav]);

  const handleDeleteAllChats = useCallback(() => {
    pipelineHandleNewChat();
    const snapshot = aiScheduler.getSchedulerSnapshot();
    for (const job of snapshot.queuedJobs) {
      aiScheduler.cancelAiJob(job.id);
    }
    deleteAllConversations();
  }, [pipelineHandleNewChat, deleteAllConversations]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <ShutdownOverlay />
      <ConnectivityToastHost />
      <UpdateAvailableBanner />
      <TitleBar
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
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
          onDelete={pipelineHandleDeleteChat}
          onDeleteAll={handleDeleteAllChats}
          collapsed={recentChatsCollapsed}
          onCollapsedChange={setRecentChatsCollapsed}
          hidden={!isChatMode || activeNav === "projects" || workspaceChatMode === "agents" || recentChats.length === 0}
        />
        <div className={`flex min-w-0 flex-1 basis-0 ${isChatMode && activeNav !== "projects" ? "hidden" : ""}`}>
          <Suspense fallback={null}>
            {activeNav === "memory" && <MemoryPage />}
            {activeNav === "projects" && <ProjectsPage />}
            {activeNav === "documents" && <DocumentsPage />}
            {activeNav === "research" && <ResearchPage />}
            {activeNav === "email" && <EmailPage />}
            {activeNav === "characters" && <CharacterPage />}
            {activeNav === "settings" && <SettingsPage />}
          </Suspense>
        </div>
        {isChatMode && activeNav !== "projects" && activeNav !== "characters" && hydrationState === "loading" && <ChatHydrationSkeleton />}
        {isChatMode && activeNav !== "projects" && activeNav !== "characters" && hydrationState === "ready" && (
          <ChatPanel
            title={activeConversation?.title}
            messages={pipelineRest.visibleMessages}
            onSend={pipelineHandleSend}
            isStreaming={pipelineRest.isStreaming}
            streamingMessageId={pipelineRest.streamingMessageId}
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
            defaultMemoryEnabled={defaultMemoryEnabled}
            onTriggerMemoryExtraction={pipelineRest.handleTriggerMemoryExtraction}
            sidebarsCollapsed={sidebarsCollapsed}
            modelLoadProgress={pipelineRest.modelLoadProgress}
            mode={workspaceChatMode}
            onModeChange={handleModeChange}
            agentSessions={agent.visibleAgentSessions}
            activeAgentSessionId={agent.activeAgentSession?.id ?? null}
            agentRuntimeAvailable={agent.agentRuntimeAvailable}
            agentMode={agent.agentMode}
            agentProjectPath={agent.agentProjectPath}
            onAgentModeChange={agent.setAgentMode}
            onAgentProjectPathChange={agent.setAgentProjectPath}
            onAgentRuntimeCheck={() => void agent.checkAgentRuntime()}
            onAgentNewSession={agent.newAgentSession}
            onAgentSessionSelect={agent.handleAgentSessionSelect}
            onAgentSessionStop={agent.stopAgentSession}
            onAgentSessionDelete={(id) => void agent.deleteAgentSession(id)}
            onEditMessage={pipelineRest.handleEditMessage}
            onRegenerate={pipelineRest.handleRegenerate}
            onRetry={pipelineRest.handleRetry}
            onCopyMessage={pipelineRest.handleCopyMessage}
            onForkMessage={pipelineRest.handleForkMessage}
            onDeleteMessage={pipelineRest.handleDeleteMessage}
            editingMessageId={pipelineRest.editingMessageId}
            editInitialValue={pipelineRest.editInitialValue}
            onEditCancel={pipelineRest.handleEditCancel}
            onEditSave={pipelineRest.handleEditSave}
          />
        )}
        {isChatMode && activeNav !== "projects" && activeNav !== "characters" && <DocEditorPanel />}
        <RightPanel
          contextStats={displayContextStats}
          contextBreakdown={displayContextBreakdown}
          collapsed={rightPanelCollapsed}
          onCollapsedChange={setRightPanelCollapsed}
          hidden={!isChatMode || !hasActiveConversation}
          webSearchEnabled={webSearchEnabled}
          onWebSearchChange={setWebSearchEnabled}
          webSearchDisabled={!webSearchAvailability.available}
          webSearchDisabledReason={webSearchAvailability.reason}
          codeExecutionEnabled={codeExecutionActive}
          onCodeExecutionChange={setCodeExecutionActive}
          codeExecutionDisabled={codeExecutionPanelDisabled}
          codeExecutionDisabledReason={codeExecutionPanelDisabledReason}
          isAgentsMode={workspaceChatMode === "agents"}
          agentSessionCount={agent.visibleAgentSessions.length}
          agentActiveCount={agent.visibleAgentSessions.filter((s) => s.status === "running").length}
          onAgentClearSessions={agent.clearAgentSessions}
        />
      </div>
    </div>
  );
}

export default App;
