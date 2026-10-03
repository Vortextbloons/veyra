import { lazy, memo, Suspense, useState } from "react";
import {
  Brain,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type { ChatMessage, MessagePerformance } from "@/modules/chat/chat-types";
import { hasWebSearchActivity } from "@/lib/web-search-state";
import { formatDuration, formatTokensPerSecond } from "@/lib/performance";
import { MessageAttachmentsPreview } from "@/modules/chat/components/composer";
import { MessageToolbar } from "@/modules/chat/components/message-toolbar";
import { ToolCallList } from "@/modules/chat/components/tool-call-list";
import { ThinkingIndicator } from "@/modules/chat/components/thinking-indicator";
import { useProviderStore } from "@/stores/provider-store";
import { type MessageAttachment } from "@/lib/message-attachments";
import { FilePreviewModal } from "@/modules/chat/components/file-preview-modal";
import { StudioResponseView } from "@/modules/chat/studio/components/studio-response";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

type ChatMessageLayout = {
  messagesPx: string;
  messageText: string;
  userMaxW: string;
  composerText: string;
  footerPx: string;
};

type MessageBubbleProps = {
  message: ChatMessage;
  conversationId?: string;
  isStreaming: boolean;
  layout: ChatMessageLayout;
  isLastAssistant?: boolean;
  isStudio?: boolean;
  showStudioResponse?: boolean;
  pendingQuestion?: {
    toolCallId: string;
    questions: Array<{ text: string; options?: string[] }>;
    answers: Record<number, string>;
  };
  onResolveQuestion?: (answers: Record<number, string>) => void;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onCopy?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  conversationId,
  isStreaming,
  layout,
  isLastAssistant = false,
  isStudio = false,
  showStudioResponse = true,
  pendingQuestion,
  onResolveQuestion,
  onEdit,
  onRegenerate,
  onRetry,
  onCopy,
  onFork,
  onDelete,
}: MessageBubbleProps) {
  const models = useProviderStore((state) => state.models);
  const resolvedModelName = message.modelId
    ? models.find((m) => m.id === message.modelId)?.name ?? "Assistant"
    : "Assistant";

  const isUser = message.role === "user";
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

  if (isUser) {
    return (
      <>
        {previewAttachment && (
          <FilePreviewModal
            attachment={previewAttachment}
            onClose={() => setPreviewAttachment(null)}
          />
        )}
        <div className="group/message flex flex-row-reverse gap-3">
          <div
            className={`flex min-w-0 flex-col items-end transition-[max-width] duration-200 ease-out ${layout.userMaxW}`}
          >
            <MessageToolbar
              isUser
              isStreaming={isStreaming}
              isLastAssistant={isLastAssistant}
              onEdit={() => onEdit?.(message.id)}
              onCopy={() => onCopy?.(message.id)}
              onFork={() => onFork?.(message.id)}
              onDelete={() => onDelete?.(message.id)}
            />
            <div
              className={`studio-theme-user-message rounded-3xl bg-[var(--color-accent-soft)] px-5 py-3 text-white transition-[font-size] duration-200 ease-out ${layout.messageText}`}
            >
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachmentsPreview
                  attachments={message.attachments}
                  onPreview={(att) => setPreviewAttachment(att)}
                />
              )}
              {message.content.trim() && (
                <Suspense>
                  <MarkdownRenderer className="leading-snug">
                    {message.content.trim()}
                  </MarkdownRenderer>
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }
  const rawBody = message.content.trim();
  const body = hasWebSearchActivity(message.webSearchState)
    ? rawBody.replace(/\{[\s\S]*?"tool"\s*:\s*"web\.search"[\s\S]*?"args"\s*:\s*\{[\s\S]*?"query"\s*:\s*"[^"]*"[\s\S]*?\}[\s\S]*?\}/, "").replace(/\n{3,}/g, "\n\n").trim()
    : rawBody;
  const reasoning = message.reasoning?.trim() ?? "";
  const hasReasoning = reasoning.length > 0;
  const reasoningOnlyStreaming = isStreaming && hasReasoning && !body;
  const hasToolActivity = (message.toolStates?.length ?? 0) > 0 || hasWebSearchActivity(message.webSearchState);
  const showReplyBubble = Boolean(body) || (isStreaming && !reasoningOnlyStreaming && !hasToolActivity);
  const showThinking = isStreaming && !body && !reasoningOnlyStreaming;
  const showPulseInReply = isStreaming && !reasoningOnlyStreaming && Boolean(body);
  const studioResponse = message.studioResponse;
  const studioTool = message.toolStates?.find((tool) => tool.name === "studio_render");

  return (
      <div className="studio-theme-assistant-message group/message flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="w-full max-w-none">
        <div className="mb-1 flex items-center gap-2 text-[11.5px] leading-none">
          <span className="truncate font-medium text-white">{resolvedModelName}</span>
          <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
          <span className="text-[var(--color-text-dim)]">just now</span>
        </div>
        <MessageToolbar
          isUser={false}
          isStreaming={isStreaming}
          isLastAssistant={isLastAssistant}
          onRegenerate={() => onRegenerate?.(message.id)}
          onRetry={() => onRetry?.(message.id)}
          onCopy={() => onCopy?.(message.id)}
          onFork={() => onFork?.(message.id)}
          onDelete={() => onDelete?.(message.id)}
        />
        {hasReasoning && (
          <ReasoningBlock
            content={reasoning}
            isStreaming={reasoningOnlyStreaming}
            messageTextClass={layout.messageText}
          />
        )}
        {(message.toolStates?.length || hasWebSearchActivity(message.webSearchState)) ? (
          <ToolCallList
            message={message}
            pendingQuestion={pendingQuestion}
            onResolveQuestion={onResolveQuestion}
          />
        ) : null}
        {showReplyBubble && (
        <div
          className={`py-3 text-[var(--color-text)] transition-[font-size] duration-200 ease-out ${isStudio ? "rounded-2xl border border-violet-300/[0.09] bg-[var(--color-panel)] px-4" : "bg-transparent"} ${layout.messageText}`}
        >
          {showThinking && !body ? (
              isStudio ? <StudioThinkingIndicator /> : <ThinkingIndicator />
          ) : (
            <Suspense>
              <MarkdownRenderer className="leading-snug">
                {body}
              </MarkdownRenderer>
            </Suspense>
          )}
          {showPulseInReply && (
            <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-400 align-middle" />
          )}
        </div>
        )}
        {isStreaming && isStudio && body && (
          <StudioProgress phase={studioTool?.phase} hasCustomMessage={Boolean(studioTool)} />
        )}
        </div>
        {showStudioResponse && studioResponse && conversationId && (
          <StudioResponseView
            conversationId={conversationId}
            assistantMessageId={message.id}
            response={studioResponse}
          />
        )}
        {!isStreaming && message.performance && (
          <MessagePerformanceBar performance={message.performance} />
        )}
      </div>
    </div>
  );
});

function StudioThinkingIndicator() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-0.5 text-[12px] text-[var(--color-text-dim)]">
      <span className="relative grid size-5 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/10 motion-reduce:hidden" />
        <Sparkles className="relative size-3.5 text-violet-300" />
      </span>
      <span>Finding the clearest way to respond</span>
      <span aria-hidden className="h-px min-w-8 flex-1 overflow-hidden bg-white/[0.06]">
        <span className="block h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] bg-gradient-to-r from-violet-400/20 to-cyan-300/60 motion-reduce:animate-none" />
      </span>
    </div>
  );
}

