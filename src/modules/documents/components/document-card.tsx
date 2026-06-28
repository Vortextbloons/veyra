import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { DocumentRecord } from "../document-types";
import { formatDocumentStatus, formatDocumentType, formatDocumentDate } from "../document-export";
import { useDocumentStore } from "../document-store";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-500/15 text-amber-400",
  review: "bg-blue-500/15 text-blue-400",
  final: "bg-emerald-500/15 text-emerald-400",
  archived: "bg-white/10 text-[var(--color-text-dim)]",
};

interface DocumentCardProps {
  document: DocumentRecord;
  isActive: boolean;
  compact?: boolean;
}

export function DocumentCard({ document, isActive, compact }: DocumentCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);

  const handleClick = () => {
    void openDocument(document.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      void deleteDocument(document.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
        compact ? "gap-0.5 py-2" : "",
        isActive
          ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]"
          : "border-transparent hover:bg-white/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "truncate font-medium text-[var(--color-text)]",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {document.title}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className={cn(
            "shrink-0 rounded p-0.5 text-[var(--color-text-dim)] transition-colors",
            confirmDelete
              ? "text-red-400 hover:text-red-300"
              : "opacity-0 group-hover:opacity-100 hover:text-red-400",
          )}
          title={confirmDelete ? "Click again to delete" : "Delete"}
        >
          {confirmDelete ? (
            <span className="text-[11px] font-medium">Del</span>
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[document.status] ?? STATUS_COLORS.draft,
          )}
        >
          {formatDocumentStatus(document.status)}
        </span>
        <span className="text-[10px] text-[var(--color-text-dim)]">
          {formatDocumentType(document.type)}
        </span>
        {document.isGlobal && (
          <span className="text-[10px] text-amber-400/70" title="Global">
            G
          </span>
        )}
      </div>
      {!compact && (
        <span className="text-[11px] text-[var(--color-text-dim)]">
          {formatDocumentDate(document.updatedAt)}
        </span>
      )}
    </div>
  );
}
