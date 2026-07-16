import type { StateCreator } from "zustand";

export type UpdateSliceState = {
  autoCheckUpdatesEnabled: boolean;
  dismissedUpdateVersion: string | null;
};

export type UpdateSliceActions = {
  setAutoCheckUpdatesEnabled: (enabled: boolean) => void;
  dismissUpdateVersion: (version: string) => void;
  clearDismissedUpdateVersion: () => void;
};

export const DEFAULT_UPDATE_STATE: UpdateSliceState = {
  autoCheckUpdatesEnabled: true,
  dismissedUpdateVersion: null,
};

export type UpdateSlice = UpdateSliceState & UpdateSliceActions;

export const createUpdateSlice: StateCreator<UpdateSlice, [], [], UpdateSlice> = (set) => ({
  ...DEFAULT_UPDATE_STATE,
  setAutoCheckUpdatesEnabled: (autoCheckUpdatesEnabled) => set({ autoCheckUpdatesEnabled }),
  dismissUpdateVersion: (dismissedUpdateVersion) => set({ dismissedUpdateVersion }),
  clearDismissedUpdateVersion: () => set({ dismissedUpdateVersion: null }),
});
