import type { StateCreator } from "zustand";

/** How a protected tool call is cleared before it may run. */
export type PermissionMode = "ask" | "auto" | "full";

export const PERMISSION_MODES: PermissionMode[] = ["ask", "auto", "full"];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "ask" || value === "auto" || value === "full";
}

export type PermissionsSliceState = {
  /** Default mode for new chats; a chat can override it near the composer. */
  permissionMode: PermissionMode;
  /**
   * Tools that require permission. Bash is the only default: it is the one
   * capability that can do arbitrary work outside the app's own code paths.
   */
  protectedToolIds: string[];
  /**
   * Built-in tools turned off everywhere. Empty means every built-in tool that
   * Pi exposes for a project is available.
   */
  disabledNativeToolIds: string[];
  /** Reviewer provider for Auto mode. Empty means Auto falls back to manual. */
  autoReviewProviderId: string;
  /** Reviewer model id for Auto mode. Empty means Auto falls back to manual. */
  autoReviewModelId: string;
};

export type PermissionsSliceActions = {
  setPermissionMode: (mode: PermissionMode) => void;
  setProtectedToolIds: (ids: string[]) => void;
  setNativeToolEnabled: (toolId: string, enabled: boolean) => void;
  setAutoReviewReviewer: (providerId: string, modelId: string) => void;
};

export const DEFAULT_PERMISSIONS_STATE: PermissionsSliceState = {
  // Ask is the safe default: nothing protected runs without an explicit choice.
  permissionMode: "ask",
  protectedToolIds: ["bash"],
  // Bash is available by default; the switch exists so it can be turned off.
  disabledNativeToolIds: [],
  autoReviewProviderId: "",
  autoReviewModelId: "",
};

export type PermissionsSlice = PermissionsSliceState & PermissionsSliceActions;

export const createPermissionsSlice: StateCreator<
  PermissionsSlice,
  [],
  [],
  PermissionsSlice
> = (set) => ({
  ...DEFAULT_PERMISSIONS_STATE,
  setPermissionMode: (permissionMode) =>
    set({ permissionMode: isPermissionMode(permissionMode) ? permissionMode : "ask" }),
  setProtectedToolIds: (protectedToolIds) =>
    set({
      // Order is stable and duplicates cannot inflate the list.
      protectedToolIds: [...new Set(protectedToolIds.filter(Boolean))],
    }),
  setNativeToolEnabled: (toolId, enabled) =>
    set((state) => ({ disabledNativeToolIds: enabled
      ? state.disabledNativeToolIds.filter((id) => id !== toolId)
      : [...new Set([...state.disabledNativeToolIds, toolId])] })),
  setAutoReviewReviewer: (autoReviewProviderId, autoReviewModelId) =>
    set({
      autoReviewProviderId: autoReviewProviderId.trim(),
      autoReviewModelId: autoReviewModelId.trim(),
    }),
});
