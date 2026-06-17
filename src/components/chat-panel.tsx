import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bell,
  Sparkles,
} from "lucide-react";
import type { ChatMode, ChatPanelProps } from "@/lib/chat-types";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { ModelLoadingBar } from "@/components/model-loading-bar";
import { AgentsPanel } from "@/modules/agents/components/agents-panel";
import { Composer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useSettingsStore } from "@/stores/settings-store";

const VIRTUALIZE_AFTER_MESSAGES = 80;
const ESTIMATED_MESSAGE_HEIGHT = 180;
const MESSAGE_OVERSCAN = 8;

function chatLayoutClasses(sidebarsCollapsed: number) {
  const wide = sidebarsCollapsed >= 1;
  const widest = sidebarsCollapsed >= 2;
  return {
    messagesPx: widest ? "px-3" : wide ? "px-4" : "px-5",
    messageText: widest ? "text-[14.5px]" : wide ? "text-[14px]" : "text-[13px]",
    userMaxW: widest ? "max-w-[92%]" : wide ? "max-w-[88%]" : "max-w-[85%]",
    composerText: widest ? "text-[15px]" : wide ? "text-[14.5px]" : "text-[14px]",
    footerPx: wide ? "px-3" : "px-4",
  };
}

export function ChatPanel({
  title = "New conversation",
  titleAccessory,
  headerActions,
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
  onEditMessage,
  onRegenerate,
  onRetry,
  onCopyMessage,
  onForkMessage,
  onDeleteMessage,
  editingMessageId,
  editInitialValue,
  onEditCancel,
  onEditSave,
}: ChatPanelProps) {
  const [memory, setMemory] = useState(defaultMemoryEnabled);
  const reasoningEnabled = useSettingsStore((s) => s.reasoningEnabled);
  const setReasoningEnabled = useSettingsStore((s) => s.setReasoningEnabled);
  const [internalMode, setInternalMode] = useState<ChatMode>(defaultMode);
  const mode = controlledMode ?? internalMode;
  const agentSessionRunning = mode === "agents" && agentSessions.some((session) => session.status === "running");
  const agentComposerInputDisabled =
    mode === "agents" &&
    (agentRuntimeAvailable !== true || agentSessionRunning);
  const agentComposerControlsDisabled = isStreaming || agentSessionRunning;

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const providerLabel = currentProvider?.name ?? "LM Studio";
  const providerStatus = currentProvider?.status ?? "disconnected";

  const layout = chatLayoutClasses(sidebarsCollapsed);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });

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
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, []);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, [messages.length, mode]);

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

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const shouldVirtualizeMessages =
    mode !== "agents" && !isStreaming && messages.length > VIRTUALIZE_AFTER_MESSAGES;
  const visibleMessageWindow = useMemo(() => {
    if (!shouldVirtualizeMessages) {
      return { items: messages, before: 0, after: 0 };
    }
    const first = Math.max(
      0,
      Math.floor(scrollState.top / ESTIMATED_MESSAGE_HEIGHT) - MESSAGE_OVERSCAN,
    );
    const visibleCount = Math.ceil(scrollState.height / ESTIMATED_MESSAGE_HEIGHT) + MESSAGE_OVERSCAN * 2;
    const last = Math.min(messages.length, first + visibleCount);
    return {
      items: messages.slice(first, last),
      before: first * ESTIMATED_MESSAGE_HEIGHT,
      after: Math.max(0, (messages.length - last) * ESTIMATED_MESSAGE_HEIGHT),
    };
  }, [messages, scrollState.height, scrollState.top, shouldVirtualizeMessages]);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
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

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[14px] font-medium tracking-tight">{title}</h1>
          {titleAccessory}
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
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
          <div className="relative z-10 flex flex-1 items-center justify-center px-6">
            <EmptyChat />
          </div>
        ) : (
          <div
            className={`relative z-10 flex w-full flex-col gap-5 pb-6 pt-5 transition-[padding] duration-200 ease-out ${layout.messagesPx}`}
          >
            {visibleMessageWindow.before > 0 && (
              <div aria-hidden style={{ height: visibleMessageWindow.before }} />
            )}
            {visibleMessageWindow.items.map((m) => (
              <div key={m.id} style={{ contentVisibility: "auto", containIntrinsicSize: "0 180px" }}>
                <MessageBubble
                  message={m}
                  isStreaming={m.id === streamingMessageId}
                  layout={layout}
                  isLastAssistant={m.id === lastAssistantId}
                  onEdit={onEditMessage}
                  onRegenerate={onRegenerate}
                  onRetry={onRetry}
                  onCopy={onCopyMessage}
                  onFork={onForkMessage}
                  onDelete={onDeleteMessage}
                />
              </div>
            ))}
            {visibleMessageWindow.after > 0 && (
              <div aria-hidden style={{ height: visibleMessageWindow.after }} />
            )}
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
          reasoningEnabled={reasoningEnabled}
          onReasoningEnabledChange={setReasoningEnabled}
          mode={mode}
          onModeChange={handleModeChange}
          onSend={onSend}
          disabled={isStreaming || agentComposerInputDisabled}
          controlsDisabled={agentComposerControlsDisabled}
          busy={isStreaming}
          supportsImages={supportsImages}
          composerTextClass={layout.composerText}
          editMessageId={editingMessageId}
          editInitialValue={editInitialValue}
          onEditCancel={onEditCancel}
          onEditSave={onEditSave}
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
    <div className="grid place-items-center text-center">
      <div>
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-400/20">
          <Sparkles className="size-6" />
        </div>
        <h2 className="text-[18px] font-semibold tracking-tight text-white">
          Start a conversation
        </h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-text-dim)]">
          Ask anything — the model will respond here.
        </p>
        <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-2">
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
    </div>
  );
}
