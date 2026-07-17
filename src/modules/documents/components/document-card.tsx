import { Trash2, FolderInput, GripVertical } from "lucide-react";
import { useState, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const moveDocumentToFolder = useDocumentStore((s) => s.moveDocumentToFolder);
  const folders = useDocumentStore((s) => s.folders);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: document.id,
    data: { type: "document", document },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

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

  const handleMoveToFolder = useCallback(
    (folderId: string | undefined) => {
      void moveDocumentToFolder(document.id, folderId);
      setShowMoveMenu(false);
    },
    [document.id, moveDocumentToFolder],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
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
        "group flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
        compact ? "gap-0.5 py-2" : "",
        isActive
          ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]"
          : "border-transparent hover:bg-white/[0.03]",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${document.title}`}
            className="grid size-7 shrink-0 cursor-grab place-items-center rounded opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-white/5 active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-3 text-[var(--color-text-dim)]" />
          </button>
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium text-[var(--color-text)]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
            title={document.title}
          >
            {document.title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative">
            <button
              type="button"
              aria-label={`Move ${document.title} to folder`}
              onClick={(e) => {
                e.stopPropagation();
                setShowMoveMenu(!showMoveMenu);
              }}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded text-[var(--color-text-dim)] transition-colors",
                "opacity-40 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-white/5 hover:text-[var(--color-accent)]",
              )}
              title="Move to folder"
            >
              <FolderInput className="size-3.5" />
            </button>
            {showMoveMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoveMenu(false);
                  }}
                />
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveToFolder(undefined);
                    }}
                    className={cn(
                      "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                      !document.folderId
                        ? "text-white bg-[var(--color-accent-soft)]"
                        : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
                    )}
                  >
                    Unfiled
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveToFolder(folder.id);
                      }}
                      className={cn(
                        "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                        document.folderId === folder.id
                          ? "text-white bg-[var(--color-accent-soft)]"
                          : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
                      )}
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            aria-label={confirmDelete ? `Confirm delete ${document.title}` : `Delete ${document.title}`}
            onClick={handleDelete}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded text-[var(--color-text-dim)] transition-colors",
              confirmDelete
                ? "text-red-400 hover:text-red-300"
                : "opacity-40 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-white/5 hover:text-red-400",
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
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span
          className={cn(
            "inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[document.status] ?? STATUS_COLORS.draft,
          )}
        >
          {formatDocumentStatus(document.status)}
        </span>
        <span className="min-w-0 truncate text-[10px] text-[var(--color-text-dim)]">
          {formatDocumentType(document.type)}
        </span>
        {document.isGlobal && (
          <span className="text-[10px] text-amber-400/70" title="Global">
            G
          </span>
        )}
      </div>
      {!compact && (
        <span className="truncate text-[11px] text-[var(--color-text-dim)]">
          {formatDocumentDate(document.updatedAt)}
        </span>
      )}
    </div>
  );
}
