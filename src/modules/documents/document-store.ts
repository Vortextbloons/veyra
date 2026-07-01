import { create } from "zustand";
import type {
  DocumentRecord,
  DocumentVersion,
  DocumentFolder,
  DocumentStatus,
  CreateDocumentInput,
  UpdateDocumentInput,
  CreateVersionInput,
} from "@/modules/documents/document-types";
import {
  listDocuments as ipcListDocuments,
  getDocument as ipcGetDocument,
  createDocument as ipcCreateDocument,
  updateDocument as ipcUpdateDocument,
  deleteDocument as ipcDeleteDocument,
  createDocumentVersion as ipcCreateVersion,
  listDocumentVersions as ipcListVersions,
  restoreDocumentVersion as ipcRestoreVersion,
  exportDocumentMarkdown as ipcExportMarkdown,
  exportDocumentTxt as ipcExportTxt,
  listDocumentFolders as ipcListFolders,
  createDocumentFolder as ipcCreateFolder,
  updateDocumentFolder as ipcUpdateFolder,
  deleteDocumentFolder as ipcDeleteFolder,
  moveDocumentToFolder as ipcMoveToFolder,
} from "@/lib/document-storage";
import { useSettingsStore } from "@/stores/settings-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type ViewMode = "source" | "split" | "preview";
export type SortMode = "updatedAt" | "createdAt" | "title";
export type StatusFilter = DocumentStatus | "all";
export type FolderFilter = "all" | "unfiled" | string;

type DocumentStore = {
  documents: DocumentRecord[];
  activeDocumentId: string | null;
  /** In-memory draft for the active document; avoids remapping the full documents array on every keystroke. */
  activeDraftContent: string | null;
  activeConversationId: string | null;
  activeProjectId: string | null;
  versions: DocumentVersion[];
  isLoading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  _debounceTimer: ReturnType<typeof setTimeout> | null;
  _lastSavedContent: string | null;

  /** Documents tab standalone state */
  viewMode: ViewMode;
  searchQuery: string;
  statusFilter: StatusFilter;
  sortMode: SortMode;
  documentsLoaded: boolean;
  _documentsTabActive: boolean;

  /** Folder state */
  folders: DocumentFolder[];
  expandedFolderIds: Set<string>;
  selectedFolderId: FolderFilter;
  selectedDocumentIds: Set<string>;

  hydrateDocuments: () => Promise<void>;
  loadAllDocuments: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  setActiveProjectId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  setSortMode: (mode: SortMode) => void;
  setDocumentsTabActive: (active: boolean) => void;

  createDocument: (input: CreateDocumentInput) => Promise<DocumentRecord>;
  updateDocument: (input: UpdateDocumentInput) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  toggleGlobal: (id: string) => Promise<void>;

  openDocument: (id: string) => Promise<void>;
  closeDocument: () => Promise<void>;

  setContent: (content: string) => void;
  saveNow: () => Promise<void>;

  loadVersions: (documentId: string) => Promise<void>;
  restoreVersion: (versionId: string) => Promise<void>;
  createVersionSnapshot: (input: CreateVersionInput) => Promise<DocumentVersion>;

  exportMarkdown: () => Promise<string | null>;
  exportTxt: () => Promise<string | null>;

  /** Folder actions */
  loadFolders: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<DocumentFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveDocumentToFolder: (documentId: string, folderId?: string) => Promise<void>;
  toggleFolderExpanded: (id: string) => void;
  selectFolder: (id: FolderFilter) => void;

  /** Bulk selection actions */
  toggleDocumentSelected: (id: string) => void;
  selectAllDocuments: () => void;
  clearSelection: () => void;
};

function replaceDocument(documents: DocumentRecord[], doc: DocumentRecord): DocumentRecord[] {
  const idx = documents.findIndex((d) => d.id === doc.id);
  if (idx === -1) return [doc, ...documents];
  const next = [...documents];
  next[idx] = doc;
  return next;
}

function removeDocument(documents: DocumentRecord[], id: string): DocumentRecord[] {
  return documents.filter((d) => d.id !== id);
}

export function selectActiveDocumentContent(state: DocumentStore): string {
  const { activeDocumentId, activeDraftContent, documents } = state;
  if (!activeDocumentId) return "";
  if (activeDraftContent !== null) return activeDraftContent;
  const doc = documents.find((item) => item.id === activeDocumentId);
  return doc?.contentMarkdown ?? "";
}

