import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { createUiLayoutSlice, DEFAULT_UI_LAYOUT_STATE } from "./slices/ui-layout-slice";
import { createModelSlice, DEFAULT_MODEL_STATE } from "./slices/model-slice";
import { createWebSearchSlice, DEFAULT_WEB_SEARCH_STATE } from "./slices/web-search-slice";
import { createConnectivitySlice, DEFAULT_CONNECTIVITY_STATE } from "./slices/connectivity-slice";
import { createChatSlice, DEFAULT_CHAT_STATE } from "./slices/chat-slice";
import { createUpdateSlice, DEFAULT_UPDATE_STATE } from "./slices/update-slice";
import { createPermissionsSlice, DEFAULT_PERMISSIONS_STATE, isPermissionMode } from "./slices/permissions-slice";

export type { ModelSettings, ResolvedModelSettings } from "./slices/model-slice";
export type { PermissionMode } from "./slices/permissions-slice";

const SETTINGS_STORAGE_KEY = "veyra.settings.v1";

// ── Combined types ──────────────────────────────────────────────────────────
// These mirror the old flat types so existing consumers don't need to change.

export type SettingsStoreState = UiLayoutSliceState
  & ModelSliceState
  & WebSearchSliceState
  & ConnectivitySliceState
  & ChatSliceState
  & PermissionsSliceState
  & UpdateSliceState;

export type SettingsStore = SettingsStoreState
  & UiLayoutSliceActions
  & ModelSliceActions
  & WebSearchSliceActions
  & ConnectivitySliceActions
  & ChatSliceActions
  & PermissionsSliceActions
  & UpdateSliceActions;

// Re-import state types for the combined type above.
import type { UiLayoutSliceState, UiLayoutSliceActions } from "./slices/ui-layout-slice";
import type { ModelSliceState, ModelSliceActions } from "./slices/model-slice";
import type { WebSearchSliceState, WebSearchSliceActions } from "./slices/web-search-slice";
import type { ConnectivitySliceState, ConnectivitySliceActions } from "./slices/connectivity-slice";
import type { ChatSliceState, ChatSliceActions } from "./slices/chat-slice";
import type { PermissionsSliceState, PermissionsSliceActions } from "./slices/permissions-slice";
import type { UpdateSliceState, UpdateSliceActions } from "./slices/update-slice";

// ── Defaults (for merge) ────────────────────────────────────────────────────

const DEFAULT_STATE: SettingsStoreState = {
  ...DEFAULT_UI_LAYOUT_STATE,
  ...DEFAULT_MODEL_STATE,
  ...DEFAULT_WEB_SEARCH_STATE,
  ...DEFAULT_CONNECTIVITY_STATE,
  ...DEFAULT_CHAT_STATE,
  ...DEFAULT_PERMISSIONS_STATE,
  ...DEFAULT_UPDATE_STATE,
};

// ── Partialize ──────────────────────────────────────────────────────────────

