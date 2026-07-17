import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUpRight } from "lucide-react";
import type { ChatMode, ChatPanelProps } from "@/modules/chat/chat-types";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { ModelLoadingBar } from "@/components/model-loading-bar";
import { AgentsPanel } from "@/modules/agents/components/agents-panel";
import { Composer } from "@/modules/chat/components/composer";
import { MessageBubble } from "@/modules/chat/components/message-bubble";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { resolvePendingQuestion } from "@/modules/chat/tools/ask-question-tool";

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
  messages = [],
  onSend,
  supportsImages = false,
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
  const enhancedModeEnabled = useSettingsStore((s) => s.enhancedModeEnabled);
  const setEnhancedModeEnabled = useSettingsStore((s) => s.setEnhancedModeEnabled);
  const streamingBuffer = useChatStore((s) => s.streamingBuffer);
  const [internalMode, setInternalMode] = useState<ChatMode>(defaultMode);
  const mode = controlledMode ?? internalMode;
  const agentSessionRunning = mode === "agents" && agentSessions.some((session) => session.status === "running");
  const agentComposerInputDisabled =
    mode === "agents" &&
    (agentRuntimeAvailable !== true || agentSessionRunning);
  const agentComposerControlsDisabled = isStreaming || agentSessionRunning;

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const providerLabel = currentProvider?.name ?? "LM Studio";

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
    mode !== "agents" && messages.length > VIRTUALIZE_AFTER_MESSAGES;
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
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-medium tracking-tight text-[var(--color-text-dim)]">{title}</h1>
        </div>

        {titleAccessory}

      </header>

      <ProviderConnectionBanner
        provider={currentProvider ?? null}
        phase={providerConnectionPhase}
        error={providerConnectionError}
        onReconnect={() => onProviderReconnect?.()}
        onStartServer={() => onProviderStartServer?.()}
      />

        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className="relative flex flex-1 flex-col overflow-y-auto"
        >
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
          <div className="relative z-10 flex flex-1 items-center justify-center px-10">
            <EmptyChat
              disabled={isStreaming || !onSend}
              onSuggestion={(suggestion) => onSend?.(suggestion, [], { memoryEnabled: memory })}
            />
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
                  pendingQuestion={m.id === streamingMessageId ? streamingBuffer?.pendingQuestion : undefined}
                  onResolveQuestion={m.id === streamingMessageId ? resolvePendingQuestion : undefined}
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
          enhancedMode={enhancedModeEnabled}
          onEnhancedModeChange={setEnhancedModeEnabled}
          mode={mode}
          onModeChange={handleModeChange}
          selectorControls={
            <>
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
            </>
          }
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

function EmptyChat({
  disabled,
  onSuggestion,
}: {
  disabled: boolean;
  onSuggestion: (suggestion: string) => void;
}) {
  const suggestions = [
    "Summarize the document I am working on",
    "Help me plan my next project milestone",
    "Turn my notes into a clear first draft",
    "Compare options and explain the tradeoffs",
  ];
  return (
    <div className="w-full max-w-2xl">
      <div>
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Local workspace
        </p>
        <h2 className="max-w-xl text-[30px] font-semibold leading-tight tracking-[-0.035em] text-white">
          What are we working through?
        </h2>
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[var(--color-text-dim)]">
          Ask directly, bring in a document, or use memory and tools when the work needs more context.
        </p>
        <div className="mt-8 grid w-full grid-cols-2 gap-x-6 gap-y-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(s)}
              className="group flex min-h-12 items-center justify-between border-b border-[var(--color-border)] px-1 text-left text-[13px] leading-snug text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>{s}</span>
              <ArrowUpRight className="size-3.5 shrink-0 opacity-35 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
