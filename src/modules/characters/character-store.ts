import { create } from "zustand";
import type {
  CharacterRecord,
  CreateCharacterInput,
  UpdateCharacterInput,
  ListCharactersFilter,
} from "./character-types";
import {
  listCharacters as apiList,
  getCharacter as apiGet,
  createCharacter as apiCreate,
  updateCharacter as apiUpdate,
  deleteCharacter as apiDelete,
} from "./character-storage";

type CharacterStore = {
  characters: CharacterRecord[];
  activeCharacterId: string | null;
  hydrationState: "loading" | "ready";
  isLoading: boolean;
  error: string | null;

  // Hydration
  hydrateCharacters: (filter?: ListCharactersFilter) => Promise<void>;

  // Selection
  setActiveCharacterId: (id: string | null) => void;
  clearActiveCharacter: () => void;

  // CRUD
  createCharacter: (
    input: Omit<CreateCharacterInput, "id"> & { id?: string },
  ) => Promise<CharacterRecord>;
  updateCharacter: (input: UpdateCharacterInput) => Promise<CharacterRecord>;
  deleteCharacter: (id: string) => Promise<void>;
  refreshCharacter: (id: string) => Promise<CharacterRecord | null>;

  // Derived
  getCharacterById: (id: string) => CharacterRecord | undefined;
  globalCharacters: () => CharacterRecord[];
  projectCharacters: (projectId: string) => CharacterRecord[];
  activeCharacter: () => CharacterRecord | null;
};

let hydrationPromise: Promise<void> | null = null;

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  activeCharacterId: null,
  hydrationState: "loading",
  isLoading: false,
  error: null,

  hydrateCharacters: async (filter) => {
    if (get().hydrationState === "ready" && !filter) return;
    hydrationPromise ??= (async () => {
      try {
        set({ isLoading: true, error: null });
        const characters = await apiList(filter);
        set({ characters, hydrationState: "ready", isLoading: false });
      } catch (error) {
        set({ error: String(error), hydrationState: "ready", isLoading: false });
      }
    })().finally(() => {
      hydrationPromise = null;
    });
    await hydrationPromise;
  },

  setActiveCharacterId: (id) => {
    set({ activeCharacterId: id });
  },

  clearActiveCharacter: () => {
    set({ activeCharacterId: null });
  },

  createCharacter: async (input) => {
    try {
      const character = await apiCreate(input);
      set((state) => ({
        characters: [character, ...state.characters],
        activeCharacterId: character.id,
      }));
      return character;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateCharacter: async (input) => {
    try {
      const character = await apiUpdate(input);
      set((state) => ({
        characters: state.characters.map((c) =>
          c.id === character.id ? character : c,
        ),
      }));
      return character;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteCharacter: async (id) => {
    try {
      await apiDelete(id);
      set((state) => ({
        characters: state.characters.filter((c) => c.id !== id),
        activeCharacterId: state.activeCharacterId === id ? null : state.activeCharacterId,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  refreshCharacter: async (id) => {
    try {
      const character = await apiGet(id);
      set((state) => ({
        characters: state.characters.map((c) =>
          c.id === character.id ? character : c,
        ),
      }));
      return character;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  getCharacterById: (id) => {
    return get().characters.find((c) => c.id === id);
  },

  globalCharacters: () => {
    return get().characters.filter((c) => c.isGlobal);
  },

  projectCharacters: (projectId) => {
    return get().characters.filter((c) => c.projectId === projectId);
  },

  activeCharacter: () => {
    const id = get().activeCharacterId;
    if (!id) return null;
    return get().characters.find((c) => c.id === id) ?? null;
  },
}));
