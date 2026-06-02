// Memory store — the central Zustand state for the Memory feature.
//
// All Tauri IPC for memory goes through @/lib/memory-storage, never directly
// through @tauri-apps/api/core. The store hydrates from the backend on mount
// and exposes view / selection / mutation actions for the UI to call.

import { create } from "zustand";
import type {
  CreateMemoryNode,
  MemoryFile,
  MemoryFolder,
  MemoryNode,
  UpdateMemoryNode,
} from "@/lib/memory-types";
import {
  archiveMemoryNode as ipcArchive,
  createMemoryNode as ipcCreate,
  deleteMemoryNode as ipcDelete,
  listMemoryFiles as ipcListFiles,
  listMemoryFolders as ipcListFolders,
  listMemoryNodes as ipcListNodes,
  pinMemoryNode as ipcPin,
  updateMemoryNode as ipcUpdate,
} from "@/lib/memory-storage";

const pendingCreateIds = new Set<string>();

export type MemoryView = "all" | "inbox" | "pinned" | "permanent" | "low_priority" | "recent" | "archived";

export type MemoryStore = {
  folders: MemoryFolder[];
  files: MemoryFile[];
  nodes: MemoryNode[];
  selectedFolderId: string | null;
  selectedFileId: string | null;
  selectedNodeId: string | null;
  activeView: MemoryView;
  query: string;
  isLoading: boolean;
  error: string | null;

  hydrateMemory: () => Promise<void>;
  selectFolder: (id: string | null) => void;
  selectFile: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  setQuery: (query: string) => void;
  setActiveView: (view: MemoryView) => void;

  createNode: (input: Omit<CreateMemoryNode, "id"> & { id?: string }) => Promise<void>;
  updateNode: (input: UpdateMemoryNode) => Promise<void>;
  archiveNode: (id: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  pinNode: (id: string, pinned: boolean) => Promise<void>;
  approveNode: (id: string) => Promise<void>;
  rejectNode: (id: string) => Promise<void>;
};

function replaceNode(nodes: MemoryNode[], next: MemoryNode): MemoryNode[] {
  const idx = nodes.findIndex((n) => n.id === next.id);
  if (idx === -1) return [next, ...nodes];
  const copy = nodes.slice();
  copy[idx] = next;
  return copy;
}

function matchesQuery(node: MemoryNode, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (node.title.toLowerCase().includes(needle)) return true;
  if (node.summary.toLowerCase().includes(needle)) return true;
  if (node.content.toLowerCase().includes(needle)) return true;
  if (node.tags.some((t) => t.toLowerCase().includes(needle))) return true;
  return false;
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  folders: [],
  files: [],
  nodes: [],
  selectedFolderId: null,
  selectedFileId: null,
  selectedNodeId: null,
  activeView: "all",
  query: "",
  isLoading: false,
  error: null,

  hydrateMemory: async () => {
    set({ isLoading: true, error: null });
    try {
      const [folders, files, nodes] = await Promise.all([
        ipcListFolders(),
        ipcListFiles(),
        ipcListNodes({}),
      ]);
      set({ folders, files, nodes, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  selectFolder: (selectedFolderId) => set({ selectedFolderId }),
  selectFile: (selectedFileId) => set({ selectedFileId }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  setQuery: (query) => set({ query }),
  setActiveView: (activeView) => set({ activeView }),

  createNode: async (input) => {
    const id = input.id ?? crypto.randomUUID();
    if (pendingCreateIds.has(id) || get().nodes.some((node) => node.id === id)) return;
    pendingCreateIds.add(id);
    try {
      const node = await ipcCreate({ ...input, id });
      set((state) => ({ nodes: [node, ...state.nodes] }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      pendingCreateIds.delete(id);
    }
  },

  updateNode: async (input) => {
    try {
      const node = await ipcUpdate(input);
      set((state) => ({ nodes: replaceNode(state.nodes, node) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  archiveNode: async (id) => {
    try {
      await ipcArchive(id);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, status: "archived" } : n,
        ),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  deleteNode: async (id) => {
    try {
      await ipcDelete(id);
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  pinNode: async (id, pinned) => {
    try {
      await ipcPin(id, pinned);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, isPinned: pinned } : n,
        ),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  approveNode: async (id) => {
    await get().updateNode({ id, status: "approved" });
  },

  rejectNode: async (id) => {
    await get().updateNode({ id, status: "rejected" });
  },
}));

/**
 * Pure selectors (not store members) for the UI to filter the node list.
 */
export function selectVisibleNodes(
  state: Pick<MemoryStore, "nodes">,
  view: MemoryView,
  query: string,
): MemoryNode[] {
  const q = query.trim();
  const visibleByView = state.nodes.filter((node) => {
    switch (view) {
      case "all":
        return node.status !== "archived";
      case "inbox":
        return node.status === "needs_review";
      case "pinned":
        return (
          node.isPinned &&
          node.status !== "archived" &&
          node.status !== "rejected"
        );
      case "permanent":
        return (
          (node.isPinned || node.priority === "permanent" || node.importance >= 5) &&
          node.status !== "archived" &&
          node.status !== "rejected"
        );
      case "low_priority":
        return (
          (node.priority === "low" || node.priority === "ephemeral" || node.importance <= 2) &&
          node.status !== "archived" &&
          node.status !== "rejected"
        );
      case "recent": {
        // caller will sort + slice; we just exclude archived here
        return node.status !== "archived";
      }
      case "archived":
        return node.status === "archived";
    }
  });
  const filtered = q ? visibleByView.filter((n) => matchesQuery(n, q)) : visibleByView;
  if (view === "recent") {
    return filtered
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 30);
  }
  // Default sort: pinned first, then importance desc, then updatedAt desc
  return filtered
    .slice()
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
