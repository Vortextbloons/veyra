import type { StateCreator } from "zustand";
import {
  DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS,
  type ToolSettingsSectionId,
} from "@/components/settings/tools-settings-registry";

export type UiLayoutSliceState = {
  activeNav: string;
  recentChatsCollapsed: boolean;
  rightPanelCollapsed: boolean;
  visibleToolSettingsSections: Record<ToolSettingsSectionId, boolean>;
  toolSettingsSubsectionsExpanded: Record<string, boolean>;
};

export type UiLayoutSliceActions = {
  setActiveNav: (id: string) => void;
  setRecentChatsCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
  setToolSettingsSectionVisible: (id: ToolSettingsSectionId, visible: boolean) => void;
  setAllToolSettingsSectionsVisible: (visible: boolean) => void;
  setToolSettingsSubsectionExpanded: (key: string, expanded: boolean) => void;
};

export const DEFAULT_UI_LAYOUT_STATE: UiLayoutSliceState = {
  activeNav: "chat",
  recentChatsCollapsed: false,
  rightPanelCollapsed: false,
  visibleToolSettingsSections: DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS,
  toolSettingsSubsectionsExpanded: {},
};

export type UiLayoutSlice = UiLayoutSliceState & UiLayoutSliceActions;

export const createUiLayoutSlice: StateCreator<UiLayoutSlice, [], [], UiLayoutSlice> = (set) => ({
  ...DEFAULT_UI_LAYOUT_STATE,
  setActiveNav: (activeNav) => set({ activeNav }),
  setRecentChatsCollapsed: (recentChatsCollapsed) => set({ recentChatsCollapsed }),
  setRightPanelCollapsed: (rightPanelCollapsed) => set({ rightPanelCollapsed }),
  setToolSettingsSectionVisible: (id, visible) =>
    set((state) => ({
      visibleToolSettingsSections: {
        ...state.visibleToolSettingsSections,
        [id]: visible,
      },
    })),
  setAllToolSettingsSectionsVisible: (visible) =>
    set((state) => ({
      visibleToolSettingsSections: Object.fromEntries(
        Object.keys(state.visibleToolSettingsSections).map((id) => [id, visible]),
      ) as Record<ToolSettingsSectionId, boolean>,
    })),
  setToolSettingsSubsectionExpanded: (key, expanded) =>
    set((state) => ({
      toolSettingsSubsectionsExpanded: {
        ...state.toolSettingsSubsectionsExpanded,
        [key]: expanded,
      },
    })),
});
