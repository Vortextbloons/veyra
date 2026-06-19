import type { StateCreator } from "zustand";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";

export type ConnectivitySliceState = {
  connectivityPreference: ConnectivityPreference;
};

export type ConnectivitySliceActions = {
  setConnectivityPreference: (preference: ConnectivityPreference) => void;
};

export const DEFAULT_CONNECTIVITY_STATE: ConnectivitySliceState = {
  connectivityPreference: "auto",
};

export type ConnectivitySlice = ConnectivitySliceState & ConnectivitySliceActions;

export const createConnectivitySlice: StateCreator<ConnectivitySlice, [], [], ConnectivitySlice> = (set) => ({
  ...DEFAULT_CONNECTIVITY_STATE,
  setConnectivityPreference: (connectivityPreference) => set({ connectivityPreference }),
});
