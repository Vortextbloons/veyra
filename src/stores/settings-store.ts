import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mergeVisibleToolSettingsSections } from "@/components/settings/tools-settings-registry";
import { DEFAULT_RESEARCH_CONFIG } from "@/modules/research/research-config";

import { createUiLayoutSlice, DEFAULT_UI_LAYOUT_STATE } from "./slices/ui-layout-slice";
import { createModelSlice, DEFAULT_MODEL_STATE } from "./slices/model-slice";
import { createMemorySlice, DEFAULT_MEMORY_STATE } from "./slices/memory-slice";
import { createWebSearchSlice, DEFAULT_WEB_SEARCH_STATE } from "./slices/web-search-slice";
import { createDocumentSlice, DEFAULT_DOCUMENT_STATE } from "./slices/document-slice";
import { createCharacterSlice, DEFAULT_CHARACTER_STATE } from "./slices/character-slice";
import { createResearchSlice, DEFAULT_RESEARCH_SLICE_STATE } from "./slices/research-slice";
import { createCodeExecutionSlice, DEFAULT_CODE_EXECUTION_STATE } from "./slices/code-execution-slice";
import { createConnectivitySlice, DEFAULT_CONNECTIVITY_STATE } from "./slices/connectivity-slice";
import { createChatSlice, DEFAULT_CHAT_STATE } from "./slices/chat-slice";

export type { ModelSettings, ResolvedModelSettings } from "./slices/model-slice";

const SETTINGS_STORAGE_KEY = "veyra.settings.v1";

// ── Combined types ──────────────────────────────────────────────────────────
// These mirror the old flat types so existing consumers don't need to change.

export type SettingsStoreState = UiLayoutSliceState
  & ModelSliceState
  & MemorySliceState
  & WebSearchSliceState
  & DocumentSliceState
  & CharacterSliceState
  & ResearchSliceState
  & CodeExecutionSliceState
  & ConnectivitySliceState
  & ChatSliceState;

export type SettingsStore = SettingsStoreState
  & UiLayoutSliceActions
  & ModelSliceActions
  & MemorySliceActions
  & WebSearchSliceActions
  & DocumentSliceActions
  & CharacterSliceActions
  & ResearchSliceActions
  & CodeExecutionSliceActions
  & ConnectivitySliceActions
  & ChatSliceActions;

// Re-import state types for the combined type above.
import type { UiLayoutSliceState, UiLayoutSliceActions } from "./slices/ui-layout-slice";
import type { ModelSliceState, ModelSliceActions } from "./slices/model-slice";
import type { MemorySliceState, MemorySliceActions } from "./slices/memory-slice";
import type { WebSearchSliceState, WebSearchSliceActions } from "./slices/web-search-slice";
import type { DocumentSliceState, DocumentSliceActions } from "./slices/document-slice";
import type { CharacterSliceState, CharacterSliceActions } from "./slices/character-slice";
import type { ResearchSliceState, ResearchSliceActions } from "./slices/research-slice";
import type { CodeExecutionSliceState, CodeExecutionSliceActions } from "./slices/code-execution-slice";
import type { ConnectivitySliceState, ConnectivitySliceActions } from "./slices/connectivity-slice";
import type { ChatSliceState, ChatSliceActions } from "./slices/chat-slice";

// ── Defaults (for merge) ────────────────────────────────────────────────────

const DEFAULT_STATE: SettingsStoreState = {
  ...DEFAULT_UI_LAYOUT_STATE,
  ...DEFAULT_MODEL_STATE,
  ...DEFAULT_MEMORY_STATE,
  ...DEFAULT_WEB_SEARCH_STATE,
  ...DEFAULT_DOCUMENT_STATE,
  ...DEFAULT_CHARACTER_STATE,
  ...DEFAULT_RESEARCH_SLICE_STATE,
  ...DEFAULT_CODE_EXECUTION_STATE,
  ...DEFAULT_CONNECTIVITY_STATE,
  ...DEFAULT_CHAT_STATE,
};

// ── Partialize ──────────────────────────────────────────────────────────────

