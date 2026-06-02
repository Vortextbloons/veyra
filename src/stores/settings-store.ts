import { create } from "zustand";
import type { MemoryMode } from "@/lib/memory-types";

const SETTINGS_STORAGE_KEY = "veyra.settings.v1";

export interface ModelSettings {
  temperature?: number;
  contextLength?: number;
}

export type SettingsStoreState = {
  activeNav: string;
  recentChatsCollapsed: boolean;
  rightPanelCollapsed: boolean;
  memoryMode: MemoryMode;
  maxMemoryTokens: number;
  maxMemoryNodes: number;
  maxMemoryFiles: number;
  maxGraphDepth: number;
  favoriteModels: string[];
  autoNameEnabled: boolean;
  autoNameModel: string;
  defaultMemoryEnabled: boolean;
  defaultTemperature: number;
  defaultContextLength: number;
  modelOverrides: Record<string, ModelSettings>;
  backgroundJobsEnabled: boolean;
  autoSummarizeChats: boolean;
  summaryModel: string;
  memoryExtractionEnabled: boolean;
  schedulerPanelCollapsed: boolean;
};

export type SettingsStore = SettingsStoreState & {
  setActiveNav: (id: string) => void;
  setRecentChatsCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
  setMemoryMode: (mode: MemoryMode) => void;
  setMaxMemoryTokens: (n: number) => void;
  setMaxMemoryNodes: (n: number) => void;
  setMaxMemoryFiles: (n: number) => void;
  setMaxGraphDepth: (n: number) => void;
  toggleFavoriteModel: (modelId: string) => void;
  setAutoNameEnabled: (enabled: boolean) => void;
  setAutoNameModel: (modelId: string) => void;
  setDefaultMemoryEnabled: (enabled: boolean) => void;
  setDefaultTemperature: (n: number) => void;
  setDefaultContextLength: (n: number) => void;
  setModelOverride: (modelId: string, settings: ModelSettings) => void;
  clearModelOverride: (modelId: string) => void;
  getModelSettings: (modelId: string) => { temperature: number; contextLength: number };
  setBackgroundJobsEnabled: (enabled: boolean) => void;
  setAutoSummarizeChats: (enabled: boolean) => void;
  setSummaryModel: (modelId: string) => void;
  setMemoryExtractionEnabled: (enabled: boolean) => void;
  setSchedulerPanelCollapsed: (collapsed: boolean) => void;
};

const DEFAULT_STATE: SettingsStoreState = {
  activeNav: "chat",
  recentChatsCollapsed: false,
  rightPanelCollapsed: false,
  memoryMode: "safe_auto_save",
  maxMemoryTokens: 700,
  maxMemoryNodes: 10,
  maxMemoryFiles: 4,
  maxGraphDepth: 1,
  favoriteModels: [],
  autoNameEnabled: true,
  autoNameModel: "",
  defaultMemoryEnabled: true,
  defaultTemperature: 0.7,
  defaultContextLength: 8192,
  modelOverrides: {},
  backgroundJobsEnabled: true,
  autoSummarizeChats: false,
  summaryModel: "",
  memoryExtractionEnabled: true,
  schedulerPanelCollapsed: false,
};

function loadState(): SettingsStoreState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SettingsStoreState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function persistState(state: SettingsStoreState) {
  try {
    const subset: SettingsStoreState = {
      activeNav: state.activeNav,
      recentChatsCollapsed: state.recentChatsCollapsed,
      rightPanelCollapsed: state.rightPanelCollapsed,
      memoryMode: state.memoryMode,
      maxMemoryTokens: state.maxMemoryTokens,
      maxMemoryNodes: state.maxMemoryNodes,
      maxMemoryFiles: state.maxMemoryFiles,
      maxGraphDepth: state.maxGraphDepth,
      favoriteModels: state.favoriteModels,
      autoNameEnabled: state.autoNameEnabled,
      autoNameModel: state.autoNameModel,
      defaultMemoryEnabled: state.defaultMemoryEnabled,
      defaultTemperature: state.defaultTemperature,
      defaultContextLength: state.defaultContextLength,
      modelOverrides: state.modelOverrides,
      backgroundJobsEnabled: state.backgroundJobsEnabled,
      autoSummarizeChats: state.autoSummarizeChats,
      summaryModel: state.summaryModel,
      memoryExtractionEnabled: state.memoryExtractionEnabled,
      schedulerPanelCollapsed: state.schedulerPanelCollapsed,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(subset));
  } catch {
    // storage unavailable; ignore
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = loadState();
  const apply = (patch: Partial<SettingsStoreState>) => {
    set(patch as SettingsStore);
    const next = { ...get(), ...patch } as SettingsStoreState;
    persistState(next);
  };
  return {
    ...initial,
    setActiveNav: (activeNav) => apply({ activeNav }),
    setRecentChatsCollapsed: (recentChatsCollapsed) =>
      apply({ recentChatsCollapsed }),
    setRightPanelCollapsed: (rightPanelCollapsed) =>
      apply({ rightPanelCollapsed }),
    setMemoryMode: (memoryMode) => apply({ memoryMode }),
    setMaxMemoryTokens: (maxMemoryTokens) => apply({ maxMemoryTokens }),
    setMaxMemoryNodes: (maxMemoryNodes) => apply({ maxMemoryNodes }),
    setMaxMemoryFiles: (maxMemoryFiles) => apply({ maxMemoryFiles }),
    setMaxGraphDepth: (maxGraphDepth) => apply({ maxGraphDepth }),
    toggleFavoriteModel: (modelId: string) => {
      const current = get().favoriteModels;
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId];
      apply({ favoriteModels: next });
    },
    setAutoNameEnabled: (autoNameEnabled) => apply({ autoNameEnabled }),
    setAutoNameModel: (autoNameModel) => apply({ autoNameModel }),
    setDefaultMemoryEnabled: (defaultMemoryEnabled) => apply({ defaultMemoryEnabled }),
    setDefaultTemperature: (defaultTemperature) => apply({ defaultTemperature }),
    setDefaultContextLength: (defaultContextLength) => apply({ defaultContextLength }),
    setModelOverride: (modelId: string, settings: ModelSettings) => {
      const current = get().modelOverrides;
      apply({ modelOverrides: { ...current, [modelId]: settings } });
    },
    clearModelOverride: (modelId: string) => {
      const current = get().modelOverrides;
      const next = { ...current };
      delete next[modelId];
      apply({ modelOverrides: next });
    },
    getModelSettings: (modelId: string): { temperature: number; contextLength: number } => {
      const state = get();
      const override = state.modelOverrides[modelId];
      return {
        temperature: override?.temperature ?? state.defaultTemperature,
        contextLength: override?.contextLength ?? state.defaultContextLength,
      };
    },
    setBackgroundJobsEnabled: (backgroundJobsEnabled) => apply({ backgroundJobsEnabled }),
    setAutoSummarizeChats: (autoSummarizeChats) => apply({ autoSummarizeChats }),
    setSummaryModel: (summaryModel) => apply({ summaryModel }),
    setMemoryExtractionEnabled: (memoryExtractionEnabled) => apply({ memoryExtractionEnabled }),
    setSchedulerPanelCollapsed: (schedulerPanelCollapsed) => apply({ schedulerPanelCollapsed }),
  };
});
