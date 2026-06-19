import { useEffect } from "react";
import { FileCode, FileText, FileSpreadsheet, File, X } from "lucide-react";
import type { MessageAttachment } from "@/lib/message-attachments";
import { formatFileSize, getFileIcon } from "@/lib/message-attachments";

export function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const type = getFileIcon(name);
  const cls = className ?? "size-4";
  switch (type) {
    case "code":
      return <FileCode className={cls} />;
    case "data":
      return <FileSpreadsheet className={cls} />;
    case "document":
      return <FileText className={cls} />;
    case "markup":
      return <FileCode className={cls} />;
    case "terminal":
      return <FileCode className={cls} />;
    default:
      return <File className={cls} />;
  }
}

type FilePreviewModalProps = {
  attachment: MessageAttachment;
  onClose: () => void;
};

export function FilePreviewModal({ attachment, onClose }: FilePreviewModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[var(--color-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileTypeIcon name={attachment.name} className="size-4 text-[var(--color-accent)]" />
            <span className="text-sm font-medium text-white">{attachment.name}</span>
            <span className="text-[11px] text-[var(--color-text-dim)]">
              {formatFileSize(attachment.size)}
            </span>
            {attachment.truncated && (
              <span className="text-[11px] text-amber-400/80">(truncated)</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-white/80">
            {attachment.textContent ?? "(No content)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
