import type { StateCreator } from "zustand";
import type { MemoryMode } from "@/modules/memory/memory-types";

export type MemorySliceState = {
  memoryMode: MemoryMode;
  maxMemoryTokens: number;
  maxMemoryNodes: number;
  maxMemoryFiles: number;
  maxGraphDepth: number;
  defaultMemoryEnabled: boolean;
  memoryExtractionEnabled: boolean;
  memoryExtractionModel: string;
};

export type MemorySliceActions = {
  setMemoryMode: (mode: MemoryMode) => void;
  setMaxMemoryTokens: (n: number) => void;
  setMaxMemoryNodes: (n: number) => void;
  setMaxMemoryFiles: (n: number) => void;
  setMaxGraphDepth: (n: number) => void;
  setDefaultMemoryEnabled: (enabled: boolean) => void;
  setMemoryExtractionEnabled: (enabled: boolean) => void;
  setMemoryExtractionModel: (modelId: string) => void;
};

export const DEFAULT_MEMORY_STATE: MemorySliceState = {
  memoryMode: "safe_auto_save",
  maxMemoryTokens: 700,
  maxMemoryNodes: 10,
  maxMemoryFiles: 4,
  maxGraphDepth: 1,
  defaultMemoryEnabled: true,
  memoryExtractionEnabled: true,
  memoryExtractionModel: "",
};

export type MemorySlice = MemorySliceState & MemorySliceActions;

export const createMemorySlice: StateCreator<MemorySlice, [], [], MemorySlice> = (set) => ({
  ...DEFAULT_MEMORY_STATE,
  setMemoryMode: (memoryMode) => set({ memoryMode }),
  setMaxMemoryTokens: (maxMemoryTokens) => set({ maxMemoryTokens }),
  setMaxMemoryNodes: (maxMemoryNodes) => set({ maxMemoryNodes }),
  setMaxMemoryFiles: (maxMemoryFiles) => set({ maxMemoryFiles }),
  setMaxGraphDepth: (maxGraphDepth) => set({ maxGraphDepth }),
  setDefaultMemoryEnabled: (defaultMemoryEnabled) => set({ defaultMemoryEnabled }),
  setMemoryExtractionEnabled: (memoryExtractionEnabled) => set({ memoryExtractionEnabled }),
  setMemoryExtractionModel: (memoryExtractionModel) => set({ memoryExtractionModel }),
});
