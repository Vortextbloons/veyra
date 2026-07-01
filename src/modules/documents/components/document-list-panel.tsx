import { Search, Plus, ChevronDown, ChevronRight, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core";
import { useDocumentStore, filterDocuments } from "../document-store";
import type { StatusFilter } from "../document-store";
import { DocumentCard } from "./document-card";
import { DocumentFolderTree } from "./document-folder-tree";
import { DOCUMENT_TEMPLATES } from "../document-templates";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Final", value: "final" },
  { label: "Archived", value: "archived" },
];

export function DocumentListPanel() {
  const allDocuments = useDocumentStore((s) => s.documents);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const searchQuery = useDocumentStore((s) => s.searchQuery);
  const statusFilter = useDocumentStore((s) => s.statusFilter);
  const sortMode = useDocumentStore((s) => s.sortMode);
  const selectedFolderId = useDocumentStore((s) => s.selectedFolderId);
  const folders = useDocumentStore((s) => s.folders);
  const isLoading = useDocumentStore((s) => s.isLoading);
  const documentsLoaded = useDocumentStore((s) => s.documentsLoaded);
  const setSearchQuery = useDocumentStore((s) => s.setSearchQuery);
  const setStatusFilter = useDocumentStore((s) => s.setStatusFilter);
  const setSortMode = useDocumentStore((s) => s.setSortMode);
  const selectFolder = useDocumentStore((s) => s.selectFolder);
  const createDocument = useDocumentStore((s) => s.createDocument);
  const moveDocumentToFolder = useDocumentStore((s) => s.moveDocumentToFolder);
  const documentListDensity = useSettingsStore((s) => s.documentListDensity);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;

      const documentId = String(active.id);
      const overId = String(over.id);

      // Determine target folder
      let targetFolderId: string | undefined;
      if (overId === "folder-root") {
        targetFolderId = undefined;
      } else if (overId === "folder-unfiled") {
        targetFolderId = undefined;
      } else if (overId.startsWith("folder-")) {
        targetFolderId = overId.replace("folder-", "");
      } else {
        return;
      }

      void moveDocumentToFolder(documentId, targetFolderId);
    },
    [moveDocumentToFolder],
  );

  // Determine folder filter value
  // "all" = show everything
  // "unfiled" = show only documents without folderId
  // string = specific folder ID
  const folderFilter = selectedFolderId;

  const documents = useMemo(
    () => filterDocuments(allDocuments, searchQuery, statusFilter, sortMode, folderFilter),
    [allDocuments, searchQuery, statusFilter, sortMode, folderFilter],
  );

  // Get current folder name for breadcrumb
  const currentFolderName = useMemo(() => {
    if (folderFilter === "all") return null;
    if (folderFilter === "unfiled") return "Unfiled";
    const folder = folders.find((f) => f.id === folderFilter);
    return folder?.name ?? "Unknown Folder";
  }, [folderFilter, folders]);

  const handleNewDocument = useCallback(
    (templateId?: string) => {
      const template = templateId ? DOCUMENT_TEMPLATES.find((t) => t.id === templateId) : undefined;
      const folderId = folderFilter !== "all" && folderFilter !== "unfiled" ? folderFilter : undefined;
      void createDocument({
        title: template?.name ?? "Untitled Document",
        type: template?.type ?? "document",
        contentMarkdown: template?.contentMarkdown ?? "",
        isGlobal: true,
        tags: template?.tags,
        folderId,
      });
      setShowNewMenu(false);
    },
    [createDocument, folderFilter],
  );

  const sortLabels: Record<string, string> = {
    updatedAt: "Recently Updated",
    createdAt: "Created",
    title: "Alphabetical",
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="document-list-panel flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-[13px] font-semibold text-[var(--color-text)]">
            Documents
            {documentsLoaded && (
              <span className="ml-1.5 text-[var(--color-text-dim)]">({documents.length})</span>
            )}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-[12px] font-medium text-white hover:brightness-110"
            >
              <Plus className="size-3" />
              New
            </button>
            {showNewMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowNewMenu(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleNewDocument()}
                    className="flex w-full items-center px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
                  >
                    Blank Document
                  </button>
                  <div className="border-t border-[var(--color-border)] my-1" />
                  <div className="px-3 py-1 text-[10px] font-medium text-[var(--color-text-dim)] uppercase">
                    From Template
                  </div>
                  {DOCUMENT_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleNewDocument(template.id)}
                      className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-white/[0.03]"
                    >
                      <span className="text-[12px] text-[var(--color-text)]">{template.name}</span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">{template.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-md border border-[var(--color-border)] bg-white/[0.03] py-1.5 pl-7 pr-2 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)]/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Folder tree */}
        <DocumentFolderTree />

        {/* Breadcrumb when folder is selected */}
        {currentFolderName && (
          <div className="flex items-center gap-1 px-3 py-1 text-[11px]">
            <button
              type="button"
              onClick={() => selectFolder("all")}
              className="text-[var(--color-accent)] hover:underline"
            >
              All
            </button>
            <ChevronRight className="size-3 text-[var(--color-text-dim)]" />
            <span className="text-[var(--color-text)]">{currentFolderName}</span>
            <button
              type="button"
              onClick={() => selectFolder("all")}
              className="ml-auto text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 px-3 pb-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                statusFilter === f.value
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative px-3 pb-2">
          <button
            type="button"
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {sortLabels[sortMode]}
            <ChevronDown className="size-3" />
          </button>
          {showSortMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSortMenu(false)}
              />
              <div className="absolute left-3 z-20 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                {Object.entries(sortLabels).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSortMode(key as typeof sortMode);
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                      sortMode === key
                        ? "text-white bg-[var(--color-accent-soft)]"
                        : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {isLoading && documents.length === 0 ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-white/[0.03]"
                />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <p className="text-[13px] text-[var(--color-text-dim)]">
                {searchQuery || statusFilter !== "all"
                  ? "No documents match your search."
                  : "No documents yet."}
              </p>
              {!searchQuery && statusFilter === "all" && (
                <button
                  type="button"
                  onClick={() => handleNewDocument()}
                  className="text-[12px] text-[var(--color-accent)] hover:underline"
                >
                  Create your first document
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  isActive={doc.id === activeDocumentId}
                  compact={documentListDensity === "compact"}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <DragOverlay>
        {activeDragId ? (
          <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-3 py-2 text-[12px] text-white opacity-80">
            {allDocuments.find((d) => d.id === activeDragId)?.title ?? "Document"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
