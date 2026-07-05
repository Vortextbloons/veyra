import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Archive,
  MailOpen,
  Mail,
  Clock,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Download,
  CheckCircle,
  AlertCircle,
  FileText,
  Loader2,
  ExternalLink,
  Eye,
  X,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import { EmailHtmlBody } from "./EmailHtmlBody";
import type { EmailMessage, EmailAttachment } from "../email-types";

export function ThreadReader() {
  const threads = useEmailStore((s) => s.threads);
  const activeThreadId = useEmailStore((s) => s.activeThreadId);
  const archiveThread = useEmailStore((s) => s.archiveThread);
  const markRead = useEmailStore((s) => s.markRead);
  const markUnread = useEmailStore((s) => s.markUnread);
  const selectThread = useEmailStore((s) => s.selectThread);
  const startCompose = useEmailStore((s) => s.startCompose);
  const attachments = useEmailStore((s) => s.attachments);
  const attachmentLoadingIds = useEmailStore((s) => s.attachmentLoadingIds);
  const loadAttachments = useEmailStore((s) => s.loadAttachments);
  const downloadAttachment = useEmailStore((s) => s.downloadAttachment);
  const extractAttachmentText = useEmailStore((s) => s.extractAttachmentText);
  const openAttachment = useEmailStore((s) => s.openAttachment);

  const thread = threads.find((t) => t.id === activeThreadId);

  const stableLoadAttachments = useCallback(loadAttachments, [loadAttachments]);

  useEffect(() => {
    if (thread) {
      for (const msg of thread.messages) {
        if (msg.attachments && msg.attachments.length > 0) {
          void stableLoadAttachments(msg.id);
        }
      }
    }
  }, [thread?.id, stableLoadAttachments]);

  if (!thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--color-text-dim)]">
        <MailOpen className="size-10 text-[var(--color-text-dim)]/30" />
        <p className="text-[13px]">Select a thread to read</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => selectThread(null)}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            title="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text)]">
            {thread.subject}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              thread.isRead ? void markUnread(thread.id) : void markRead(thread.id)
            }
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            title={thread.isRead ? "Mark unread" : "Mark read"}
          >
            {thread.isRead ? <Mail className="size-3.5" /> : <MailOpen className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void archiveThread(thread.id)}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            title="Archive"
          >
            <Archive className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              startCompose({
                accountId: thread.accountId,
                subject: thread.subject.startsWith("Re: ") ? thread.subject : `Re: ${thread.subject}`,
                to: thread.participants[0] ?? "",
              })
            }
            className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-white hover:brightness-110"
          >
            Reply
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {thread.messages.map((message) => (
            <div
              key={message.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-slate-600 text-[11px] font-semibold text-white">
                    {message.from.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[12.5px] font-medium text-[var(--color-text)]">
                      {message.from.name}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)]">
                      {message.from.email}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
                  <Clock className="size-3" />
                  {new Date(message.timestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {message.to.length > 0 && (
                <div className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                  To: {message.to.map((t) => t.email).join(", ")}
                </div>
              )}

              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments[message.id]
                    ? attachments[message.id].map((att) => (
                        <AttachmentChip
                          key={att.id}
                          attachment={att}
                          isLoading={attachmentLoadingIds.has(att.id)}
                          onDownload={() => void downloadAttachment(att.id)}
                          onExtract={() => void extractAttachmentText(att.id)}
                          onOpen={() => void openAttachment(att.id)}
                        />
                      ))
                    : message.attachments.map((att) => (
                        <div
                          key={att.filename}
                          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-dim)]"
                        >
                          <Paperclip className="size-3" />
                          <span className="max-w-[160px] truncate">{att.filename}</span>
                          <Loader2 className="size-3 animate-spin text-[var(--color-accent)]/40" />
                        </div>
                      ))}
                </div>
              )}

              <MessageBody message={message} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBody({ message }: { message: EmailMessage }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const parsed = message.parsedParts ?? {
    latestReply: "",
    quotedHtml: "",
    signature: "",
    forwarded: "",
    parseStatus: "fallback" as const,
  };
  const hasHtmlBody = Boolean(message.bodyHtml);
  const hasParsedContent =
    parsed && parsed.parseStatus === "parsed" && parsed.latestReply;

  if (hasParsedContent) {
    return (
      <div className="mt-3">
        {/* Latest reply content */}
        {hasHtmlBody ? (
          <EmailHtmlBody html={parsed.latestReply} />
        ) : (
          <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text)]">
            {parsed.latestReply}
          </div>
        )}

        {/* Signature */}
        {parsed.signature && (
          <div className="mt-2 whitespace-pre-wrap border-t border-[var(--color-border)]/30 pt-2 text-[11.5px] text-[var(--color-text-dim)]">
            {parsed.signature}
          </div>
        )}

        {/* Forwarded section */}
        {parsed.forwarded && (
          <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-1 text-[11px] font-medium text-[var(--color-text-dim)]">
              Forwarded message
            </div>
            <div className="whitespace-pre-wrap text-[12px] text-[var(--color-text-dim)]">
              {parsed.forwarded}
            </div>
          </div>
        )}

        {/* Collapsed quoted text */}
        {parsed.quotedHtml && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {showQuoted ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && (
              <div className="mt-2 border-l-2 border-[var(--color-border)] pl-3 text-[12px] text-[var(--color-text-dim)]">
                {hasHtmlBody ? (
                  <EmailHtmlBody html={parsed.quotedHtml} />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {parsed.quotedHtml}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Fallback: use sanitized HTML if available, otherwise plain text.
  if (message.sanitizedHtml) {
    return (
      <div className="mt-3">
        <EmailHtmlBody html={message.sanitizedHtml} />
      </div>
    );
  }

  return (
    <div className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text)]">
      {message.body}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({
  attachment,
  isLoading,
  onDownload,
  onExtract,
  onOpen,
}: {
  attachment: EmailAttachment;
  isLoading: boolean;
  onDownload: () => void;
  onExtract: () => void;
  onOpen: () => void;
}) {
  const [showExtractedText, setShowExtractedText] = useState(false);
  const downloadStatus = attachment.downloadStatus;
  const extractStatus = attachment.extractStatus;
  const isDownloaded = downloadStatus === "downloaded";
  const isExtracted = extractStatus === "extracted";

  return (
    <>
      <div className="group flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-dim)]">
        <Paperclip className="size-3 shrink-0" />
        <span className="max-w-[160px] truncate" title={attachment.filename}>
          {attachment.filename}
        </span>
        <span className="text-[10px] opacity-60">
          {formatFileSize(attachment.size)}
        </span>

        {isLoading && (
          <Loader2 className="size-3 animate-spin text-[var(--color-accent)]" />
        )}

        {!isLoading && downloadStatus === "metadata" && (
          <button
            type="button"
            onClick={onDownload}
            className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download className="size-3" />
          </button>
        )}

        {!isLoading && downloadStatus === "downloading" && (
          <Loader2 className="size-3 animate-spin text-[var(--color-accent)]" />
        )}

        {!isLoading && downloadStatus === "failed" && (
          <button
            type="button"
            onClick={onDownload}
            className="grid size-5 place-items-center rounded text-red-400 hover:bg-white/10"
            title={`Download failed: ${attachment.error ?? "unknown error"}. Click to retry.`}
          >
            <AlertCircle className="size-3" />
          </button>
        )}

        {!isLoading && isDownloaded && !isExtracted && extractStatus !== "unsupported" && (
          <button
            type="button"
            onClick={onExtract}
            className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
            title="Extract text for AI"
          >
            <FileText className="size-3" />
          </button>
        )}

        {!isLoading && isExtracted && (
          <span title="Text extracted">
            <CheckCircle className="size-3 text-emerald-400/60" />
          </span>
        )}

        {!isLoading && extractStatus === "extracting" && (
          <Loader2 className="size-3 animate-spin text-[var(--color-accent)]" />
        )}

        {!isLoading && extractStatus === "unsupported" && (
          <span className="text-[10px] opacity-40" title="Text extraction not supported for this file type">
            N/A
          </span>
        )}

        {!isLoading && isDownloaded && (
          <>
            <button
              type="button"
              onClick={onOpen}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
              title="Open file"
            >
              <ExternalLink className="size-3" />
            </button>
            {isExtracted && attachment.extractedText && (
              <button
                type="button"
                onClick={() => setShowExtractedText(true)}
                className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                title="View extracted text"
              >
                <Eye className="size-3" />
              </button>
            )}
          </>
        )}
      </div>

      {showExtractedText && attachment.extractedText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowExtractedText(false)}>
          <div className="mx-4 max-h-[70vh] w-full max-w-lg overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[13px] font-semibold text-[var(--color-text)]">{attachment.filename}</h3>
                <p className="text-[11px] text-[var(--color-text-dim)]">{attachment.extractedTextChars} characters extracted</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExtractedText(false)}
                className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--color-text)]">
                {attachment.extractedText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
