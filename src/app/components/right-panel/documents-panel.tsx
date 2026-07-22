import { useState, useCallback } from "react";
import { Bookmark, Globe, Trash2 } from "lucide-react";
import { PanelShell } from "@/app/components/right-panel";
import { useDocumentStore } from "@/modules/documents/document-store";
import { formatDocumentType } from "@/modules/documents/document-export";
import { useSettingsStore } from "@/stores/settings-store";
import { useMemoryStore } from "@/modules/memory/memory-store";

export function DocumentsPanel() {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const documents = useDocumentStore((s) => s.documents);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const createMemoryNode = useMemoryStore((s) => s.createNode);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirmDeleteId === id) {
        void deleteDocument(id);
        setConfirmDeleteId(null);
        return;
      }
      setConfirmDeleteId(id);
    },
    [confirmDeleteId, deleteDocument],
  );

  const handleSaveToMemories = useCallback(
    (e: React.MouseEvent, doc: (typeof documents)[number]) => {
      e.stopPropagation();
      void createMemoryNode({
        folderId: "default",
        conversationId: doc.conversationId,
        projectId: doc.projectId,
        title: doc.title,
        content: doc.contentMarkdown,
        summary: doc.contentMarkdown.length > 180 ? `${doc.contentMarkdown.slice(0, 177)}…` : doc.contentMarkdown,
        type: "file_reference",
        scope: doc.isGlobal ? "global" : "conversation",
        tags: ["document", doc.type],
        importance: 4,
        confidence: 1,
        priority: "high",
        origin: "explicit_user_save",
        status: "active",
        isPinned: true,
      });
    },
    [createMemoryNode],
  );

  if (!documentPanelEnabled) return null;

  if (documents.length === 0) {
    return (
      <PanelShell title="Documents">
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-center">
          <p className="text-[11px] text-[var(--color-text-dim)]">
            No documents yet
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-text-dim)]/70">
            Ask the AI to create one
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Documents">
      <div className="space-y-1">
        {documents.slice(0, 10).map((doc) => {
          const isActive = doc.id === activeDocumentId;

          return (
            <div
              key={doc.id}
              className={`group/doc flex items-center gap-1 rounded-md transition-colors ${
                isActive
                  ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/20"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              <button
                type="button"
                onClick={() => void openDocument(doc.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[12px] transition-colors ${
                  isActive ? "text-indigo-300" : "text-[var(--color-text)]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <p className="truncate font-medium">{doc.title}</p>
                    {doc.isGlobal && (
                      <Globe className="size-3 shrink-0 text-amber-400" />
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[var(--color-text-dim)]">
                    {formatDocumentType(doc.type)}
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-35 transition-opacity group-hover/doc:opacity-100 group-focus-within/doc:opacity-100">
                <button
                  type="button"
                  title="Save to memories"
                  aria-label={`Save "${doc.title}" to memories`}
                  onClick={(e) => handleSaveToMemories(e, doc)}
                  className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-amber-400/10 hover:text-amber-300"
                >
                  <Bookmark className="size-3.5" />
                </button>
                <button
                  type="button"
                  title={confirmDeleteId === doc.id ? "Click again to delete" : "Delete document"}
                  aria-label={`Delete "${doc.title}"`}
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-300"
                >
                  {confirmDeleteId === doc.id ? (
                    <span className="text-[10px] font-semibold">Del</span>
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
        {documents.length > 10 && (
          <p className="px-2.5 pt-1 text-[10px] text-[var(--color-text-dim)]">
            +{documents.length - 10} more
          </p>
        )}
      </div>
    </PanelShell>
  );
}
