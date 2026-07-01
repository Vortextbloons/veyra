import { useState, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { useDocumentStore } from "../document-store";
import type { DocumentFolder } from "../document-types";
import type { FolderFilter } from "../document-store";
import { cn } from "@/lib/utils";

interface FolderNodeProps {
  folder: DocumentFolder;
  depth: number;
  allFolders: DocumentFolder[];
  documents: Array<{ folderId?: string }>;
  documentCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  expandedFolderIds: Set<string>;
  selectedFolderId: FolderFilter;
  onToggle: (id: string) => void;
  onSelect: (id: FolderFilter) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
}

function FolderNode({
  folder,
  depth,
  allFolders,
  documents,
  documentCount,
  isExpanded,
  isSelected,
  expandedFolderIds,
  selectedFolderId,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onCreateSubfolder,
}: FolderNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [showContextMenu, setShowContextMenu] = useState(false);

  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditName(folder.name);
  }, [folder.name]);

  const handleSubmitRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setIsEditing(false);
  }, [editName, folder.id, folder.name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmitRename();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditName(folder.name);
      }
    },
    [handleSubmitRename, folder.name],
  );

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors cursor-pointer",
          isSelected
            ? "bg-[var(--color-accent-soft)] text-white"
            : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
          isOver && "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]/50",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(folder.id)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowContextMenu(true);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(folder.id);
          }}
          className="flex shrink-0 items-center justify-center"
        >
          {isExpanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>

        {isExpanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-[var(--color-accent)]" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-[var(--color-accent)]" />
        )}

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSubmitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none p-0 text-[12px] text-[var(--color-text)] outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}

        <span className="text-[10px] text-[var(--color-text-dim)]">
          {documentCount}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowContextMenu(true);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="size-3" />
        </button>
      </div>

      {showContextMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowContextMenu(false)}
          />
          <div className="absolute left-0 z-20 mt-1 w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setShowContextMenu(false);
                setIsEditing(true);
                setEditName(folder.name);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
            >
              <Pencil className="size-3" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setShowContextMenu(false);
                onCreateSubfolder(folder.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
            >
              <Plus className="size-3" />
              New Subfolder
            </button>
            <button
              type="button"
              onClick={() => {
                setShowContextMenu(false);
                onDelete(folder.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-white/[0.03]"
            >
              <Trash2 className="size-3" />
              Delete
            </button>
          </div>
        </>
      )}

      {isExpanded &&
        allFolders
          .filter((f) => f.parentId === folder.id)
          .map((child) => {
            const childCount = documents.filter((d) => d.folderId === child.id).length +
              allFolders.filter((f) => f.parentId === child.id).reduce(
                (sum, sub) => sum + documents.filter((d) => d.folderId === sub.id).length,
                0,
              );
            return (
              <FolderNode
                key={child.id}
                folder={child}
                depth={depth + 1}
                allFolders={allFolders}
                documents={documents}
                documentCount={childCount}
                isExpanded={expandedFolderIds.has(child.id)}
                isSelected={selectedFolderId === child.id}
                expandedFolderIds={expandedFolderIds}
                selectedFolderId={selectedFolderId}
                onToggle={onToggle}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onCreateSubfolder={onCreateSubfolder}
              />
            );
          })}
    </div>
  );
}

