import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Folder, PencilLine } from "lucide-react";
import type { ChatMode, ChatPanelProps } from "@/modules/chat/chat-types";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { ModelLoadingBar } from "@/components/model-loading-bar";
import { AgentComposer } from "@/modules/agents/components/agent-composer";
import { AgentsPanel } from "@/modules/agents/components/agents-panel";
import { Composer } from "@/modules/chat/components/composer";
import { ContextMeterButton } from "@/modules/chat/components/context-meter";
import { MessageBubble } from "@/modules/chat/components/message-bubble";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { resolvePendingQuestion } from "@/modules/chat/tools/ask-question-tool";

const VIRTUALIZE_AFTER_MESSAGES = 80;
const ESTIMATED_MESSAGE_HEIGHT = 180;
const MESSAGE_OVERSCAN = 8;

function chatLayoutClasses(sidebarsCollapsed: number) {
  const wide = sidebarsCollapsed >= 1;
  return {
    messagesPx: wide ? "px-4" : "px-5",
    messageText: "text-[15px]",
    userMaxW: wide ? "max-w-[88%]" : "max-w-[85%]",
    composerText: wide ? "text-[14.5px]" : "text-[14px]",
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
  contextStats,
  contextBreakdown,
  webSearchEnabled = false,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  codeExecutionEnabled = false,
  onCodeExecutionChange,
  codeExecutionDisabled = false,
  codeExecutionDisabledReason,
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
  onStop,
}: ChatPanelProps) {
  const reasoningEnabled = useSettingsStore((s) => s.reasoningEnabled);
  const setReasoningEnabled = useSettingsStore((s) => s.setReasoningEnabled);
  const enhancedModeEnabled = useSettingsStore((s) => s.enhancedModeEnabled);
  const setEnhancedModeEnabled = useSettingsStore((s) => s.setEnhancedModeEnabled);
  const streamingBuffer = useChatStore((s) => s.streamingBuffer);
  const [internalMode, setInternalMode] = useState<ChatMode>(defaultMode);
  const [suggestedPrompt, setSuggestedPrompt] = useState("");
  const [agentSuggestion, setAgentSuggestion] = useState({ text: "", id: "" });
  const mode = controlledMode ?? internalMode;
  const agentSessionRunning = mode === "agents" && agentSessions.some((session) => session.status === "running" && session.projectPath === agentProjectPath);
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
  const isEmptyChat = mode !== "agents" && messages.length === 0;
  if (mode === "agents") {
    const running = agentSessions.find((session) => session.projectPath === agentProjectPath && session.status === "running");
    return <AgentsPanel
      sessions={agentSessions} activeSessionId={activeAgentSessionId}
      runtimeAvailable={agentRuntimeAvailable} mode={agentMode} projectPath={agentProjectPath}
      onProjectPathChange={(path) => onAgentProjectPathChange?.(path)}
      onCheckRuntime={() => onAgentRuntimeCheck?.()} onNewSession={() => onAgentNewSession?.()}
      onSelectSession={(id) => onAgentSessionSelect?.(id)} onStopSession={(id) => onAgentSessionStop?.(id)}
      onDeleteSession={(id) => onAgentSessionDelete?.(id)} onSuggestion={(text) => setAgentSuggestion({ text, id: crypto.randomUUID() })}
      connection={<ProviderConnectionBanner provider={currentProvider ?? null} phase={providerConnectionPhase} error={providerConnectionError} onReconnect={() => onProviderReconnect?.()} onStartServer={() => onProviderStartServer?.()} />}
      composer={<>
        {modelLoadProgress && modelLoadProgress.phase !== "ready" && <div className="px-6 pt-2"><ModelLoadingBar progress={modelLoadProgress} /></div>}
        <AgentComposer projectPath={agentProjectPath} draftKey={agentProjectPath + ":" + (activeAgentSessionId ?? "new")}
          mode={agentMode} onModeChange={(next) => onAgentModeChange?.(next)}
          onSend={onSend} onStop={() => { if (running) onAgentSessionStop?.(running.id); }}
          busy={Boolean(running)} unavailable={agentRuntimeAvailable !== true || !selectedModel}
          suggestion={agentSuggestion}
          controls={<><ProviderSelector value={selectedProvider} providers={providers} onChange={onProviderChange} connectionPhase={providerConnectionPhase} onReconnect={(id) => onProviderReconnect?.(id)} onStartServer={(id) => onProviderStartServer?.(id)} /><ModelSelector value={selectedModel} models={selectorModels} onChange={onModelChange} onToggleFavorite={onToggleFavorite} /></>}
        />
      </>}
    />;
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {isEmptyChat && <header className="flex h-16 shrink-0 items-center justify-center px-4">
        {titleAccessory}
      </header>}
      {!isEmptyChat && <header className="flex h-14 shrink-0 items-center gap-2 bg-[var(--color-bg)] px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-medium tracking-tight text-[var(--color-text-dim)]">{title}</h1>
        </div>
        {titleAccessory}
      </header>}

      <ProviderConnectionBanner
        provider={currentProvider ?? null}
        phase={providerConnectionPhase}
        error={providerConnectionError}
        onReconnect={() => onProviderReconnect?.()}
        onStartServer={() => onProviderStartServer?.()}
      />

      <div className="relative flex min-h-0 flex-1">
      <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto ${isEmptyChat ? "justify-end" : ""}`}
        >
          {messages.length === 0 ? (
          <div className="relative z-10 px-6 pb-8 pt-8 text-center">
            <h2 className="text-[clamp(24px,3vw,32px)] font-normal leading-tight tracking-tight text-[var(--color-text)]">What’s on your mind today?</h2>
          </div>
        ) : (
          <div
            className={`relative z-10 mx-auto flex w-full max-w-[1100px] flex-col gap-7 pb-8 pt-6 transition-[padding] duration-200 ease-out ${layout.messagesPx}`}
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
      </div>

      <div
        className={`mx-auto w-full max-w-[1100px] shrink-0 bg-[var(--color-bg)] pb-3 pt-2 transition-[padding] duration-200 ease-out ${layout.footerPx}`}
      >
        {modelLoadProgress && modelLoadProgress.phase !== "ready" && (
          <div className="px-1 pb-2">
            <ModelLoadingBar progress={modelLoadProgress} />
          </div>
        )}
        <Composer
          reasoningEnabled={reasoningEnabled}
          onReasoningEnabledChange={setReasoningEnabled}
          enhancedMode={enhancedModeEnabled}
          onEnhancedModeChange={setEnhancedModeEnabled}
          mode={mode}
          onModeChange={handleModeChange}
          suggestedPrompt={suggestedPrompt}
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
          contextIndicator={
            contextStats || contextBreakdown ? (
              <ContextMeterButton stats={contextStats} breakdown={contextBreakdown} />
            ) : undefined
          }
          webSearchEnabled={webSearchEnabled}
          onWebSearchChange={onWebSearchChange}
          webSearchDisabled={webSearchDisabled}
          webSearchDisabledReason={webSearchDisabledReason}
          codeExecutionEnabled={codeExecutionEnabled}
          onCodeExecutionChange={onCodeExecutionChange}
          codeExecutionDisabled={codeExecutionDisabled}
          codeExecutionDisabledReason={codeExecutionDisabledReason}
          onSend={onSend}
          onStop={onStop}
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
        {!isEmptyChat && <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-[var(--color-muted)]">
          <span>
            <span className="font-mono">↵</span> to send
          </span>
          <span>
            <span className="font-mono">⇧</span> +{" "}
            <span className="font-mono">↵</span> for new line
          </span>
        </div>}
      </div>
      {isEmptyChat && <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        <EmptyChat disabled={isStreaming || !onSend} onSuggestion={setSuggestedPrompt} />
      </div>}
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
    { icon: FileText, text: "Summarize the document I’m working on" },
    { icon: Folder, text: "Help me plan my next project milestone" },
    { icon: PencilLine, text: "Turn my notes into a clear first draft" },
  ];
  return (
    <div className="mx-auto w-full max-w-[1052px]">
        <div className="flex flex-col items-start gap-1">
          {suggestions.map((s) => (
            <button
              key={s.text}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(s.text)}
              className="group flex min-h-12 max-w-full items-center gap-4 rounded-xl px-4 py-2 text-left text-[14px] leading-snug text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <s.icon className="size-[18px] shrink-0 text-[var(--color-muted)]" />
              <span>{s.text}</span>

            </button>
          ))}
        </div>
    </div>
  );
}