function StudioProgress({ phase, hasCustomMessage }: { phase?: string; hasCustomMessage: boolean }) {
  const label = hasCustomMessage
    ? phase === "running" || phase === "retrying"
      ? "Shaping the custom message"
      : phase === "pending"
        ? "Preparing a visual response"
        : "Finishing the response"
    : "Writing";
  return (
    <div role="status" aria-live="polite" className="mt-2 flex items-center gap-2 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
      <span className="h-1 w-1 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.8)]" />
      <span>{label}</span>
      <span aria-hidden className="h-px w-10 bg-gradient-to-r from-violet-400/50 to-cyan-300/10" />
    </div>
  );
}

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
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = isStreaming ? true : (userExpanded ?? false);

  return (
    <div
      className={`mb-2 overflow-hidden rounded-xl border border-violet-500/15 bg-violet-500/[0.06] transition-[font-size] duration-200 ease-out ${messageTextClass}`}
    >
      <button
        type="button"
        onClick={() => setUserExpanded((v) => !(v ?? expanded))}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-violet-500/[0.04]"
      >
        <Brain className="size-3 shrink-0 text-violet-300/80" />
        <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide text-violet-300/80">
          {isStreaming ? "Thinking" : "Reasoning"}
        </span>
        {isStreaming && (
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-violet-400" />
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-violet-300/60 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="px-3.5 py-2.5">
          <p className="m-0 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
            {content}
          </p>
        </div>
      )}
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
