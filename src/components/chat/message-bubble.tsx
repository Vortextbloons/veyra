import { memo, useRef, useState } from "react";
import {
  Brain,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type { ChatMessage, MessagePerformance } from "@/lib/chat-types";
import type { MemoryPack, MemoryRetrievalInfo } from "@/lib/memory-types";
import { formatDuration, formatTokensPerSecond } from "@/lib/performance";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { MessageAttachmentsPreview } from "@/components/chat/composer";
import { ToolCallList } from "@/components/chat/tool-call-list";
import { useClickOutside } from "@/hooks/use-click-outside";

type ChatMessageLayout = {
  messagesPx: string;
  messageText: string;
  userMaxW: string;
  composerText: string;
  footerPx: string;
};

type MessageBubbleProps = {
  message: ChatMessage;
  isStreaming: boolean;
  showReasoning: boolean;
  layout: ChatMessageLayout;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  showReasoning,
  layout,
}: MessageBubbleProps) {
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
            className={`rounded-2xl rounded-tr-md border border-indigo-400/15 bg-[var(--color-accent-soft)] px-4 py-2.5 text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-[font-size] duration-200 ease-out ${layout.messageText}`}
          >
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachmentsPreview attachments={message.attachments} />
            )}
            {message.content.trim() && (
              <MarkdownRenderer className="leading-snug">
                {message.content.trim()}
              </MarkdownRenderer>
            )}
          </div>
        </div>
      </div>
    );
  }
  const rawBody = message.content.trim();
  const body = message.webSearchState
    ? rawBody.replace(/\{[\s\S]*?"tool"\s*:\s*"web\.search"[\s\S]*?"args"\s*:\s*\{[\s\S]*?"query"\s*:\s*"[^"]*"[\s\S]*?\}[\s\S]*?\}/, "").replace(/\n{3,}/g, "\n\n").trim()
    : rawBody;
  const reasoning = message.reasoning?.trim() ?? "";
  const hasReasoning = reasoning.length > 0;
  const reasoningOnlyStreaming = isStreaming && hasReasoning && !body;
  const hasToolActivity = (message.toolStates?.length ?? 0) > 0 || Boolean(message.webSearchState);
  const showReplyBubble = Boolean(body) || (isStreaming && !reasoningOnlyStreaming && !hasToolActivity);
  const showPulseInReply = isStreaming && !reasoningOnlyStreaming && Boolean(body);

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
        {message.toolStates?.length || message.webSearchState ? (
          <ToolCallList message={message} />
        ) : null}
        {showReplyBubble && (
        <div
          className={`rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 text-[var(--color-text)] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset transition-[font-size] duration-200 ease-out ${layout.messageText}`}
        >
          <MarkdownRenderer className="leading-snug">
            {body}
          </MarkdownRenderer>
          {showPulseInReply && (
            <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-400 align-middle" />
          )}
        </div>
        )}
        {!isStreaming && message.performance && (
          <MessagePerformanceBar performance={message.performance} />
        )}
        {!isStreaming && (message.memoryPack || message.memoryRetrieval) && (
          <MemoryRetrievalBadge
            memoryPack={message.memoryPack}
            memoryRetrieval={message.memoryRetrieval}
          />
        )}
      </div>
    </div>
  );
});

type ReasoningBlockProps = {
  content: string;
  isStreaming: boolean;
  messageTextClass: string;
};

function ReasoningBlock({
  content,
  isStreaming,
  messageTextClass,
}: ReasoningBlockProps) {
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

type MessagePerformanceBarProps = {
  performance: MessagePerformance;
};

function MessagePerformanceBar({
  performance,
}: MessagePerformanceBarProps) {
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

type MemoryRetrievalBadgeProps = {
  memoryPack?: MemoryPack;
  memoryRetrieval?: MemoryRetrievalInfo;
  nodeTitleLookup?: (id: string) => string | undefined;
};

function MemoryRetrievalBadge({
  memoryPack,
  memoryRetrieval,
  nodeTitleLookup,
}: MemoryRetrievalBadgeProps) {
  if (memoryRetrieval?.status === "used" && memoryPack) {
    return (
      <MemoryUsedBadge memoryPack={memoryPack} nodeTitleLookup={nodeTitleLookup} />
    );
  }

  const detail = memoryRetrieval?.detail ?? "Memory enabled";
  const status = memoryRetrieval?.status ?? "empty";
  const label =
    status === "skipped"
      ? "Memory skipped"
      : status === "empty"
        ? "No memory matched"
        : status === "disabled"
          ? "Memory off"
          : "Memory";

  return (
    <div className="mt-1.5 px-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]"
        title={detail}
      >
        <Brain className="size-3 shrink-0" />
        <span>
          {label} · {detail}
        </span>
      </span>
    </div>
  );
}

type MemoryUsedBadgeProps = {
  memoryPack: MemoryPack;
  nodeTitleLookup?: (id: string) => string | undefined;
};

function MemoryUsedBadge({
  memoryPack,
  nodeTitleLookup,
}: MemoryUsedBadgeProps) {
  const [open, setOpen] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

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