export function DocumentFolderTree() {
  const folders = useDocumentStore((s) => s.folders);
  const documents = useDocumentStore((s) => s.documents);
  const expandedFolderIds = useDocumentStore((s) => s.expandedFolderIds);
  const selectedFolderId = useDocumentStore((s) => s.selectedFolderId);
  const toggleFolderExpanded = useDocumentStore((s) => s.toggleFolderExpanded);
  const selectFolder = useDocumentStore((s) => s.selectFolder);
  const createFolder = useDocumentStore((s) => s.createFolder);
  const renameFolder = useDocumentStore((s) => s.renameFolder);
  const deleteFolder = useDocumentStore((s) => s.deleteFolder);

  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | undefined>();

  // Build folder tree structure
  const folderTree = useMemo(() => {
    const rootFolders = folders.filter((f) => !f.parentId);
    return rootFolders;
  }, [folders]);

  // Get document count for a folder (including subfolders)
  const getDocumentCount = useMemo(() => {
    const countDocs = (folderId: string): number => {
      let count = documents.filter((d) => d.folderId === folderId).length;
      const childFolders = folders.filter((f) => f.parentId === folderId);
      for (const child of childFolders) {
        count += countDocs(child.id);
      }
      return count;
    };
    return countDocs;
  }, [documents, folders]);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    try {
      await createFolder(trimmed, newFolderParentId);
      setNewFolderName("");
      setShowNewFolderInput(false);
      setNewFolderParentId(undefined);
    } catch {
      // Error is handled by the store
    }
  }, [newFolderName, newFolderParentId, createFolder]);

  const handleCreateSubfolder = useCallback((parentId: string) => {
    setNewFolderParentId(parentId);
    setShowNewFolderInput(true);
    setNewFolderName("");
  }, []);

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (window.confirm("Delete this folder? Documents will be moved to the root.")) {
        await deleteFolder(id);
      }
    },
    [deleteFolder],
  );

  const unfiledCount = documents.filter((d) => !d.folderId).length;

  const { setNodeRef: setAllRef, isOver: isAllOver } = useDroppable({ id: "folder-root" });
  const { setNodeRef: setUnfiledRef, isOver: isUnfiledOver } = useDroppable({ id: "folder-unfiled" });

  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[11px] font-medium text-[var(--color-text-dim)] uppercase tracking-wider">
          Folders
        </span>
        <button
          type="button"
          onClick={() => {
            setShowNewFolderInput(true);
            setNewFolderParentId(undefined);
            setNewFolderName("");
          }}
          className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          <Plus className="size-3" />
          New
        </button>
      </div>

      <div className="px-1 pb-2">
        {/* All documents */}
        <div
          ref={setAllRef}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-[12px] cursor-pointer transition-colors",
            selectedFolderId === "all"
              ? "bg-[var(--color-accent-soft)] text-white"
              : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
            isAllOver && "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]/50",
          )}
          onClick={() => selectFolder("all")}
        >
          <Folder className="size-3.5 shrink-0 text-[var(--color-accent)]" />
          <span className="flex-1">All Documents</span>
          <span className="text-[10px] text-[var(--color-text-dim)]">
            {documents.length}
          </span>
        </div>

        {/* Unfiled documents */}
        <div
          ref={setUnfiledRef}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-[12px] cursor-pointer transition-colors",
            selectedFolderId === "unfiled"
              ? "bg-[var(--color-accent-soft)] text-white"
              : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]",
            isUnfiledOver && "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]/50",
          )}
          onClick={() => selectFolder("unfiled")}
        >
          <Folder className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
          <span className="flex-1">Unfiled</span>
          <span className="text-[10px] text-[var(--color-text-dim)]">
            {unfiledCount}
          </span>
        </div>

        {/* Folder tree */}
        {folderTree.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            allFolders={folders}
            documents={documents}
            documentCount={getDocumentCount(folder.id)}
            isExpanded={expandedFolderIds.has(folder.id)}
            isSelected={selectedFolderId === folder.id}
            expandedFolderIds={expandedFolderIds}
            selectedFolderId={selectedFolderId}
            onToggle={toggleFolderExpanded}
            onSelect={selectFolder}
            onRename={renameFolder}
            onDelete={handleDeleteFolder}
            onCreateSubfolder={handleCreateSubfolder}
          />
        ))}

        {/* New folder input */}
        {showNewFolderInput && (
          <div className="flex items-center gap-1 px-2 py-1">
            <Folder className="size-3.5 shrink-0 text-[var(--color-accent)]" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreateFolder();
                } else if (e.key === "Escape") {
                  setShowNewFolderInput(false);
                  setNewFolderName("");
                  setNewFolderParentId(undefined);
                }
              }}
              onBlur={() => {
                if (newFolderName.trim()) {
                  void handleCreateFolder();
                } else {
                  setShowNewFolderInput(false);
                  setNewFolderParentId(undefined);
                }
              }}
              placeholder="Folder name..."
              className="flex-1 bg-transparent border-none p-0 text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