export function selectActiveDocumentMeta(
  state: DocumentStore,
): { id: string; title: string; type: string } | undefined {
  const { activeDocumentId, documents } = state;
  if (!activeDocumentId) return undefined;
  const doc = documents.find((item) => item.id === activeDocumentId);
  if (doc) {
    return { id: doc.id, title: doc.title, type: doc.type };
  }
  return { id: activeDocumentId, title: "Active document", type: "document" };
}

async function mergeActiveDocument(
  documents: DocumentRecord[],
  activeDocumentId: string | null,
): Promise<{ documents: DocumentRecord[]; clearActive: boolean }> {
  if (!activeDocumentId || documents.some((doc) => doc.id === activeDocumentId)) {
    return { documents, clearActive: false };
  }
  try {
    const activeDoc = await ipcGetDocument(activeDocumentId);
    return { documents: [activeDoc, ...documents], clearActive: false };
  } catch {
    return { documents, clearActive: true };
  }
}

/** Pure helper for filtering/sorting documents. Used by DocumentListPanel and tests. */
export function filterDocuments(
  documents: DocumentRecord[],
  searchQuery: string,
  statusFilter: StatusFilter,
  sortMode: SortMode,
  folderFilter?: FolderFilter,
): DocumentRecord[] {
  let filtered = documents;

  if (statusFilter !== "all") {
    filtered = filtered.filter((d) => d.status === statusFilter);
  }

  // Filter by folder
  if (folderFilter && folderFilter !== "all") {
    if (folderFilter === "unfiled") {
      filtered = filtered.filter((d) => !d.folderId);
    } else {
      filtered = filtered.filter((d) => d.folderId === folderFilter);
    }
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.contentMarkdown.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  const sorted = [...filtered];
  if (sortMode === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    sorted.sort((a, b) => {
      const aVal = a[sortMode] ?? "";
      const bVal = b[sortMode] ?? "";
      return bVal.localeCompare(aVal);
    });
  }

  return sorted;
}

let hydrationPromise: Promise<void> | null = null;

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  activeDraftContent: null,
  activeConversationId: null,
  activeProjectId: null,
  versions: [],
  isLoading: false,
  error: null,
  saveStatus: "idle",
  _debounceTimer: null,
  _lastSavedContent: null,

  viewMode: "split",
  searchQuery: "",
  statusFilter: "all",
  sortMode: "updatedAt",
  documentsLoaded: false,
  _documentsTabActive: false,

  folders: [],
  expandedFolderIds: new Set<string>(),
  selectedFolderId: "all",
  selectedDocumentIds: new Set<string>(),

  hydrateDocuments: async () => {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      try {
        if (get()._documentsTabActive) {
          return;
        }
        set({ isLoading: true, error: null });
        const conversationId = get().activeConversationId ?? undefined;
        const projectId = get().activeProjectId ?? undefined;
        let documents = await ipcListDocuments(projectId, conversationId);
        const { documents: mergedDocuments, clearActive } = await mergeActiveDocument(
          documents,
          get().activeDocumentId,
        );
        documents = mergedDocuments;
        set({
          documents,
          isLoading: false,
          documentsLoaded: true,
          ...(clearActive
            ? {
                activeDocumentId: null,
                activeDraftContent: null,
                versions: [],
                _lastSavedContent: null,
              }
            : {}),
        });
      } catch (error) {
        set({ error: String(error), isLoading: false });
      } finally {
        hydrationPromise = null;
      }
    })();
    return hydrationPromise;
  },

  loadAllDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const [documents, folders] = await Promise.all([
        ipcListDocuments(undefined, undefined),
        ipcListFolders(undefined),
      ]);
      set({ documents, folders, isLoading: false, documentsLoaded: true });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  setActiveConversationId: (id) => {
    set({ activeConversationId: id });
    hydrationPromise = null;
    void get().hydrateDocuments();
  },

  setActiveProjectId: (id) => {
    set({ activeProjectId: id });
    hydrationPromise = null;
    void get().hydrateDocuments();
  },

  setViewMode: (viewMode) => set({ viewMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSortMode: (sortMode) => set({ sortMode }),
  setDocumentsTabActive: (documentsTabActive) => {
    set({ _documentsTabActive: documentsTabActive });
    if (!documentsTabActive) {
      hydrationPromise = null;
      void get().hydrateDocuments();
    }
  },

  createDocument: async (input) => {
    try {
      const conversationId = input.conversationId ?? get().activeConversationId ?? undefined;
      const doc = await ipcCreateDocument({ ...input, conversationId });
      const shouldOpen = useSettingsStore.getState().documentAutoOpenOnCreate;
      set((state) => ({
        documents: [doc, ...state.documents],
        activeDocumentId: shouldOpen ? doc.id : state.activeDocumentId,
        activeDraftContent: shouldOpen ? doc.contentMarkdown : state.activeDraftContent,
        versions: shouldOpen ? [] : state.versions,
        _lastSavedContent: shouldOpen ? doc.contentMarkdown : state._lastSavedContent,
      }));
      return doc;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateDocument: async (input) => {
    try {
      const doc = await ipcUpdateDocument(input);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
        activeDraftContent:
          state.activeDocumentId === doc.id ? doc.contentMarkdown : state.activeDraftContent,
        _lastSavedContent:
          state.activeDocumentId === doc.id ? doc.contentMarkdown : state._lastSavedContent,
        saveStatus: "saved",
      }));
    } catch (error) {
      set({ error: String(error), saveStatus: "error" });
      throw error;
    }
  },

  deleteDocument: async (id) => {
    try {
      await ipcDeleteDocument(id);
      set((state) => {
        const isActive = state.activeDocumentId === id;
        return {
          documents: removeDocument(state.documents, id),
          ...(isActive
            ? { activeDocumentId: null, activeDraftContent: null, versions: [], _lastSavedContent: null }
            : {}),
        };
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  renameDocument: async (id, title) => {
    await get().updateDocument({ id, title });
  },

  toggleGlobal: async (id) => {
    const doc = get().documents.find((d) => d.id === id);
    if (!doc) return;
    await get().updateDocument({ id, isGlobal: !doc.isGlobal });
  },

  openDocument: async (id) => {
    set({ activeDocumentId: id, activeDraftContent: null, versions: [], isLoading: true });
    try {
      const [doc, versions] = await Promise.all([
        ipcGetDocument(id),
        ipcListVersions(id),
      ]);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
        activeDraftContent: doc.contentMarkdown,
        versions,
        isLoading: false,
        _lastSavedContent: doc.contentMarkdown,
        saveStatus: "idle",
      }));
    } catch (error) {
      set({
        error: String(error),
        isLoading: false,
        activeDocumentId: null,
        activeDraftContent: null,
        versions: [],
        _lastSavedContent: null,
      });
    }
  },

  closeDocument: async () => {
    const state = get();
    if (state._debounceTimer) {
      clearTimeout(state._debounceTimer);
    }
    await get().saveNow();
    set({
      activeDocumentId: null,
      activeDraftContent: null,
      versions: [],
      _debounceTimer: null,
      _lastSavedContent: null,
      saveStatus: "idle",
    });
  },

  setContent: (content) => {
    const state = get();
    const activeId = state.activeDocumentId;
    if (!activeId) return;

    set({ activeDraftContent: content, saveStatus: "saving" });

    if (state._debounceTimer) {
      clearTimeout(state._debounceTimer);
    }
    const settings = useSettingsStore.getState();
    if (!settings.documentAutoSaveEnabled) {
      set({ _debounceTimer: null, saveStatus: "idle" });
      return;
    }
    const timer = setTimeout(() => {
      void get().saveNow();
    }, settings.documentAutoSaveDelay);
    set({ _debounceTimer: timer });
  },

  saveNow: async () => {
    const state = get();
    const activeId = state.activeDocumentId;
    if (!activeId) return;

    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return;

    const content = state.activeDraftContent ?? doc.contentMarkdown;
    if (content === state._lastSavedContent) {
      set({ saveStatus: "saved" });
      return;
    }

    try {
      if (state._debounceTimer) {
        clearTimeout(state._debounceTimer);
        set({ _debounceTimer: null });
      }
      const saved = await ipcUpdateDocument({
        id: activeId,
        contentMarkdown: content,
      });
      const version = await ipcCreateVersion({
        documentId: activeId,
        contentMarkdown: saved.contentMarkdown,
        changeSource: "user",
        changeSummary: "Manual edit",
      });
      set((current) => ({
        documents: replaceDocument(current.documents, saved),
        activeDraftContent: saved.contentMarkdown,
        versions: current.activeDocumentId === activeId ? [version, ...current.versions] : current.versions,
        _lastSavedContent: saved.contentMarkdown,
        saveStatus: "saved",
      }));
    } catch (error) {
      set({ error: String(error), saveStatus: "error" });
    }
  },

  loadVersions: async (documentId) => {
    try {
      const versions = await ipcListVersions(documentId);
      set({ versions });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  restoreVersion: async (versionId) => {
    try {
      const store = get();
      const currentDoc = store.documents.find((doc) => doc.id === store.activeDocumentId);
      if (currentDoc) {
        await ipcCreateVersion({
          documentId: currentDoc.id,
          contentMarkdown: store.activeDraftContent ?? currentDoc.contentMarkdown,
          changeSource: "user",
          changeSummary: "Before version restore",
        });
      }
      const doc = await ipcRestoreVersion(versionId);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
        activeDraftContent: doc.contentMarkdown,
        _lastSavedContent: doc.contentMarkdown,
        saveStatus: "saved",
      }));
      await get().loadVersions(doc.id);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createVersionSnapshot: async (input) => {
    try {
      const version = await ipcCreateVersion(input);
      set((state) => ({
        versions: state.activeDocumentId === version.documentId
          ? [version, ...state.versions]
          : state.versions,
      }));
      return version;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  exportMarkdown: async () => {
    const state = get();
    const activeId = state.activeDocumentId;
    if (!activeId) return null;
    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return null;

    await get().saveNow();

    const safeName = doc.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "document";
    return ipcExportMarkdown(activeId, `${safeName}.md`);
  },

  exportTxt: async () => {
    const state = get();
    const activeId = state.activeDocumentId;
    if (!activeId) return null;
    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return null;

    await get().saveNow();

    const safeName = doc.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "document";
    return ipcExportTxt(activeId, `${safeName}.txt`);
  },

  // Folder actions
  loadFolders: async () => {
    try {
      const folders = await ipcListFolders(undefined);
      set({ folders });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createFolder: async (name, parentId) => {
    try {
      const folder = await ipcCreateFolder({ name, parentId });
      set((state) => ({
        folders: [...state.folders, folder],
        expandedFolderIds: parentId
          ? new Set([...state.expandedFolderIds, parentId])
          : state.expandedFolderIds,
      }));
      return folder;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  renameFolder: async (id, name) => {
    try {
      const folder = await ipcUpdateFolder({ id, name });
      set((state) => ({
        folders: state.folders.map((f) => (f.id === id ? folder : f)),
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteFolder: async (id) => {
    try {
      await ipcDeleteFolder(id);
      // Re-fetch folders to get the updated tree (child folders moved to root)
      const folders = await ipcListFolders(undefined);
      set((state) => ({
        documents: state.documents.map((d) =>
          d.folderId === id ? { ...d, folderId: undefined } : d,
        ),
        folders,
        selectedFolderId: state.selectedFolderId === id ? "all" : state.selectedFolderId,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  moveDocumentToFolder: async (documentId, folderId) => {
    try {
      const doc = await ipcMoveToFolder(documentId, folderId);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  toggleFolderExpanded: (id) => {
    set((state) => {
      const next = new Set(state.expandedFolderIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedFolderIds: next };
    });
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id, selectedDocumentIds: new Set() });
  },

  // Bulk selection actions
  toggleDocumentSelected: (id) => {
    set((state) => {
      const next = new Set(state.selectedDocumentIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedDocumentIds: next };
    });
  },

  selectAllDocuments: () => {
    const state = get();
    const filteredDocs = filterDocuments(
      state.documents,
      state.searchQuery,
      state.statusFilter,
      state.sortMode,
      state.selectedFolderId,
    );
    set({ selectedDocumentIds: new Set(filteredDocs.map((d) => d.id)) });
  },

  clearSelection: () => {
    set({ selectedDocumentIds: new Set() });
  },
}));

// Sync active conversation from chat store → document store for per-session filtering
import { useChatStore } from "@/stores/chat-store";
let _lastSyncedConversationId: string | null | undefined;
useChatStore.subscribe((state) => {
  const cid = state.activeConversationId;
  if (cid !== _lastSyncedConversationId) {
    _lastSyncedConversationId = cid;
    useDocumentStore.getState().setActiveConversationId(cid);
  }
});

// Sync active project from project store → document store for per-project filtering
import { useProjectStore } from "@/modules/projects/project-store";
let _lastSyncedProjectId: string | null | undefined;
useProjectStore.subscribe((state) => {
  const pid = state.activeProjectId;
  if (pid !== _lastSyncedProjectId) {
    _lastSyncedProjectId = pid;
    useDocumentStore.getState().setActiveProjectId(pid);
  }
});