function partializeSettings(state: SettingsStore): SettingsStoreState {
  return {
    activeNav: state.activeNav,
    recentChatsCollapsed: state.recentChatsCollapsed,
    rightPanelCollapsed: state.rightPanelCollapsed,
    visibleToolSettingsSections: state.visibleToolSettingsSections,
    toolSettingsSubsectionsExpanded: state.toolSettingsSubsectionsExpanded,
    favoriteModels: state.favoriteModels,
    autoNameEnabled: state.autoNameEnabled,
    autoNameModel: state.autoNameModel,
    defaultTemperature: state.defaultTemperature,
    defaultContextLength: state.defaultContextLength,
    defaultMaxTokens: state.defaultMaxTokens,
    defaultTopP: state.defaultTopP,
    defaultRepetitionPenalty: state.defaultRepetitionPenalty,
    defaultStopSequences: state.defaultStopSequences,
    defaultReservedOutputTokens: state.defaultReservedOutputTokens,
    defaultSystemPrompt: state.defaultSystemPrompt,
    modelOverrides: state.modelOverrides,
    reasoningEnabled: state.reasoningEnabled,
    backgroundJobsEnabled: state.backgroundJobsEnabled,
    autoSummarizeChats: state.autoSummarizeChats,
    summaryModel: state.summaryModel,
    memoryMode: state.memoryMode,
    maxMemoryTokens: state.maxMemoryTokens,
    maxMemoryNodes: state.maxMemoryNodes,
    maxMemoryFiles: state.maxMemoryFiles,
    maxGraphDepth: state.maxGraphDepth,
    defaultMemoryEnabled: state.defaultMemoryEnabled,
    memoryExtractionEnabled: state.memoryExtractionEnabled,
    memoryExtractionModel: state.memoryExtractionModel,
    vectorSearchEnabled: state.vectorSearchEnabled,
    vectorSearchEndpointUrl: state.vectorSearchEndpointUrl,
    vectorSearchModel: state.vectorSearchModel,
    vectorWeight: state.vectorWeight,
    bm25Weight: state.bm25Weight,
    metaWeight: state.metaWeight,
    vectorDuplicateThreshold: state.vectorDuplicateThreshold,
    defaultWebSearchEnabled: state.defaultWebSearchEnabled,
    webSearchSearxngUrl: state.webSearchSearxngUrl,
    webSearchDefaultMode: state.webSearchDefaultMode,
    webSearchMaxResults: state.webSearchMaxResults,
    webSearchTimeRange: state.webSearchTimeRange,
    webSearchCategories: state.webSearchCategories,
    webSearchSafeSearch: state.webSearchSafeSearch,
    webSearchContextTokenLimit: state.webSearchContextTokenLimit,
    webSearchFetchEnabled: state.webSearchFetchEnabled,
    webSearchFetchCount: state.webSearchFetchCount,
    webSearchPerPageTimeoutSecs: state.webSearchPerPageTimeoutSecs,
    webSearchFetchMaxCharsPerSource: state.webSearchFetchMaxCharsPerSource,
    webSearchSpeedPreset: state.webSearchSpeedPreset,
    advancedSearchBundleEnabled: state.advancedSearchBundleEnabled,
    advancedSearchMultiQueryEnabled: state.advancedSearchMultiQueryEnabled,
    advancedSearchFusionEnabled: state.advancedSearchFusionEnabled,
    advancedSearchAdaptiveFallbackEnabled: state.advancedSearchAdaptiveFallbackEnabled,
    advancedSearchFreshnessBoostEnabled: state.advancedSearchFreshnessBoostEnabled,
    advancedSearchQualityFilterEnabled: state.advancedSearchQualityFilterEnabled,
    bundleExtractDocx: state.bundleExtractDocx,
    bundleExtractPptx: state.bundleExtractPptx,
    bundleExtractXlsx: state.bundleExtractXlsx,
    bundleExtractEpub: state.bundleExtractEpub,
    bundleWaybackFallback: state.bundleWaybackFallback,
    bundleArxivSearch: state.bundleArxivSearch,
    bundleWikipediaSearch: state.bundleWikipediaSearch,
    searxngSetupError: state.searxngSetupError,
    documentPanelEnabled: state.documentPanelEnabled,
    documentAutoSaveEnabled: state.documentAutoSaveEnabled,
    documentAutoSaveDelay: state.documentAutoSaveDelay,
    documentDefaultType: state.documentDefaultType,
    documentWordWrap: state.documentWordWrap,
    documentFontSize: state.documentFontSize,
    documentTabSize: state.documentTabSize,
    documentSpellCheck: state.documentSpellCheck,
    documentAutoOpenOnCreate: state.documentAutoOpenOnCreate,
    documentDefaultViewMode: state.documentDefaultViewMode,
    documentAiPanelAutoShow: state.documentAiPanelAutoShow,
    documentListDensity: state.documentListDensity,
    characterAssistModel: state.characterAssistModel,
    characterAssistMaxTokens: state.characterAssistMaxTokens,
    characterAssistSendContext: state.characterAssistSendContext,
    characterAssistTelemetry: state.characterAssistTelemetry,
    characterAssistTone: state.characterAssistTone,
    workspaceChatMode: state.workspaceChatMode,
    contextAnchoringEnabled: state.contextAnchoringEnabled,
    enhancedModeEnabled: state.enhancedModeEnabled,
    research: state.research,
    researchAdvancedOpen: state.researchAdvancedOpen,
    researchFirstRunNoticeDismissed: state.researchFirstRunNoticeDismissed,
    codeExecutionEnabled: state.codeExecutionEnabled,
    customPythonPath: state.customPythonPath,
    codeExecutionTimeoutSecs: state.codeExecutionTimeoutSecs,
    connectivityPreference: state.connectivityPreference,
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
      ...createMemorySlice(...a),
      ...createWebSearchSlice(...a),
      ...createDocumentSlice(...a),
      ...createCharacterSlice(...a),
      ...createResearchSlice(...a),
      ...createCodeExecutionSlice(...a),
      ...createConnectivitySlice(...a),
      ...createChatSlice(...a),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => partializeSettings(state),
      merge: (persisted, current) => {
        const parsed = persisted as Partial<SettingsStoreState> & { webSearchEnabled?: boolean };
        const migrated: Partial<SettingsStoreState> = { ...parsed };
        if (
          parsed.webSearchEnabled !== undefined &&
          parsed.defaultWebSearchEnabled === undefined
        ) {
          migrated.defaultWebSearchEnabled = parsed.webSearchEnabled;
        }
        migrated.visibleToolSettingsSections = mergeVisibleToolSettingsSections(
          parsed.visibleToolSettingsSections,
        );
        migrated.toolSettingsSubsectionsExpanded = {
          ...current.toolSettingsSubsectionsExpanded,
          ...parsed.toolSettingsSubsectionsExpanded,
        };
        migrated.research = {
          ...DEFAULT_RESEARCH_CONFIG,
          ...(parsed.research ?? {}),
          depthOverrides: parsed.research?.depthOverrides ?? {},
          customProfiles: parsed.research?.customProfiles ?? [],
        };
        return { ...current, ...DEFAULT_STATE, ...migrated };
      },
    },
  ),
);
