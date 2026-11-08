import { lazy, memo, Suspense, useState } from "react";
import {
  ChevronDown,
} from "lucide-react";
import type { ChatMessage, MessagePerformance } from "@/modules/chat/chat-types";
import { formatDuration, formatTokensPerSecond } from "@/lib/performance";
import { MessageAttachmentsPreview } from "@/modules/chat/components/composer";
import { MessageToolbar } from "@/modules/chat/components/message-toolbar";
import { ThinkingIndicator } from "@/modules/chat/components/thinking-indicator";
import { type MessageAttachment } from "@/lib/message-attachments";
import { FilePreviewModal } from "@/modules/chat/components/file-preview-modal";
import { ArtifactBlock } from "@/modules/chat/components/artifact-block";

// The OpenUI Lang renderer is only needed for turns that carry an interactive
// answer, so it stays out of the main chat bundle.
const InteractiveAnswerBlock = lazy(() =>
  import("@/modules/chat/components/interactive-answer-block").then((m) => ({
    default: m.InteractiveAnswerBlock,
  })),
);

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
  isStreaming: boolean;
  layout: ChatMessageLayout;
  isLastAssistant?: boolean;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onCopy?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onFollowUp?: (prompt: string) => void;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  layout,
  isLastAssistant = false,
  onEdit,
  onRegenerate,
  onRetry,
  onCopy,
  onFork,
  onDelete,
  onFollowUp,
}: MessageBubbleProps) {



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
              onEdit={onEdit ? () => onEdit(message.id) : undefined}
              onCopy={onCopy ? () => onCopy(message.id) : undefined}
              onFork={onFork ? () => onFork(message.id) : undefined}
              onDelete={onDelete ? () => onDelete(message.id) : undefined}
            />
            <div
              className={`rounded-3xl bg-[var(--color-accent-soft)] px-5 py-3 text-white transition-[font-size] duration-200 ease-out ${layout.messageText}`}
            >
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachmentsPreview
                  attachments={message.attachments}
                  onPreview={(att) => setPreviewAttachment(att)}
                />
              )}
              {message.content.trim() && (
                <Suspense>
                  <MarkdownRenderer className="leading-snug" deferHighlight={isStreaming}>
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
  const body = message.content.trim();
  const reasoning = message.reasoning?.trim() ?? "";
  const hasReasoning = reasoning.length > 0;
  const reasoningOnlyStreaming = isStreaming && hasReasoning && !body;
  const showReplyBubble = Boolean(body) || (isStreaming && !reasoningOnlyStreaming);
  const showThinking = isStreaming && !body && !reasoningOnlyStreaming;
  const showPulseInReply = isStreaming && !reasoningOnlyStreaming && Boolean(body);

  return (
      <div className="group/message flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="w-full max-w-none">
        {hasReasoning && (
          <ReasoningBlock
            content={reasoning}
            isStreaming={reasoningOnlyStreaming}
            messageTextClass={layout.messageText}
          />
        )}
        {showReplyBubble && (
        <div
          className={`py-3 text-[var(--color-text)] transition-[font-size] duration-200 ease-out bg-transparent ${layout.messageText}`}
        >
          {showThinking && !body ? (
              <ThinkingIndicator />
          ) : (
            <Suspense>
              <MarkdownRenderer className="leading-snug" deferHighlight={isStreaming}>
                {body}
              </MarkdownRenderer>
            </Suspense>
          )}
          {showPulseInReply && (
            <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" />
          )}
        </div>
        )}
        {message.interactiveAnswer && (
          <Suspense fallback={null}>
            <InteractiveAnswerBlock
              answer={message.interactiveAnswer}
              onFollowUp={onFollowUp}
            />
          </Suspense>
        )}
        {message.artifact && <ArtifactBlock artifact={message.artifact} messageId={message.id} />}
        </div>
        {Boolean(body) && (
          <MessageToolbar
            isUser={false}
            isStreaming={isStreaming}
            isLastAssistant={isLastAssistant}
            onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
            onRetry={onRetry ? () => onRetry(message.id) : undefined}
            onCopy={onCopy ? () => onCopy(message.id) : undefined}
            onFork={onFork ? () => onFork(message.id) : undefined}
            onDelete={onDelete ? () => onDelete(message.id) : undefined}
          />
        )}
        {!isStreaming && message.performance && (
          <MessagePerformanceBar performance={message.performance} />
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
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = userExpanded ?? isStreaming;

  return (
    <div
      className={`my-1 transition-[font-size] duration-200 ease-out ${messageTextClass}`}
    >
      <button
        type="button"
        onClick={() => setUserExpanded((v) => !(v ?? expanded))}
        aria-expanded={expanded}
        className="group flex min-h-8 items-center gap-2 rounded-md py-1 text-left text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
      >
        <span className="text-[13px]">
          {isStreaming ? "Thinking" : "Reasoning"}
        </span>
        {isStreaming && (
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-[var(--color-text-dim)]" />
        )}
        <ChevronDown
          className={`size-3 shrink-0 opacity-60 transition-transform motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="py-1">
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
