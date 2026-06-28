import { Search, Plus, ChevronDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useDocumentStore, filterDocuments } from "../document-store";
import type { StatusFilter } from "../document-store";
import { DocumentCard } from "./document-card";
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
  const isLoading = useDocumentStore((s) => s.isLoading);
  const documentsLoaded = useDocumentStore((s) => s.documentsLoaded);
  const setSearchQuery = useDocumentStore((s) => s.setSearchQuery);
  const setStatusFilter = useDocumentStore((s) => s.setStatusFilter);
  const setSortMode = useDocumentStore((s) => s.setSortMode);
  const createDocument = useDocumentStore((s) => s.createDocument);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const documents = useMemo(
    () => filterDocuments(allDocuments, searchQuery, statusFilter, sortMode),
    [allDocuments, searchQuery, statusFilter, sortMode],
  );

  const handleNewDocument = useCallback(() => {
    void createDocument({
      title: "Untitled Document",
      type: "document",
      contentMarkdown: "",
      isGlobal: true,
    });
  }, [createDocument]);

  const sortLabels: Record<string, string> = {
    updatedAt: "Recently Updated",
    createdAt: "Created",
    title: "Alphabetical",
  };

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[13px] font-semibold text-[var(--color-text)]">
          Documents
          {documentsLoaded && (
            <span className="ml-1.5 text-[var(--color-text-dim)]">({documents.length})</span>
          )}
        </span>
        <button
          type="button"
          onClick={handleNewDocument}
          className="flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-[12px] font-medium text-white hover:brightness-110"
        >
          <Plus className="size-3" />
          New
        </button>
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
                onClick={handleNewDocument}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
