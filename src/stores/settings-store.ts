import { create } from "zustand";
import type { MemoryMode } from "@/lib/memory-types";

const SETTINGS_STORAGE_KEY = "veyra.settings.v1";

export type SettingsStoreState = {
  activeNav: string;
  recentChatsCollapsed: boolean;
  rightPanelCollapsed: boolean;
  memoryMode: MemoryMode;
  maxMemoryTokens: number;
  maxMemoryNodes: number;
  maxMemoryFiles: number;
  maxGraphDepth: number;
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
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(subset));
  } catch {
    // storage unavailable; ignore
  }
}

export const useSettingsStore = create<SettingsStore>((set) => {
  const initial = loadState();
  const apply = (patch: Partial<SettingsStoreState>) => {
    set(patch as SettingsStore);
    const next = { ...useSettingsStore.getState(), ...patch } as SettingsStoreState;
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
  };
});
