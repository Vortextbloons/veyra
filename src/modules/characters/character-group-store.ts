// ── Character group Zustand store ────────────────────────────────────────────
//
// Mirrors the character store. The data lives in the Rust `character_groups`
// table; this store only holds the in-memory cache plus selectors.

import { create } from "zustand";
import type {
  CharacterGroupRecord,
  CreateCharacterGroupInput,
  ListCharacterGroupsFilter,
  UpdateCharacterGroupInput,
} from "./character-group-types";
import {
  listCharacterGroups as apiList,
  getCharacterGroup as apiGet,
  createCharacterGroup as apiCreate,
  updateCharacterGroup as apiUpdate,
  deleteCharacterGroup as apiDelete,
} from "./character-group-storage";

type CharacterGroupStore = {
  groups: CharacterGroupRecord[];
  activeGroupId: string | null;
  hydrationState: "loading" | "ready";
  isLoading: boolean;
  error: string | null;

  // Hydration
  hydrateGroups: (filter?: ListCharacterGroupsFilter) => Promise<void>;

  // Selection
  setActiveGroupId: (id: string | null) => void;
  clearActiveGroup: () => void;

  // CRUD
  createGroup: (
    input: Omit<CreateCharacterGroupInput, "id"> & { id?: string },
  ) => Promise<CharacterGroupRecord>;
  updateGroup: (input: UpdateCharacterGroupInput) => Promise<CharacterGroupRecord>;
  deleteGroup: (id: string) => Promise<void>;
  refreshGroup: (id: string) => Promise<CharacterGroupRecord | null>;

  // Derived
  getGroupById: (id: string) => CharacterGroupRecord | undefined;
  globalGroups: () => CharacterGroupRecord[];
  projectGroups: (projectId: string) => CharacterGroupRecord[];
  groupsForCharacter: (characterId: string) => CharacterGroupRecord[];
  activeGroup: () => CharacterGroupRecord | null;
};

let hydrationPromise: Promise<void> | null = null;

export const useCharacterGroupStore = create<CharacterGroupStore>((set, get) => ({
  groups: [],
  activeGroupId: null,
  hydrationState: "loading",
  isLoading: false,
  error: null,

  hydrateGroups: async (filter) => {
    if (get().hydrationState === "ready" && !filter) return;
    hydrationPromise ??= (async () => {
      try {
        set({ isLoading: true, error: null });
        const groups = await apiList(filter);
        set({ groups, hydrationState: "ready", isLoading: false });
      } catch (error) {
        set({ error: String(error), hydrationState: "ready", isLoading: false });
      }
    })().finally(() => {
      hydrationPromise = null;
    });
    await hydrationPromise;
  },

  setActiveGroupId: (id) => {
    set({ activeGroupId: id });
  },

  clearActiveGroup: () => {
    set({ activeGroupId: null });
  },

  createGroup: async (input) => {
    try {
      const group = await apiCreate(input);
      set((state) => ({
        groups: [group, ...state.groups],
        activeGroupId: group.id,
      }));
      return group;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateGroup: async (input) => {
    try {
      const group = await apiUpdate(input);
      set((state) => ({
        groups: state.groups.map((g) => (g.id === group.id ? group : g)),
      }));
      return group;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteGroup: async (id) => {
    try {
      await apiDelete(id);
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        activeGroupId: state.activeGroupId === id ? null : state.activeGroupId,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  refreshGroup: async (id) => {
    try {
      const group = await apiGet(id);
      set((state) => ({
        groups: state.groups.map((g) => (g.id === group.id ? group : g)),
      }));
      return group;
    } catch {
      return null;
    }
  },

  getGroupById: (id) => {
    return get().groups.find((g) => g.id === id);
  },

  globalGroups: () => {
    return get().groups.filter((g) => g.isGlobal);
  },

  projectGroups: (projectId) => {
    return get().groups.filter((g) => !g.isGlobal && g.projectId === projectId);
  },

  groupsForCharacter: (characterId) => {
    return get().groups.filter((g) => g.memberIds.includes(characterId));
  },

  activeGroup: () => {
    const id = get().activeGroupId;
    if (!id) return null;
    return get().groups.find((g) => g.id === id) ?? null;
  },
}));
