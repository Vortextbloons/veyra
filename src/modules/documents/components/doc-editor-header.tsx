import { useState, useRef, useEffect, useCallback } from "react";
import { Bookmark, Trash2, X, Edit2, Check, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { useDocumentStore } from "../document-store";
import { useMemoryStore } from "@/modules/memory/memory-store";
import { DocumentExportMenu } from "./document-export-menu";
import { formatDocumentStatus, DOCUMENT_TYPE_OPTIONS, DOCUMENT_STATUS_OPTIONS } from "../document-export";
import type { DocumentType, DocumentStatus } from "../document-types";

export function DocEditorHeader() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const renameDocument = useDocumentStore((s) => s.renameDocument);
  const closeDocument = useDocumentStore((s) => s.closeDocument);
  const toggleGlobal = useDocumentStore((s) => s.toggleGlobal);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const createMemoryNode = useMemoryStore((s) => s.createNode);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    if (doc) {
      setEditTitle(doc.title);
      setEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (doc && editTitle.trim() && editTitle !== doc.title) {
      await renameDocument(doc.id, editTitle.trim());
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  const handleDelete = useCallback(() => {
    if (!doc) return;
    if (confirmDelete) {
      void deleteDocument(doc.id);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(true);
  }, [confirmDelete, doc, deleteDocument]);

  const handleSaveToMemories = useCallback(() => {
    if (!doc) return;
    void createMemoryNode({
      folderId: "default",
      conversationId: doc.conversationId,
      projectId: doc.projectId,
      title: doc.title,
      content: doc.contentMarkdown,
      summary: doc.contentMarkdown.length > 180 ? `${doc.contentMarkdown.slice(0, 177)}…` : doc.contentMarkdown,
      type: "file_reference",
      scope: doc.isGlobal ? "global" : "conversation",
      tags: ["document", doc.type, ...doc.tags],
      importance: 4,
      confidence: 1,
      priority: "high",
      origin: "explicit_user_save",
      status: "active",
      isPinned: true,
    });
  }, [doc, createMemoryNode]);

  const handleAddTag = useCallback(
    (raw: string) => {
      const tag = raw.trim().toLowerCase();
      if (!tag || !doc || doc.tags.includes(tag)) return;
      void updateDocument({ id: doc.id, tags: [...doc.tags, tag] });
    },
    [doc, updateDocument],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      if (!doc) return;
      void updateDocument({ id: doc.id, tags: doc.tags.filter((t) => t !== tag) });
    },
    [doc, updateDocument],
  );

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && doc?.tags.length) {
      handleRemoveTag(doc.tags[doc.tags.length - 1]);
    }
  };

  if (!doc) return null;

  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveEdit}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[var(--color-text)] outline-none border-b border-[var(--color-border)] pb-0.5"
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                className="grid size-5 place-items-center rounded text-emerald-400 hover:bg-white/5"
              >
                <Check className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                className="flex items-center gap-1.5 min-w-0 group"
                title="Click to rename"
              >
                <span className="truncate text-sm font-medium text-[var(--color-text)] group-hover:text-white">
                  {doc.title}
                </span>
                <Edit2 className="size-3 text-[var(--color-text-dim)] opacity-0 group-hover:opacity-100" />
              </button>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                {formatDocumentStatus(doc.status)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            type="button"
            title={doc.isGlobal ? "Global document (click to make session-only)" : "Session document (click to make global)"}
            onClick={() => void toggleGlobal(doc.id)}
            className={`grid size-7 place-items-center rounded transition-colors ${
              doc.isGlobal
                ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20"
                : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            }`}
          >
            <Globe className="size-3.5" />
          </button>
          <DocumentExportMenu />
          <button
            type="button"
            title="Save to memories"
            onClick={handleSaveToMemories}
            className="grid size-7 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-amber-400/10 hover:text-amber-300"
          >
            <Bookmark className="size-3.5" />
          </button>
          <button
            type="button"
            title={confirmDelete ? "Click again to delete" : "Delete document"}
            onClick={handleDelete}
            className="grid size-7 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-300"
          >
            {confirmDelete ? <span className="text-[10px] font-semibold">Del</span> : <Trash2 className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Close document"
            onClick={() => void closeDocument()}
            className="grid size-7 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Metadata panel */}
      <button
        type="button"
        onClick={() => setDetailsOpen(!detailsOpen)}
        aria-expanded={detailsOpen}
        className="flex items-center gap-1.5 px-4 py-1.5 w-full text-left text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
      >
        {detailsOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Details
      </button>

      {detailsOpen && (
        <div className="px-4 pb-3 pt-1 space-y-3 border-t border-[var(--color-border)] bg-white/[0.02]">
          <div className="flex gap-4">
            <label className="flex-1">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1">Type</span>
              <select
                value={doc.type}
                onChange={(e) => void updateDocument({ id: doc.id, type: e.target.value as DocumentType })}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                {DOCUMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1">Status</span>
              <select
                value={doc.status}
                onChange={(e) => void updateDocument({ id: doc.id, status: e.target.value as DocumentStatus })}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                {DOCUMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1">Tags</span>
            <div className="flex flex-wrap items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 min-h-[28px]">
              {doc.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[var(--color-text)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-300"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              <input
                key={activeDocumentId}
                type="text"
                value={tagInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes(",")) {
                    const parts = val.split(",");
                    for (const part of parts.slice(0, -1)) {
                      handleAddTag(part);
                    }
                    setTagInput(parts[parts.length - 1]);
                  } else {
                    setTagInput(val);
                  }
                }}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput.trim()) { handleAddTag(tagInput); setTagInput(""); } }}
                placeholder={doc.tags.length === 0 ? "Add tag..." : ""}
                className="flex-1 min-w-[60px] bg-transparent text-[11px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
