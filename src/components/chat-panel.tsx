import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Check,
  MessageSquare,
  MoreHorizontal,
  Star,
  Send,
  Paperclip,
  AtSign,
  Sparkles,
  Bot,
  Loader2,
  Brain,
  X,
  ImageIcon,
} from "lucide-react";
import type { ChatMessage, ChatPanelProps, MessagePerformance } from "@/lib/chat-types";
import type { MemoryPack } from "@/lib/memory-types";
import {
  fileToAttachment,
  MAX_IMAGE_ATTACHMENTS,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { formatDuration, formatTokensPerSecond } from "@/lib/performance";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { Toggle } from "@/components/toggle";

type ChatMode = "chat" | "agents";

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
  sidebarsCollapsed = 0,
}: ChatPanelProps) {
  const [memory, setMemory] = useState(true);
  const [showReasoning, setShowReasoning] = useState(true);
  const [mode, setMode] = useState<ChatMode>("chat");

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const providerLabel = currentProvider?.name ?? "LM Studio";
  const providerStatus = currentProvider?.status ?? "disconnected";

  const layout = chatLayoutClasses(sidebarsCollapsed);

  const selectorModels: Model[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    provider: providerLabel,
    contextWindow: m.contextWindow,
    size: m.size,
    isFavorite: favoriteModels.includes(m.id),
    supportsImages: m.supportsImages,
  }));

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

      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-32 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_70%)]"
        />
        {messages.length === 0 ? (
          <div className="relative z-10 flex flex-1 items-center justify-center px-6">
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
        <Composer
          memory={memory}
          onMemoryChange={setMemory}
          showReasoning={showReasoning}
          onShowReasoningChange={setShowReasoning}
          mode={mode}
          onModeChange={setMode}
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

function MessageBubble({
  message,
  isStreaming,
  showReasoning,
  layout,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  showReasoning: boolean;
  layout: ReturnType<typeof chatLayoutClasses>;
}) {
  const isUser = message.role === "user";
  if (isUser) {
    return (
      <div className="flex flex-row-reverse gap-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white shadow-[0_0_0_2px_var(--color-bg)]">
          U
        </div>
        <div
          className={`flex min-w-0 flex-col items-end transition-[max-width] duration-200 ease-out ${layout.userMaxW}`}
        >
          <div
            className={`rounded-2xl rounded-tr-md border border-indigo-400/15 bg-[var(--color-accent-soft)] px-4 py-2.5 text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset transition-[font-size] duration-200 ease-out ${layout.messageText}`}
          >
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachmentsPreview attachments={message.attachments} />
            )}
            {message.content.trim() && (
              <p className="m-0 whitespace-pre-wrap leading-snug">
                {message.content.trim()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  const body = message.content.trim();
  const reasoning = message.reasoning?.trim() ?? "";
  const hasReasoning = reasoning.length > 0;
  const reasoningOnlyStreaming = isStreaming && hasReasoning && !body;
  const showReplyBubble = Boolean(body) || !reasoningOnlyStreaming || !showReasoning;
  const showPulseInReply = isStreaming && !reasoningOnlyStreaming;

  return (
    <div className="flex items-start gap-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_0_0_2px_var(--color-bg)]">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11.5px] leading-none">
          <span className="font-medium text-white">Assistant</span>
          <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
          <span className="text-[var(--color-text-dim)]">just now</span>
        </div>
        {showReasoning && hasReasoning && (
          <ReasoningBlock
            content={reasoning}
            isStreaming={reasoningOnlyStreaming}
            messageTextClass={layout.messageText}
          />
        )}
        {showReplyBubble && (
        <div
          className={`rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 text-[var(--color-text)] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset transition-[font-size] duration-200 ease-out ${layout.messageText}`}
        >
          <p className="m-0 whitespace-pre-wrap leading-snug">
            {body}
            {showPulseInReply && (
              <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-400 align-middle" />
            )}
          </p>
        </div>
        )}
        {!isStreaming && message.performance && (
          <MessagePerformanceBar performance={message.performance} />
        )}
        {!isStreaming && message.memoryPack && (
          <MemoryUsedBadge memoryPack={message.memoryPack} />
        )}
      </div>
    </div>
  );
}

function ReasoningBlock({
  content,
  isStreaming,
  messageTextClass,
}: {
  content: string;
  isStreaming: boolean;
  messageTextClass: string;
}) {
  return (
    <div
      className={`mb-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3.5 py-2.5 transition-[font-size] duration-200 ease-out ${messageTextClass}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-violet-300/80">
        <Brain className="size-3" />
        <span>Reasoning</span>
        {isStreaming && (
          <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-violet-400" />
        )}
      </div>
      <p className="m-0 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
        {content}
      </p>
    </div>
  );
}

function MessagePerformanceBar({
  performance,
}: {
  performance: MessagePerformance;
}) {
  const items = [
    {
      label: "Speed",
      value: formatTokensPerSecond(performance.tokensPerSecond),
      accent: true,
    },
    {
      label: "Output",
      value: `${performance.outputTokens.toLocaleString()} tok`,
    },
    ...(performance.inputTokens != null
      ? [
          {
            label: "Input",
            value: `${performance.inputTokens.toLocaleString()} tok`,
          },
        ]
      : []),
    {
      label: "TTFT",
      value: formatDuration(performance.timeToFirstToken),
    },
    {
      label: "Gen",
      value: formatDuration(performance.generationTime),
    },
    {
      label: "Total",
      value: formatDuration(performance.totalTime),
    },
  ];

  return (
    <div className="mt-1.5 px-1">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {items.map((item, index) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            {index > 0 && (
              <span
                aria-hidden
                className="mr-1 text-[var(--color-text-dim)]/35"
              >
                ·
              </span>
            )}
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]/60">
              {item.label}
            </span>
            <span
              className={`font-mono text-[10.5px] ${
                item.accent
                  ? "text-emerald-400/90"
                  : "text-[var(--color-text-dim)]"
              }`}
            >
              {item.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MemoryUsedBadge({
  memoryPack,
  nodeTitleLookup,
}: {
  memoryPack: MemoryPack;
  nodeTitleLookup?: (id: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nodeCount = memoryPack.sourceNodeIds.length;
  const tokenCount = memoryPack.tokenCount;
  const reasonEntries = Object.entries(memoryPack.reasons ?? {});

  const formatId = (id: string) =>
    id.length > 14 ? `${id.slice(0, 12)}…` : id;

  return (
    <div ref={ref} className="relative mt-1.5 px-1">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.03] hover:text-white"
        }`}
      >
        <Brain className="size-3" />
        <span>
          Memory used · {nodeCount} {nodeCount === 1 ? "node" : "nodes"} ·{" "}
          {tokenCount} tokens
        </span>
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Memory pack details"
          className="absolute left-0 top-full z-20 mt-1.5 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/40"
        >
          <div className="border-b border-[var(--color-border)] p-3">
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
              Content
            </div>
            <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-2 font-mono text-[11px] leading-relaxed text-[var(--color-text)]">
              {memoryPack.content}
            </pre>
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
              Sources
            </div>
            {nodeCount === 0 ? (
              <p className="m-0 font-mono text-[11.5px] text-[var(--color-text-dim)]">
                No source nodes
              </p>
            ) : (
              <ul className="m-0 list-none space-y-0.5 p-0">
                {memoryPack.sourceNodeIds.map((id) => {
                  const title = nodeTitleLookup?.(id);
                  return (
                    <li
                      key={id}
                      className="truncate font-mono text-[11.5px] text-[var(--color-text-dim)]"
                      title={title ?? id}
                    >
                      {title ?? formatId(id)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-b border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-dim)]">
            tokens: {memoryPack.tokenCount} · budget used:{" "}
            {memoryPack.budgetUsed}
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={() => setReasonsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)] hover:text-white"
            >
              <span>Reasons</span>
              <ChevronDown
                className={`size-3 transition-transform ${
                  reasonsOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {reasonsOpen && (
              <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                {reasonEntries.length === 0 ? (
                  <li className="font-mono text-[11.5px] text-[var(--color-text-dim)]">
                    No reasons recorded
                  </li>
                ) : (
                  reasonEntries.map(([key, value]) => (
                    <li
                      key={key}
                      className="text-[11.5px] leading-snug"
                    >
                      <span className="font-mono text-[var(--color-text-dim)]">
                        {key}:
                      </span>{" "}
                      <span className="text-[var(--color-text)]">{value}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageAttachmentsPreview({
  attachments,
  onRemove,
}: {
  attachments: MessageAttachment[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${onRemove ? "mb-2" : "mb-2 last:mb-0"}`}
    >
      {attachments.map((attachment) => (
        <div key={attachment.id} className="group/att relative">
          <img
            src={attachment.dataUrl}
            alt={attachment.name}
            className="max-h-40 max-w-full rounded-lg border border-white/10 object-cover"
          />
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${attachment.name}`}
              onClick={() => onRemove(attachment.id)}
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-white group-hover/att:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

type ComposerProps = {
  memory: boolean;
  onMemoryChange: (on: boolean) => void;
  showReasoning: boolean;
  onShowReasoningChange: (on: boolean) => void;
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
    options?: { memoryEnabled: boolean },
  ) => void;
  disabled?: boolean;
  supportsImages?: boolean;
  composerTextClass?: string;
};

function Composer({
  memory,
  onMemoryChange,
  showReasoning,
  onShowReasoningChange,
  mode,
  onModeChange,
  onSend,
  disabled,
  supportsImages = false,
  composerTextClass = "text-[14px]",
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supportsImages && attachments.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttachments([]);
      setAttachError(null);
    }
  }, [supportsImages, attachments.length]);

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !disabled;

  const handleSend = () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || disabled) return;
    onSend?.(text, attachments.length > 0 ? attachments : undefined, { memoryEnabled: memory });
    setValue("");
    setAttachments([]);
    setAttachError(null);
    textareaRef.current?.focus();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length || !supportsImages) return;
    setAttachError(null);

    const remaining = MAX_IMAGE_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setAttachError(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    try {
      const next = await Promise.all(selected.map((file) => fileToAttachment(file)));
      setAttachments((current) => [...current, ...next]);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Failed to attach image.");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="group/composer relative rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-panel)] to-[var(--color-bg)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus-within:border-[var(--color-accent)]/40 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_3px_rgba(99,102,241,0.08)]">
      <div className="flex flex-col gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        {attachments.length > 0 && (
          <MessageAttachmentsPreview
            attachments={attachments}
            onRemove={(id) =>
              setAttachments((current) => current.filter((item) => item.id !== id))
            }
          />
        )}
        {attachError && (
          <p className="px-2 text-[11.5px] text-amber-300">{attachError}</p>
        )}
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          disabled={disabled}
          className={`block w-full resize-none rounded-md bg-transparent px-2 py-1.5 font-medium leading-snug tracking-[-0.005em] text-white transition-[font-size] duration-200 ease-out placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--color-text-dim)]/70 focus:outline-none disabled:opacity-50 ${composerTextClass}`}
        />
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)]/50 pt-1.5">
          <div className="flex items-center gap-0.5">
            <IconButton
              aria-label={
                supportsImages
                  ? "Attach image"
                  : "Images not supported by the selected model"
              }
              title={
                supportsImages
                  ? "Attach image (JPEG, PNG, WebP)"
                  : "Select a vision model to attach images"
              }
              disabled={!supportsImages || disabled}
              onClick={() => fileInputRef.current?.click()}
              className={
                !supportsImages
                  ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--color-text-dim)]"
                  : undefined
              }
            >
              {supportsImages ? (
                <ImageIcon className="size-3.5" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
            </IconButton>
            <IconButton aria-label="Mention">
              <AtSign className="size-3.5" />
            </IconButton>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ModeMenu value={mode} onChange={onModeChange} />
            <Toggle label="Memory" on={memory} onChange={onMemoryChange} />
            <Toggle
              label="Reasoning"
              on={showReasoning}
              onChange={onShowReasoningChange}
            />
            <button
              aria-label="Send"
              disabled={!canSend}
              onClick={handleSend}
              className="group/send grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)] text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] transition-all hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.5),0_6px_16px_-2px_rgba(99,102,241,0.5)] active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] disabled:active:scale-100"
            >
              {disabled ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4 transition-transform group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:pointer-events-none ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

const MODES: { id: ChatMode; label: string; description: string; icon: ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Single back-and-forth conversation",
    icon: <MessageSquare className="size-3.5" />,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Multi-step tasks with tools",
    icon: <Bot className="size-3.5" />,
  },
];

function ModeMenu({
  value,
  onChange,
}: {
  value: ChatMode;
  onChange?: (mode: ChatMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find((m) => m.id === value) ?? MODES[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.03] hover:text-white"
        }`}
      >
        {current.icon}
        <span className="font-medium">{current.label}</span>
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-1.5 w-56 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl shadow-black/40"
        >
          <div className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Switch mode
          </div>
          {MODES.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange?.(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                  active
                    ? "bg-[var(--color-accent-soft)]"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${
                    active
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-white/[0.04] text-[var(--color-text-dim)]"
                  }`}
                >
                  {m.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[12.5px] font-medium ${
                      active ? "text-white" : "text-[var(--color-text)]"
                    }`}
                  >
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-text-dim)]">
                    {m.description}
                  </div>
                </div>
                {active && (
                  <Check className="mt-1 size-3.5 shrink-0 text-[var(--color-accent)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
