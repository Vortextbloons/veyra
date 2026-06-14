import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { PrimarySidebar } from "@/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/components/chat-panel";
import { RightPanel } from "@/components/right-panel";
import { DocEditorPanel } from "@/modules/documents/components/doc-editor-panel";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeChatSend, ensureProviderReady, triggerMemoryExtractionNow } from "@/lib/chat-actions";
import { prepareAgentLmStudioModel } from "@/lib/lm-model-session";
import type { ChatMessage, ChatMode, ContextStats, RecentChatsItem, RequestStatus } from "@/lib/chat-types";
import { isChatModeNav } from "@/lib/chat-types";
import type { MessageAttachment } from "@/lib/message-attachments";
import { estimateTokens, getContextStats } from "@/lib/context";
import { ShutdownOverlay } from "@/components/shutdown-overlay";
import { registerAppShutdownHandler } from "@/lib/app-shutdown";
import {
  deferUntilIdle,
  emitAppReady,
  logStartupDuration,
  markStartup,
} from "@/lib/startup";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import type { AgentSession } from "@/modules/agents/agent-types";
import { useProviderStore } from "@/stores/provider-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { ConnectivityToastHost } from "@/components/connectivity/connectivity-toast";
import { useIsFeatureAvailable } from "@/lib/connectivity/useConnectivity";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useResearchStore } from "@/modules/research/research-store";
import { useCharacterStore } from "@/modules/characters/character-store";
import {
  invokeCheckSearxngSetup,
  runSearxngAutoSetup,
} from "@/modules/web-search/searxng-setup";

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "veyra.zoom";
const DEFAULT_ZOOM = 1.1;

const MemoryPage = lazy(() => import("@/components/memory/memory-page"));
const SettingsPage = lazy(() => import("@/components/settings/settings-page"));
const ProjectsPage = lazy(() => import("@/modules/projects/components/projects-page").then(m => ({ default: m.ProjectsPage })));
const ResearchPage = lazy(() => import("@/modules/research/components/ResearchPage").then(m => ({ default: m.ResearchPage })));
const EmailPage = lazy(() => import("@/modules/email/components/EmailPage").then(m => ({ default: m.EmailPage })));
const CharacterPage = lazy(() => import("@/modules/characters/components/CharacterPage").then(m => ({ default: m.CharacterPage })));

const OPENCODE_AGENT_BASE_TOKENS = 9_000;
const OPENCODE_AGENT_TOOL_OVERHEAD_TOKENS = 1_200;

