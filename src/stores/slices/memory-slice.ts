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
  // Vector search settings
  vectorSearchEnabled: boolean;
  vectorSearchEndpointUrl: string;
  vectorSearchModel: string;
  vectorWeight: number;
  bm25Weight: number;
  metaWeight: number;
  vectorDuplicateThreshold: number;
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
  // Vector search actions
  setVectorSearchEnabled: (enabled: boolean) => void;
  setVectorSearchEndpointUrl: (url: string) => void;
  setVectorSearchModel: (model: string) => void;
  setVectorWeight: (weight: number) => void;
  setBm25Weight: (weight: number) => void;
  setMetaWeight: (weight: number) => void;
  setVectorDuplicateThreshold: (threshold: number) => void;
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
  vectorSearchEnabled: false,
  vectorSearchEndpointUrl: "",
  vectorSearchModel: "",
  vectorWeight: 0.5,
  bm25Weight: 0.4,
  metaWeight: 0.1,
  vectorDuplicateThreshold: 0.92,
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
  setVectorSearchEnabled: (vectorSearchEnabled) => set({ vectorSearchEnabled }),
  setVectorSearchEndpointUrl: (vectorSearchEndpointUrl) => set({ vectorSearchEndpointUrl }),
  setVectorSearchModel: (vectorSearchModel) => set({ vectorSearchModel }),
  setVectorWeight: (vectorWeight) => set({ vectorWeight }),
  setBm25Weight: (bm25Weight) => set({ bm25Weight }),
  setMetaWeight: (metaWeight) => set({ metaWeight }),
  setVectorDuplicateThreshold: (vectorDuplicateThreshold) => set({ vectorDuplicateThreshold }),
});
