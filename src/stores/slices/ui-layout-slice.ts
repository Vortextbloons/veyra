import type { StateCreator } from "zustand";

export type UiLayoutSliceState = {
  activeNav: string;
  recentChatsCollapsed: boolean;
};

export type UiLayoutSliceActions = {
  setActiveNav: (id: string) => void;
  setRecentChatsCollapsed: (collapsed: boolean) => void;
};

export const DEFAULT_UI_LAYOUT_STATE: UiLayoutSliceState = {
  activeNav: "chat",
  recentChatsCollapsed: false,
};

export type UiLayoutSlice = UiLayoutSliceState & UiLayoutSliceActions;

export const createUiLayoutSlice: StateCreator<UiLayoutSlice, [], [], UiLayoutSlice> = (set) => ({
  ...DEFAULT_UI_LAYOUT_STATE,
  setActiveNav: (activeNav) => set({ activeNav }),
  setRecentChatsCollapsed: (recentChatsCollapsed) => set({ recentChatsCollapsed }),
});