function getAgentContextStats(
  session: AgentSession,
  contextLimit: number,
  reservedOutputTokens: number,
): ContextStats {
  const eventTokens = session.events.reduce((sum, item) => {
    const detailTokens = estimateTokens([item.title, item.detail].filter(Boolean).join("\n"));
    const multiplier = item.type === "tool" || item.type === "reasoning" ? 2 : 1;
    return sum + detailTokens * multiplier;
  }, 0);
  const toolEvents = session.events.filter((item) => item.type === "tool").length;
  const estimatedTokens = Math.max(
    session.contextTokens ?? 0,
    OPENCODE_AGENT_BASE_TOKENS + eventTokens + toolEvents * OPENCODE_AGENT_TOOL_OVERHEAD_TOKENS,
  );

  return {
    estimatedTokens,
    contextLimit,
    percentUsed: Math.round((estimatedTokens / contextLimit) * 100),
    includedMessages: session.events.length,
    droppedMessages: 0,
    reservedOutputTokens,
    includedLabel: "agent events",
    contextNote: session.contextTokens
      ? "Uses OpenCode-reported tokens when available."
      : "Includes estimated OpenCode system, tool, repo, and reasoning overhead.",
  };
}

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
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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
  const setModelLoadProgress = useChatStore((state) => state.setModelLoadProgress);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const truncateAfterMessage = useChatStore((state) => state.truncateAfterMessage);
  const removeLastMessagePair = useChatStore((state) => state.removeLastMessagePair);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const forkConversation = useChatStore((state) => state.forkConversation);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);

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
  const defaultContextLength = useSettingsStore((state) => state.defaultContextLength);
  const defaultReservedOutputTokens = useSettingsStore((state) => state.defaultReservedOutputTokens);
  const modelOverrides = useSettingsStore((state) => state.modelOverrides);
  const setActiveNav = useSettingsStore((state) => state.setActiveNav);
  const setRecentChatsCollapsed = useSettingsStore((state) => state.setRecentChatsCollapsed);
  const setRightPanelCollapsed = useSettingsStore((state) => state.setRightPanelCollapsed);
  const defaultWebSearchEnabled = useSettingsStore(
    (state) => state.defaultWebSearchEnabled,
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(defaultWebSearchEnabled);
  const effectiveConnectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const startProbeListener = useConnectivityStore((state) => state.startProbeListener);
  const webSearchAvailability = useIsFeatureAvailable("webSearch");
  const webSearchDisabled = !webSearchAvailability.available;
  const effectiveWebSearchEnabled =
    effectiveConnectivity === "online" && webSearchEnabled && !webSearchDisabled;
  const prevEffectiveConnectivityRef = useRef(effectiveConnectivity);

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
    let cleanup: (() => void) | undefined;
    void registerAppShutdownHandler().then((unregister) => {
      cleanup = unregister;
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    // Window starts hidden in tauri.conf.json — reveal as soon as React mounts
    // so a slow hydration path never leaves the app invisible.
    void emitAppReady();

    void (async () => {
      await ensureSettingsHydrated();
      setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
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
            toolStates: streamingBuffer.toolStates ?? message.toolStates,
          }
        : message,
    );
  }, [activeConversation?.id, activeConversation?.messages, streamingBuffer]);

  const selectedModelContextSettings = useMemo(() => {
    const override = modelOverrides[selectedModel];
    return {
      contextLength: override?.contextLength ?? defaultContextLength,
      reservedOutputTokens: override?.reservedOutputTokens ?? defaultReservedOutputTokens,
    };
  }, [defaultContextLength, defaultReservedOutputTokens, modelOverrides, selectedModel]);
  const resolvedContextLength = selectedModelContextSettings.contextLength;
  const resolvedReservedOutputTokens = selectedModelContextSettings.reservedOutputTokens;

  const chatContextStats: ContextStats | undefined = useMemo(
    () =>
      activeConversation
        ? getContextStats(activeConversation.messages, resolvedContextLength, resolvedReservedOutputTokens)
        : undefined,
    [activeConversation, resolvedContextLength, resolvedReservedOutputTokens],
  );

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

  const handleNewChat = useCallback(() => {
    if (activeChatJobIdRef.current) aiScheduler.cancelAiJob(activeChatJobIdRef.current);
    setRequestStatus("idle");
    setStreamingMessageId(null);
    clearStreamingBuffer();
    setWebSearchEnabled(useSettingsStore.getState().defaultWebSearchEnabled);
    setActiveNav("chat");
    createConversation(activeProjectId ?? undefined);
  }, [activeProjectId, clearStreamingBuffer, createConversation, setActiveNav]);

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
  const modelLoadProgress = useChatStore((state) => state.modelLoadProgress);

  const agentSessions = useAgentStore((state) => state.sessions);
  const activeAgentSessionId = useAgentStore((state) => state.activeSessionId);
  const agentRuntimeAvailable = useAgentStore((state) => state.runtimeAvailable);
  const agentMode = useAgentStore((state) => state.mode);
  const agentProjectPath = useAgentStore((state) => state.projectPath);
  const setAgentMode = useAgentStore((state) => state.setMode);
  const setAgentProjectPath = useAgentStore((state) => state.setProjectPath);
  const setActiveAgentSessionId = useAgentStore((state) => state.setActiveSessionId);
  const checkAgentRuntime = useAgentStore((state) => state.checkRuntime);
  const loadAgentProjectSessions = useAgentStore((state) => state.loadProjectSessions);
  const loadOpencodeSession = useAgentStore((state) => state.loadOpencodeSession);
  const newAgentSession = useAgentStore((state) => state.newSession);
  const startAgentSession = useAgentStore((state) => state.startSession);
  const stopAgentSession = useAgentStore((state) => state.stopSession);
  const deleteAgentSession = useAgentStore((state) => state.deleteSession);
  const clearAgentSessions = useAgentStore((state) => state.clearSessions);

  const activeAgentSession = useMemo(
    () =>
      agentSessions.find((session) => session.id === activeAgentSessionId) ??
      agentSessions[0] ??
      null,
    [activeAgentSessionId, agentSessions],
  );

  const agentContextStats: ContextStats | undefined = useMemo(() => {
    if (!activeAgentSession) return undefined;
    return getAgentContextStats(
      activeAgentSession,
      resolvedContextLength,
      resolvedReservedOutputTokens,
    );
  }, [activeAgentSession, resolvedContextLength, resolvedReservedOutputTokens]);

  const displayContextStats = chatMode === "agents" ? agentContextStats : chatContextStats;

  useEffect(() => {
    if (chatMode === "agents" && agentRuntimeAvailable == null) {
      void checkAgentRuntime();
    }
  }, [agentRuntimeAvailable, chatMode, checkAgentRuntime]);

  useEffect(() => {
    if (chatMode !== "agents" || agentRuntimeAvailable === false) return;
    void loadAgentProjectSessions(agentProjectPath);
  }, [agentProjectPath, agentRuntimeAvailable, chatMode, loadAgentProjectSessions]);

  const handleAgentSessionSelect = useCallback(
    (id: string) => {
      setActiveAgentSessionId(id);
      void loadOpencodeSession(id);
    },
    [loadOpencodeSession, setActiveAgentSessionId],
  );

  useEffect(() => {
    if (chatMode !== "agents" || !activeAgentSessionId) return;
    void loadOpencodeSession(activeAgentSessionId);
  }, [activeAgentSessionId, chatMode, loadOpencodeSession]);

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[], options?: { memoryEnabled: boolean }) => {
      const memoryEnabled =
        options?.memoryEnabled ?? useSettingsStore.getState().defaultMemoryEnabled;
      const trimmed = text.trim();
      const imageAttachments =
        attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [];
      if (!trimmed && imageAttachments.length === 0) return;

      if (chatMode === "agents") {
        if (!trimmed) return;
        aiScheduler.abortActiveBackgroundJob();
        aiScheduler.enqueueAiJob({
          type: "agent_opencode",
          priority: 0,
          title: "Running OpenCode agent",
          description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
          prompt: trimmed,
          model: selectedModel,
          run: async (signal) => {
            if (signal.aborted) throw new DOMException("Agent job aborted", "AbortError");
            if (selectedProvider === "lm-studio") {
              await prepareAgentLmStudioModel(
                selectedModel,
                resolvedContextLength,
                signal,
                (phase: string, percent?: number) => {
                  setModelLoadProgress(
                    phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                  );
                },
              );
            }
            const sessionId = await startAgentSession({
              mode: agentMode,
              projectPath: agentProjectPath,
              prompt: trimmed,
              model: selectedModel,
              contextLength: resolvedContextLength,
              reservedOutputTokens: resolvedReservedOutputTokens,
              providerId: selectedProvider,
            });
            const session = useAgentStore.getState().sessions.find((item) => item.id === sessionId);
            return {
              prompt: trimmed,
              output: session?.summary,
            };
          },
        });
        return;
      }

      if (imageAttachments.length > 0 && !supportsImages) {
        return;
      }

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation(activeProjectId ?? undefined);
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
        modelId: selectedModel,
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
              webSearchEnabled: effectiveWebSearchEnabled,
              projectId: activeProjectId ?? undefined,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(conversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(conversationId, assistantMessage.id, chunk);
              },
              onModelLoadProgress: (phase: string, percent?: number) => {
                setModelLoadProgress(
                  phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                );
              },
              onError: (error) => {
                commitAssistantMessage(conversationId, assistantMessage.id, {
                  content: `Error: ${error}`,
                });
                clearStreamingBuffer();
                setModelLoadProgress(null);
                setRequestStatus("error");
                setStreamingMessageId(null);
              },
              onComplete: (result, context) => {
                // Skip premature commit when orchestrator is doing a web search re-prompt
                if (useChatStore.getState().isBufferClearSkipped()) return;
                setModelLoadProgress(null);
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
            setModelLoadProgress(null);
            if (activeChatJobIdRef.current === jobId) activeChatJobIdRef.current = null;
          }
        },
      });
      activeChatJobIdRef.current = jobId;
    },
    [
      activeConversationId,
      activeProjectId,
      addMessagePair,
      agentMode,
      agentProjectPath,
      appendStreamingContent,
      appendStreamingReasoning,
      chatMode,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      createConversation,
      resolvedContextLength,
      resolvedReservedOutputTokens,
      setModelLoadProgress,
      selectedModel,
      selectedProvider,
      startAgentSession,
      supportsImages,
      effectiveWebSearchEnabled,
    ],
  );

  useEffect(() => {
    const handleInlineDocumentEdit = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt) return;
      void handleSend(prompt);
    };

    window.addEventListener("veyra:inline-document-edit", handleInlineDocumentEdit);
    return () => window.removeEventListener("veyra:inline-document-edit", handleInlineDocumentEdit);
  }, [handleSend]);

  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      if (mode === "research") {
        setActiveNav("research");
        return;
      }
      setChatMode(mode);
    },
    [setActiveNav],
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

  const handleEditMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      if (!message || message.role !== "user") return;
      setEditingMessageId(messageId);
    },
    [activeConversationId],
  );

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const handleEditSave = useCallback(
    (messageId: string, newContent: string) => {
      if (!activeConversationId) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      updateMessage(activeConversationId, messageId, trimmed);
      truncateAfterMessage(activeConversationId, messageId);
      setEditingMessageId(null);

      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!conversation) return;

      const lastMsg = conversation.messages[conversation.messages.length - 1];
      if (lastMsg?.role !== "user") return;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId: selectedModel,
      };

      const liveConversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!liveConversation) return;

      const updatedMessages = [...liveConversation.messages, assistantMessage];
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages: updatedMessages, updatedAt: Date.now() }
            : c,
        ),
        streamingBuffer: {
          conversationId: activeConversationId,
          messageId: assistantMessage.id,
          content: "",
          reasoning: "",
        },
      }));
      void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) =>
        saveConversationSnapshot(useChatStore.getState().conversations),
      );

      const previousResponseId = liveConversation.lmResponseId;
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");

      aiScheduler.abortActiveBackgroundJob();

      const memoryEnabled = useSettingsStore.getState().defaultMemoryEnabled;

      const jobId = aiScheduler.enqueueAiJob({
        type: "user_chat",
        priority: 0,
        title: "Regenerating response",
        description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
        prompt: trimmed,
        conversationId: activeConversationId,
        model: selectedModel,
        run: async (signal) => {
          try {
            await ensureProviderReady();

            return await executeChatSend({
              conversationId: activeConversationId,
              userMessage: lastMsg,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              webSearchEnabled: effectiveWebSearchEnabled,
              projectId: activeProjectId ?? undefined,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(activeConversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(activeConversationId, assistantMessage.id, chunk);
              },
              onModelLoadProgress: (phase: string, percent?: number) => {
                setModelLoadProgress(
                  phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                );
              },
              onError: (error) => {
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  content: `Error: ${error}`,
                });
                clearStreamingBuffer();
                setModelLoadProgress(null);
                setRequestStatus("error");
                setStreamingMessageId(null);
              },
              onComplete: (result, context) => {
                if (useChatStore.getState().isBufferClearSkipped()) return;
                setModelLoadProgress(null);
                const memoryPack = context?.memoryPack ?? null;
                const memoryRetrieval = context?.memoryRetrieval;
                const webSearchSources = context?.webSearchSources;
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
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
              commitAssistantMessage(activeConversationId, assistantMessage.id, {
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
            setModelLoadProgress(null);
            if (activeChatJobIdRef.current === jobId) activeChatJobIdRef.current = null;
          }
        },
      });
      activeChatJobIdRef.current = jobId;
    },
    [
      activeConversationId,
      activeProjectId,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      effectiveWebSearchEnabled,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
      truncateAfterMessage,
      updateMessage,
    ],
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!conversation) return;

      const msgIndex = conversation.messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0 || conversation.messages[msgIndex].role !== "assistant") return;
      if (msgIndex === 0) return;

      const userMsg = conversation.messages[msgIndex - 1];
      if (userMsg.role !== "user") return;

      removeLastMessagePair(activeConversationId);

      const trimmed = userMsg.content.trim();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId: selectedModel,
      };

      const liveConversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      if (!liveConversation) return;

      const updatedMessages = [...liveConversation.messages, assistantMessage];
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages: updatedMessages, updatedAt: Date.now() }
            : c,
        ),
        streamingBuffer: {
          conversationId: activeConversationId,
          messageId: assistantMessage.id,
          content: "",
          reasoning: "",
        },
      }));
      void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) =>
        saveConversationSnapshot(useChatStore.getState().conversations),
      );

      const previousResponseId = liveConversation.lmResponseId;
      setStreamingMessageId(assistantMessage.id);
      setRequestStatus("streaming");

      aiScheduler.abortActiveBackgroundJob();

      const memoryEnabled = useSettingsStore.getState().defaultMemoryEnabled;

      const jobId = aiScheduler.enqueueAiJob({
        type: "user_chat",
        priority: 0,
        title: "Regenerating response",
        description: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed,
        prompt: trimmed,
        conversationId: activeConversationId,
        model: selectedModel,
        run: async (signal) => {
          try {
            await ensureProviderReady();

            return await executeChatSend({
              conversationId: activeConversationId,
              userMessage: userMsg,
              assistantMessage,
              trimmed,
              previousResponseId,
              selectedProvider,
              selectedModel,
              memoryEnabled,
              webSearchEnabled: effectiveWebSearchEnabled,
              projectId: activeProjectId ?? undefined,
              signal,
              onChunk: (chunk) => {
                if (chunk) appendStreamingContent(activeConversationId, assistantMessage.id, chunk);
              },
              onReasoningChunk: (chunk) => {
                if (chunk) appendStreamingReasoning(activeConversationId, assistantMessage.id, chunk);
              },
              onModelLoadProgress: (phase: string, percent?: number) => {
                setModelLoadProgress(
                  phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent },
                );
              },
              onError: (error) => {
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
                  content: `Error: ${error}`,
                });
                clearStreamingBuffer();
                setModelLoadProgress(null);
                setRequestStatus("error");
                setStreamingMessageId(null);
              },
              onComplete: (result, context) => {
                if (useChatStore.getState().isBufferClearSkipped()) return;
                setModelLoadProgress(null);
                const memoryPack = context?.memoryPack ?? null;
                const memoryRetrieval = context?.memoryRetrieval;
                const webSearchSources = context?.webSearchSources;
                commitAssistantMessage(activeConversationId, assistantMessage.id, {
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
              commitAssistantMessage(activeConversationId, assistantMessage.id, {
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
            setModelLoadProgress(null);
            if (activeChatJobIdRef.current === jobId) activeChatJobIdRef.current = null;
          }
        },
      });
      activeChatJobIdRef.current = jobId;
    },
    [
      activeConversationId,
      activeProjectId,
      appendStreamingContent,
      appendStreamingReasoning,
      clearStreamingBuffer,
      clearStreamingBufferUnlessSkipped,
      commitAssistantMessage,
      effectiveWebSearchEnabled,
      removeLastMessagePair,
      selectedModel,
      selectedProvider,
      setModelLoadProgress,
    ],
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      handleRegenerate(messageId);
    },
    [handleRegenerate],
  );

  const handleCopyMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      if (!message) return;
      void navigator.clipboard.writeText(message.content);
    },
    [activeConversationId],
  );

  const handleForkMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      forkConversation(activeConversationId, messageId);
    },
    [activeConversationId, forkConversation],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      deleteMessage(activeConversationId, messageId);
    },
    [activeConversationId, deleteMessage],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <ShutdownOverlay />
      <ConnectivityToastHost />
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
          hidden={!isChatMode || activeNav === "projects"}
        />
        <div className={`flex min-w-0 flex-1 basis-0 ${isChatMode && activeNav !== "projects" ? "hidden" : ""}`}>
          <Suspense fallback={null}>
            {activeNav === "memory" && <MemoryPage />}
            {activeNav === "projects" && <ProjectsPage />}
            {activeNav === "research" && <ResearchPage />}
            {activeNav === "email" && <EmailPage />}
            {activeNav === "characters" && <CharacterPage />}
            {activeNav === "settings" && <SettingsPage />}
          </Suspense>
        </div>
        {isChatMode && activeNav !== "projects" && hydrationState === "loading" && <ChatHydrationSkeleton />}
        {isChatMode && activeNav !== "projects" && hydrationState === "ready" && (
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
            modelLoadProgress={modelLoadProgress}
            mode={chatMode}
            onModeChange={handleModeChange}
            agentSessions={agentSessions}
            activeAgentSessionId={activeAgentSessionId}
            agentRuntimeAvailable={agentRuntimeAvailable}
            agentMode={agentMode}
            agentProjectPath={agentProjectPath}
            onAgentModeChange={setAgentMode}
            onAgentProjectPathChange={setAgentProjectPath}
            onAgentRuntimeCheck={() => void checkAgentRuntime()}
            onAgentNewSession={newAgentSession}
            onAgentSessionSelect={handleAgentSessionSelect}
            onAgentSessionStop={stopAgentSession}
            onAgentSessionDelete={(id) => void deleteAgentSession(id)}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
            onRetry={handleRetry}
            onCopyMessage={handleCopyMessage}
            onForkMessage={handleForkMessage}
            onDeleteMessage={handleDeleteMessage}
            editingMessageId={editingMessageId}
            editInitialValue={
              editingMessageId
                ? activeConversation?.messages.find((m) => m.id === editingMessageId)?.content ?? ""
                : undefined
            }
            onEditCancel={handleEditCancel}
            onEditSave={handleEditSave}
          />
        )}
        {isChatMode && activeNav !== "projects" && <DocEditorPanel />}
        <RightPanel
          contextStats={displayContextStats}
          collapsed={rightPanelCollapsed}
          onCollapsedChange={setRightPanelCollapsed}
          hidden={!isChatMode && chatMode !== "agents" && activeNav !== "projects"}
          webSearchEnabled={webSearchEnabled}
          onWebSearchChange={setWebSearchEnabled}
          webSearchDisabled={webSearchDisabled}
          webSearchDisabledReason={webSearchAvailability.reason}
          isAgentsMode={chatMode === "agents"}
          agentSessionCount={agentSessions.length}
          agentActiveCount={agentSessions.filter((s) => s.status === "running").length}
          onAgentClearSessions={clearAgentSessions}
        />
      </div>
    </div>
  );
}

export default App;