function partializeSettings(state: SettingsStore): SettingsStoreState {
  return {
    activeNav: state.activeNav,
    recentChatsCollapsed: state.recentChatsCollapsed,
    favoriteModels: state.favoriteModels,
    defaultTemperature: state.defaultTemperature,
    defaultContextLength: state.defaultContextLength,
    defaultMaxTokens: state.defaultMaxTokens,
    defaultTopP: state.defaultTopP,
    defaultRepetitionPenalty: state.defaultRepetitionPenalty,
    defaultStopSequences: state.defaultStopSequences,
    defaultReservedOutputTokens: state.defaultReservedOutputTokens,
    defaultSystemPrompt: state.defaultSystemPrompt,
    systemPromptReplacesDefault: state.systemPromptReplacesDefault,
    modelOverrides: state.modelOverrides,
    reasoningEnabled: state.reasoningEnabled,
    reasoningLevel: state.reasoningLevel,
    reasoningLevelByModel: state.reasoningLevelByModel,
    backgroundJobsEnabled: state.backgroundJobsEnabled,
    defaultWebSearchEnabled: state.defaultWebSearchEnabled,
    webSearchMaxResults: state.webSearchMaxResults,
    webSearchContextTokenLimit: state.webSearchContextTokenLimit,
    webSearchFetchEnabled: state.webSearchFetchEnabled,
    webSearchFetchCount: state.webSearchFetchCount,
    webSearchPerPageTimeoutSecs: state.webSearchPerPageTimeoutSecs,
    webSearchFetchMaxCharsPerSource: state.webSearchFetchMaxCharsPerSource,
    webSearchSpeedPreset: state.webSearchSpeedPreset,
    advancedSearchBundleEnabled: state.advancedSearchBundleEnabled,
    bundleWaybackFallback: state.bundleWaybackFallback,
    bundleArxivSearch: state.bundleArxivSearch,
    bundleWikipediaSearch: state.bundleWikipediaSearch,
    interactiveAnswersEnabled: state.interactiveAnswersEnabled,
    artifactsEnabled: state.artifactsEnabled,
    connectivityPreference: state.connectivityPreference,
    autoCheckUpdatesEnabled: state.autoCheckUpdatesEnabled,
    dismissedUpdateVersion: state.dismissedUpdateVersion,
    permissionMode: state.permissionMode,
    protectedToolIds: state.protectedToolIds,
    disabledNativeToolIds: state.disabledNativeToolIds,
    autoReviewProviderId: state.autoReviewProviderId,
    autoReviewModelId: state.autoReviewModelId,
  };
}

// ── Hydration ───────────────────────────────────────────────────────────────

let settingsHydrated = false;

export async function ensureSettingsHydrated(): Promise<void> {
  if (settingsHydrated) return;
  await useSettingsStore.persist.rehydrate();
  settingsHydrated = true;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (...a) => ({
      ...createUiLayoutSlice(...a),
      ...createModelSlice(...a),
      ...createWebSearchSlice(...a),
      ...createConnectivitySlice(...a),
      ...createChatSlice(...a),
      ...createPermissionsSlice(...a),
      ...createUpdateSlice(...a),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => partializeSettings(state),
      merge: (persisted, current) => {
        const parsed = persisted as Partial<SettingsStoreState> & { webSearchEnabled?: boolean };
        const migrated: Partial<SettingsStoreState> = { ...parsed };
        // Upgrade former defaults while preserving custom values and model overrides.
        if (parsed.defaultMaxTokens === 0) migrated.defaultMaxTokens = 32768;
        if (parsed.defaultReservedOutputTokens === 1024) migrated.defaultReservedOutputTokens = 8192;
        if (parsed.defaultContextLength === 8192) migrated.defaultContextLength = 0;
        if (parsed.activeNav === "characters") migrated.activeNav = "chat";
        if (parsed.activeNav === "research") migrated.activeNav = "chat";
        if (
          parsed.webSearchEnabled !== undefined &&
          parsed.defaultWebSearchEnabled === undefined
        ) {
          migrated.defaultWebSearchEnabled = parsed.webSearchEnabled;
        }
        if (parsed.reasoningLevel === undefined) {
          migrated.reasoningLevel = parsed.reasoningEnabled === false ? "off" : "medium";
        }
        if (parsed.reasoningLevelByModel === undefined) {
          migrated.reasoningLevelByModel = {};
        }
        // A persisted mode outside the supported set must never widen access.
        if (parsed.permissionMode !== undefined && !isPermissionMode(parsed.permissionMode)) {
          migrated.permissionMode = DEFAULT_PERMISSIONS_STATE.permissionMode;
        }
        if (parsed.protectedToolIds !== undefined) {
          migrated.protectedToolIds = Array.isArray(parsed.protectedToolIds)
            ? [...new Set(parsed.protectedToolIds.filter((id): id is string => typeof id === "string" && Boolean(id)))]
            : DEFAULT_PERMISSIONS_STATE.protectedToolIds;
        }
        if (parsed.disabledNativeToolIds !== undefined) {
          migrated.disabledNativeToolIds = Array.isArray(parsed.disabledNativeToolIds)
            ? [...new Set(parsed.disabledNativeToolIds.filter((id): id is string => typeof id === "string" && Boolean(id)))]
            : DEFAULT_PERMISSIONS_STATE.disabledNativeToolIds;
        }
        return { ...current, ...DEFAULT_STATE, ...migrated };
      },
    },
  ),
);
