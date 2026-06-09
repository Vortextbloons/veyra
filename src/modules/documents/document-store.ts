import { create } from "zustand";
import type {
  DocumentRecord,
  DocumentVersion,
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
} from "@/lib/document-storage";
import { useSettingsStore } from "@/stores/settings-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type DocumentStore = {
  documents: DocumentRecord[];
  activeDocumentId: string | null;
  activeConversationId: string | null;
  activeProjectId: string | null;
  versions: DocumentVersion[];
  isLoading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  _debounceTimer: ReturnType<typeof setTimeout> | null;
  _lastSavedContent: string | null;

  hydrateDocuments: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  setActiveProjectId: (id: string | null) => void;

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

let hydrationPromise: Promise<void> | null = null;

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  activeConversationId: null,
  activeProjectId: null,
  versions: [],
  isLoading: false,
  error: null,
  saveStatus: "idle",
  _debounceTimer: null,
  _lastSavedContent: null,

  hydrateDocuments: async () => {
    if (get().isLoading && get().documents.length > 0) return;
    hydrationPromise ??= (async () => {
      set({ isLoading: true, error: null });
      try {
        const conversationId = get().activeConversationId ?? undefined;
        const projectId = get().activeProjectId ?? undefined;
        const documents = await ipcListDocuments(projectId, conversationId);
        set({ documents, isLoading: false });
      } catch (error) {
        set({ error: String(error), isLoading: false });
      }
    })();
    return hydrationPromise;
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

  createDocument: async (input) => {
    try {
      const conversationId = input.conversationId ?? get().activeConversationId ?? undefined;
      const doc = await ipcCreateDocument({ ...input, conversationId });
      const shouldOpen = useSettingsStore.getState().documentAutoOpenOnCreate;
      set((state) => ({
        documents: [doc, ...state.documents],
        activeDocumentId: shouldOpen ? doc.id : state.activeDocumentId,
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
        _lastSavedContent: doc.contentMarkdown,
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
          ...(isActive ? { activeDocumentId: null, versions: [], _lastSavedContent: null } : {}),
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
    set({ activeDocumentId: id, versions: [], isLoading: true });
    try {
      const [doc, versions] = await Promise.all([
        ipcGetDocument(id),
        ipcListVersions(id),
      ]);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
        versions,
        isLoading: false,
        _lastSavedContent: doc.contentMarkdown,
        saveStatus: "idle",
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
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

    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === activeId ? { ...d, contentMarkdown: content, updatedAt: new Date().toISOString() } : d
      ),
      saveStatus: "saving",
    }));

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

    if (doc.contentMarkdown === state._lastSavedContent) {
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
        contentMarkdown: doc.contentMarkdown,
      });
      const version = await ipcCreateVersion({
        documentId: activeId,
        contentMarkdown: saved.contentMarkdown,
        changeSource: "user",
        changeSummary: "Manual edit",
      });
      set((current) => ({
        documents: replaceDocument(current.documents, saved),
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
      const currentDoc = get().documents.find((doc) => doc.id === get().activeDocumentId);
      if (currentDoc) {
        await ipcCreateVersion({
          documentId: currentDoc.id,
          contentMarkdown: currentDoc.contentMarkdown,
          changeSource: "user",
          changeSummary: "Before version restore",
        });
      }
      const doc = await ipcRestoreVersion(versionId);
      set((state) => ({
        documents: replaceDocument(state.documents, doc),
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
