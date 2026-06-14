// Memory store — the central Zustand state for the Memory feature.
//
// All Tauri IPC for memory goes through @/lib/memory-storage, never directly
// through @tauri-apps/api/core. UI selection state lives in memory-ui-context.

import { create } from "zustand";
import type {
  CreateMemoryNode,
  MemoryFolder,
  MemoryNode,
  UpdateMemoryNode,
} from "@/lib/memory-types";
import {
  archiveMemoryNode as ipcArchive,
  createMemoryNode as ipcCreate,
  deleteMemoryNode as ipcDelete,
  listMemoryFolders as ipcListFolders,
  listMemoryNodes as ipcListNodes,
  pinMemoryNode as ipcPin,
  updateMemoryNode as ipcUpdate,
} from "@/lib/memory-storage";
import type { MemoryView } from "@/components/memory/memory-ui-context";

const pendingCreateIds = new Set<string>();

type MemoryStore = {
  folders: MemoryFolder[];
  nodes: MemoryNode[];
  isLoading: boolean;

  hydrateMemory: () => Promise<void>;

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
  nodes: [],
  isLoading: false,

  hydrateMemory: async () => {
    set({ isLoading: true });
    try {
      const [folders, nodes] = await Promise.all([
        ipcListFolders(),
        ipcListNodes({}),
      ]);
      set({ folders, nodes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createNode: async (input) => {
    const id = input.id ?? crypto.randomUUID();
    if (pendingCreateIds.has(id) || get().nodes.some((node) => node.id === id)) return;
    pendingCreateIds.add(id);
    try {
      const node = await ipcCreate({ ...input, id });
      set((state) => ({ nodes: [node, ...state.nodes] }));
    } finally {
      pendingCreateIds.delete(id);
    }
  },

  updateNode: async (input) => {
    const node = await ipcUpdate(input);
    set((state) => ({ nodes: replaceNode(state.nodes, node) }));
  },

  archiveNode: async (id) => {
    try {
      await ipcArchive(id);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, status: "archived" } : n,
        ),
      }));
    } catch {
      // ignore
    }
  },

  deleteNode: async (id) => {
    try {
      await ipcDelete(id);
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== id),
      }));
    } catch {
      // ignore
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
    } catch {
      // ignore
    }
  },

  approveNode: async (id) => {
    await get().updateNode({ id, status: "approved" });
  },

  rejectNode: async (id) => {
    await get().updateNode({ id, status: "rejected" });
  },
}));

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
      case "recent":
        return node.status !== "archived";
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
  return filtered
    .slice()
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
