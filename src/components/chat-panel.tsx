import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bell,
  MoreHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import type { ChatMode, ChatPanelProps } from "@/lib/chat-types";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { ModelLoadingBar } from "@/components/model-loading-bar";
import { AgentsPanel } from "@/modules/agents/components/agents-panel";
import { Composer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";

function chatLayoutClasses(sidebarsCollapsed: number) {
  const wide = sidebarsCollapsed >= 1;
  const widest = sidebarsCollapsed >= 2;
  return {
    messagesPx: widest ? "pl-3 pr-4" : wide ? "pl-4 pr-6" : "pl-5 pr-8",
    messageText: widest ? "text-[14.5px]" : wide ? "text-[14px]" : "text-[13px]",
    userMaxW: widest ? "max-w-[92%]" : wide ? "max-w-[88%]" : "max-w-[85%]",
    composerText: widest ? "text-[15px]" : wide ? "text-[14.5px]" : "text-[14px]",
    footerPx: wide ? "px-3" : "px-4",
  };
}

export function ChatPanel({
  title = "New conversation",
  messages = [],
  onSend,
  isStreaming = false,
  streamingMessageId = null,
  providers = [],
  selectedProvider = "",
  onProviderChange,
  providerConnectionPhase = "idle",
  providerConnectionError = null,
  onProviderReconnect,
  onProviderStartServer,
  models = [],
  selectedModel = "",
  onModelChange,
  favoriteModels = [],
  onToggleFavorite,
  supportsImages = false,
  defaultMemoryEnabled = true,
  onTriggerMemoryExtraction,
  sidebarsCollapsed = 0,
  modelLoadProgress,
  mode: controlledMode,
  defaultMode = "chat",
  onModeChange,
  agentSessions = [],
  activeAgentSessionId = null,
  agentRuntimeAvailable = null,
  agentMode = "plan",
  agentProjectPath = "",
  onAgentModeChange,
  onAgentProjectPathChange,
  onAgentRuntimeCheck,
  onAgentNewSession,
  onAgentSessionSelect,
  onAgentSessionStop,
  onAgentSessionDelete,
}: ChatPanelProps) {
  const [memory, setMemory] = useState(defaultMemoryEnabled);
  const [showReasoning, setShowReasoning] = useState(true);
  const [internalMode, setInternalMode] = useState<ChatMode>(defaultMode);
  const mode = controlledMode ?? internalMode;

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const providerLabel = currentProvider?.name ?? "LM Studio";
  const providerStatus = currentProvider?.status ?? "disconnected";

  const layout = chatLayoutClasses(sidebarsCollapsed);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  useLayoutEffect(() => {
    if (isStreaming) {
      stickToBottomRef.current = true;
      scrollMessagesToBottom("auto");
    }
  }, [isStreaming, streamingMessageId, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (messages.length === 0) {
      prevMessageCountRef.current = 0;
      return;
    }

    if (messages.length > prevMessageCountRef.current) {
      stickToBottomRef.current = true;
    }
    prevMessageCountRef.current = messages.length;

    if (stickToBottomRef.current) {
      scrollMessagesToBottom("auto");
    }
  }, [messages, scrollMessagesToBottom]);

  const selectorModels: Model[] = useMemo(() => {
    const favoriteSet = new Set(favoriteModels);
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: providerLabel,
      contextWindow: m.contextWindow,
      size: m.size,
      isFavorite: favoriteSet.has(m.id),
      supportsImages: m.supportsImages,
    }));
  }, [favoriteModels, models, providerLabel]);

  const handleModeChange = useCallback(
    (nextMode: ChatMode) => {
      if (controlledMode === undefined) setInternalMode(nextMode);
      onModeChange?.(nextMode);
    },
    [controlledMode, onModeChange],
  );

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] pl-4 pr-5">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderSelector
            value={selectedProvider}
            providers={providers}
            onChange={onProviderChange}
            connectionPhase={providerConnectionPhase}
            onReconnect={(id) => onProviderReconnect?.(id)}
            onStartServer={(id) => onProviderStartServer?.(id)}
          />

          <ModelSelector
            value={selectedModel}
            models={selectorModels}
            onChange={onModelChange}
            onToggleFavorite={onToggleFavorite}
          />
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
            providerConnectionPhase === "connecting"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
              : providerStatus === "connected"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/20 bg-red-500/10 text-red-300"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              providerConnectionPhase === "connecting"
                ? "animate-pulse bg-amber-400"
                : providerStatus === "connected"
                  ? "bg-emerald-400"
                  : "bg-red-400"
            }`}
          />
          {providerConnectionPhase === "connecting"
            ? "Connecting…"
            : providerStatus === "connected"
              ? "Connected"
              : "Disconnected"}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Notifications"
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <Bell className="size-4" />
          </button>
          <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white">
            U
          </div>
        </div>
      </header>

      <ProviderConnectionBanner
        provider={currentProvider ?? null}
        phase={providerConnectionPhase}
        error={providerConnectionError}
        onReconnect={() => onProviderReconnect?.()}
        onStartServer={() => onProviderStartServer?.()}
      />

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] pl-4 pr-5">
        <h1 className="text-[14px] font-medium tracking-tight">{title}</h1>
        <div className="flex items-center gap-1">
          <button
            aria-label="More"
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <MoreHorizontal className="size-4" />
          </button>
          <button
            aria-label="Star"
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <Star className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={messagesScrollRef}
        onScroll={handleMessagesScroll}
        className="relative flex flex-1 flex-col overflow-y-auto"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-32 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_70%)]"
        />
        {mode === "agents" ? (
          <AgentsPanel
            sessions={agentSessions}
            activeSessionId={activeAgentSessionId}
            runtimeAvailable={agentRuntimeAvailable}
            mode={agentMode}
            projectPath={agentProjectPath}
            onModeChange={(nextMode) => onAgentModeChange?.(nextMode)}
            onProjectPathChange={(path) => onAgentProjectPathChange?.(path)}
            onCheckRuntime={() => onAgentRuntimeCheck?.()}
            onNewSession={() => onAgentNewSession?.()}
            onSelectSession={(id) => onAgentSessionSelect?.(id)}
            onStopSession={(id) => onAgentSessionStop?.(id)}
            onDeleteSession={(id) => onAgentSessionDelete?.(id)}
          />
        ) : messages.length === 0 ? (
          <div className="relative z-10 flex flex-1 items-start px-6 pt-12">
            <EmptyChat />
          </div>
        ) : (
          <div
            className={`relative z-10 flex w-full flex-col gap-5 pb-6 pt-5 transition-[padding] duration-200 ease-out ${layout.messagesPx}`}
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isStreaming={m.id === streamingMessageId}
                showReasoning={showReasoning}
                layout={layout}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={`shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] pb-3 pt-2.5 transition-[padding] duration-200 ease-out ${layout.footerPx}`}
      >
        {modelLoadProgress && modelLoadProgress.phase !== "ready" && (
          <div className="px-1 pb-2">
            <ModelLoadingBar progress={modelLoadProgress} />
          </div>
        )}
            <Composer
              memory={memory}
              onMemoryChange={setMemory}
              onTriggerMemoryExtraction={onTriggerMemoryExtraction}
              showReasoning={showReasoning}
          onShowReasoningChange={setShowReasoning}
          mode={mode}
          onModeChange={handleModeChange}
          onSend={onSend}
          disabled={isStreaming}
          supportsImages={supportsImages}
          composerTextClass={layout.composerText}
        />
        <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-[var(--color-text-dim)]">
          <span>
            <span className="font-mono">↵</span> to send
          </span>
          <span>
            <span className="font-mono">⇧</span> +{" "}
            <span className="font-mono">↵</span> for new line
          </span>
        </div>
      </div>
    </main>
  );
}

function EmptyChat() {
  const suggestions = [
    "Explain a concept I'm curious about",
    "Help me draft a message",
    "Summarize a long document",
    "Brainstorm ideas for a project",
  ];
  return (
    <div className="w-full">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-400/20">
        <Sparkles className="size-6" />
      </div>
      <h2 className="text-[18px] font-semibold tracking-tight text-white">
        Start a conversation
      </h2>
      <p className="mt-1.5 text-[12.5px] text-[var(--color-text-dim)]">
        Ask anything — the model will respond here.
      </p>
      <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2.5 text-left text-[12px] leading-snug text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-white/[0.03] hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
