import { useState } from "react";
import {
  Paperclip,
  Download,
  CheckCircle,
  AlertCircle,
  FileText,
  Loader2,
  ExternalLink,
  Eye,
  X,
} from "lucide-react";
import { formatFileSize } from "./ai-output-helpers";
import type { EmailAttachment } from "../email-types";

export function AttachmentChip({
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
