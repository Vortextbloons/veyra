import { useCallback, useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { PrimarySidebar } from "@/components/primary-sidebar";
import { RecentChats } from "@/components/recent-chats";
import { ChatPanel } from "@/components/chat-panel";
import { RightPanel } from "@/components/right-panel";
import type {
  Conversation,
  ModelInfo,
  ProviderInfo,
  RequestStatus,
  ContextStats,
  RecentChatsItem,
} from "@/lib/chat-types";
import { buildChatContext, getContextStats } from "@/lib/context";
import { fetchModels, isServerRunning, sendLmStudioChat } from "@/lib/lm-studio";

// ── Zoom helpers ───────────────────────────────────────────────────────────

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
    // Treat saved 100% as legacy default — bump to the new default zoom
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

// ── Persistence helpers ────────────────────────────────────────────────────

const STORAGE_KEY = "veyra.conversations";

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

// ── App ────────────────────────────────────────────────────────────────────

function App() {
  const [activeNav, setActiveNav] = useState("chat");
  const [zoom, setZoom] = useState<number>(loadZoom);

  // Chat state
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return loadConversations();
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    const loaded = loadConversations();
    return loaded.length > 0 ? loaded[0].id : null;
  });
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([
    { id: "lm-studio", name: "LM Studio", icon: "local", status: "disconnected" },
  ]);
  const [selectedProvider, setSelectedProvider] = useState<string>("lm-studio");
  const [recentChatsCollapsed, setRecentChatsCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const sidebarsCollapsed =
    (recentChatsCollapsed ? 1 : 0) + (rightPanelCollapsed ? 1 : 0);

  const abortRef = useRef<AbortController | null>(null);

  // ── Zoom ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    applyZoom(zoom);
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // storage full or unavailable — silently ignore
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

  // ── Initialization ───────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const running = await isServerRunning();
      setProviders((prev) =>
        prev.map((p) =>
          p.id === "lm-studio"
            ? { ...p, status: running ? "connected" : "disconnected" }
            : p,
        ),
      );

      if (running) {
        const fetchedModels = await fetchModels();
        setModels(fetchedModels);
        if (fetchedModels.length > 0 && !selectedModel) {
          setSelectedModel(fetchedModels[0].id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist on change (debounced) ────────────────────────────────────────

  useEffect(() => {
    const id = setTimeout(() => {
      if (conversations.length === 0) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // storage unavailable — silently ignore
        }
      } else {
        saveConversations(conversations);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [conversations]);

  // ── Derived state ────────────────────────────────────────────────────────

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  const contextStats: ContextStats | undefined = activeConversation
    ? getContextStats(activeConversation.messages)
    : undefined;

  const recentChats: RecentChatsItem[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    meta: new Date(c.updatedAt).toLocaleDateString(),
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleProviderChange = useCallback(async (providerId: string) => {
    setSelectedProvider(providerId);
    setSelectedModel("");
    setModels([]);

    if (providerId === "lm-studio") {
      const running = await isServerRunning();
      setProviders((prev) =>
        prev.map((p) =>
          p.id === "lm-studio"
            ? { ...p, status: running ? "connected" : "disconnected" }
            : p,
        ),
      );
      if (running) {
        const fetchedModels = await fetchModels();
        setModels(fetchedModels);
        if (fetchedModels.length > 0) {
          setSelectedModel(fetchedModels[0].id);
        }
      }
    }
  }, []);

  const handleNewChat = useCallback(() => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: "New conversation",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(id);
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeConversationId && abortRef.current) {
        abortRef.current.abort();
        setRequestStatus("idle");
        setStreamingMessageId(null);
      }

      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          setActiveConversationId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [activeConversationId],
  );

  const handleDeleteAllChats = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setRequestStatus("idle");
    setStreamingMessageId(null);
    setConversations([]);
    setActiveConversationId(null);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      // Ensure we have a conversation
      let convId = activeConversationId;
      if (!convId) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const conv: Conversation = {
          id,
          title: "New conversation",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(id);
        convId = id;
      }

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      const userMessage = {
        id: userMsgId,
        role: "user" as const,
        content: text,
        timestamp: Date.now(),
      };

      const assistantMessage = {
        id: assistantMsgId,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
      };

      // Add user + placeholder assistant message
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== convId) return conv;
          const isFirstUser = conv.messages.filter((m) => m.role === "user").length === 0;
          return {
            ...conv,
            title: isFirstUser ? text.slice(0, 50) : conv.title,
            messages: [...conv.messages, userMessage, assistantMessage],
            updatedAt: Date.now(),
          };
        }),
      );

      setStreamingMessageId(assistantMsgId);
      setRequestStatus("streaming");

      // Build context from messages so far
      const activeConv = conversations.find((c) => c.id === convId);
      const contextMessages = buildChatContext([
        ...(activeConv?.messages ?? []),
        userMessage,
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      sendLmStudioChat({
        messages: contextMessages,
        model: selectedModel,
        previousResponseId: activeConv?.lmResponseId,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (!chunk) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== convId) return conv;
              return {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + chunk }
                    : msg,
                ),
                updatedAt: Date.now(),
              };
            }),
          );
        },
        onReasoningChunk: (chunk) => {
          if (!chunk) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== convId) return conv;
              return {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, reasoning: (msg.reasoning ?? "") + chunk }
                    : msg,
                ),
                updatedAt: Date.now(),
              };
            }),
          );
        },
        onError: (error) => {
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== convId) return conv;
              return {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: `Error: ${error}` }
                    : msg,
                ),
                updatedAt: Date.now(),
              };
            }),
          );
          setRequestStatus("error");
          setStreamingMessageId(null);
        },
        onComplete: (result) => {
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== convId) return conv;
              return {
                ...conv,
                lmResponseId: result.responseId ?? conv.lmResponseId,
                messages: conv.messages.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, performance: result.performance }
                    : msg,
                ),
                updatedAt: Date.now(),
              };
            }),
          );
        },
      }).then(() => {
        setRequestStatus("idle");
        setStreamingMessageId(null);
      });
    },
    [activeConversationId, conversations, selectedModel],
  );

  // ── Render ───────────────────────────────────────────────────────────────

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
          onSelect={handleSelectChat}
          onDelete={handleDeleteChat}
          onDeleteAll={handleDeleteAllChats}
          collapsed={recentChatsCollapsed}
          onCollapsedChange={setRecentChatsCollapsed}
        />
        <ChatPanel
          title={activeConversation?.title}
          messages={activeConversation?.messages ?? []}
          onSend={handleSend}
          isStreaming={requestStatus === "streaming"}
          streamingMessageId={streamingMessageId}
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderChange={handleProviderChange}
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
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
