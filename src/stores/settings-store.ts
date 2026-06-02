import { create } from "zustand";

type SettingsStore = {
  activeNav: string;
  recentChatsCollapsed: boolean;
  rightPanelCollapsed: boolean;
  setActiveNav: (id: string) => void;
  setRecentChatsCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  activeNav: "chat",
  recentChatsCollapsed: false,
  rightPanelCollapsed: false,
  setActiveNav: (activeNav) => set({ activeNav }),
  setRecentChatsCollapsed: (recentChatsCollapsed) => set({ recentChatsCollapsed }),
  setRightPanelCollapsed: (rightPanelCollapsed) => set({ rightPanelCollapsed }),
}));
