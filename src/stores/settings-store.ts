import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";
import type { MemoryMode } from "@/lib/memory-types";
import type { WorkspaceChatMode } from "@/lib/chat-types";
import {
  DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS,
  mergeVisibleToolSettingsSections,
  type ToolSettingsSectionId,
} from "@/components/settings/tools-settings-registry";
import {
  DEFAULT_RESEARCH_CONFIG,
  applyResearchConfig,
  type ResearchConfigSetter,
  type ResearchConfigState,
  type ResearchDepthProfileId,
  type ResearchProfileOverride,
  type ResearchDepthProfile,
} from "@/modules/research/research-config";
import type { ResearchDepth } from "@/modules/research/research-types";
const SETTINGS_STORAGE_KEY = "veyra.settings.v1";

export interface ModelSettings {
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopSequences?: string[];
  reservedOutputTokens?: number;
  systemPrompt?: string;
}

type SettingsStoreState = {
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
  defaultMaxTokens: number;
  defaultTopP: number;
  defaultRepetitionPenalty: number;
  defaultStopSequences: string[];
  defaultReservedOutputTokens: number;
  defaultSystemPrompt: string;
  modelOverrides: Record<string, ModelSettings>;
  backgroundJobsEnabled: boolean;
  autoSummarizeChats: boolean;
  summaryModel: string;
  memoryExtractionEnabled: boolean;
  memoryExtractionModel: string;
  defaultWebSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  customPythonPath: string;
  codeExecutionTimeoutSecs: number;
  webSearchSearxngUrl: string;
  webSearchDefaultMode: "auto" | "always" | "off";
  webSearchMaxResults: number;
  webSearchTimeRange: "" | "day" | "week" | "month" | "year";
  webSearchCategories: string;
  webSearchSafeSearch: 0 | 1 | 2;
  webSearchContextTokenLimit: number;
  webSearchFetchEnabled: boolean;
  webSearchFetchCount: number;
  webSearchPerPageTimeoutSecs: number;
  webSearchFetchMaxCharsPerSource: number;
  advancedSearchBundleEnabled: boolean;
  bundleExtractDocx: boolean;
  bundleExtractPptx: boolean;
  bundleExtractXlsx: boolean;
  bundleExtractEpub: boolean;
  bundleWaybackFallback: boolean;
  bundleArxivSearch: boolean;
  bundleWikipediaSearch: boolean;
  searxngSetupError: string;
  contextAnchoringEnabled: boolean;
  documentPanelEnabled: boolean;
  documentAutoSaveEnabled: boolean;
  documentAutoSaveDelay: number;
  documentDefaultType: string;
  documentWordWrap: boolean;
  documentFontSize: number;
  documentTabSize: number;
  documentSpellCheck: boolean;
  documentAutoOpenOnCreate: boolean;
  connectivityPreference: ConnectivityPreference;
  // ── Character AI assist ──────────────────────────────────────────────────
  characterAssistModel: string;
  characterAssistMaxTokens: number;
  characterAssistSendContext: boolean;
  characterAssistTelemetry: boolean;
  characterAssistTone: string;
  workspaceChatMode: WorkspaceChatMode;
  reasoningEnabled: boolean;
  visibleToolSettingsSections: Record<ToolSettingsSectionId, boolean>;
  toolSettingsSubsectionsExpanded: Record<string, boolean>;
  research: ResearchConfigState;
  researchAdvancedOpen: boolean;
  researchFirstRunNoticeDismissed: boolean;
};

type ResolvedModelSettings = {
  temperature: number;
  contextLength: number;
  maxTokens: number;
  topP: number;
  repetitionPenalty: number;
  stopSequences: string[];
  reservedOutputTokens: number;
  systemPrompt: string;
};

type SettingsStore = SettingsStoreState & {
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
  setDefaultMaxTokens: (n: number) => void;
  setDefaultTopP: (n: number) => void;
  setDefaultRepetitionPenalty: (n: number) => void;
  setDefaultStopSequences: (s: string[]) => void;
  setDefaultReservedOutputTokens: (n: number) => void;
  setDefaultSystemPrompt: (s: string) => void;
  setModelOverride: (modelId: string, settings: ModelSettings) => void;
  clearModelOverride: (modelId: string) => void;
  getModelSettings: (modelId: string) => ResolvedModelSettings;
  setBackgroundJobsEnabled: (enabled: boolean) => void;
  setAutoSummarizeChats: (enabled: boolean) => void;
  setSummaryModel: (modelId: string) => void;
  setMemoryExtractionEnabled: (enabled: boolean) => void;
  setMemoryExtractionModel: (modelId: string) => void;
  setDefaultWebSearchEnabled: (enabled: boolean) => void;
  setCodeExecutionEnabled: (enabled: boolean) => void;
  setCustomPythonPath: (path: string) => void;
  setCodeExecutionTimeoutSecs: (secs: number) => void;
  setWebSearchSearxngUrl: (url: string) => void;
  setWebSearchDefaultMode: (mode: "auto" | "always" | "off") => void;
  setWebSearchMaxResults: (n: number) => void;
  setWebSearchTimeRange: (range: "" | "day" | "week" | "month" | "year") => void;
  setWebSearchCategories: (categories: string) => void;
  setWebSearchSafeSearch: (level: 0 | 1 | 2) => void;
  setWebSearchContextTokenLimit: (n: number) => void;
  setWebSearchFetchEnabled: (enabled: boolean) => void;
  setWebSearchFetchCount: (n: number) => void;
  setWebSearchPerPageTimeoutSecs: (n: number) => void;
  setWebSearchFetchMaxCharsPerSource: (n: number) => void;
  setAdvancedSearchBundleEnabled: (enabled: boolean) => void;
  setBundleExtractDocx: (enabled: boolean) => void;
  setBundleExtractPptx: (enabled: boolean) => void;
  setBundleExtractXlsx: (enabled: boolean) => void;
  setBundleExtractEpub: (enabled: boolean) => void;
  setBundleWaybackFallback: (enabled: boolean) => void;
  setBundleArxivSearch: (enabled: boolean) => void;
  setBundleWikipediaSearch: (enabled: boolean) => void;
  setSearxngSetupError: (message: string) => void;
  setContextAnchoringEnabled: (enabled: boolean) => void;
  setDocumentPanelEnabled: (enabled: boolean) => void;
  setDocumentAutoSaveEnabled: (enabled: boolean) => void;
  setDocumentAutoSaveDelay: (ms: number) => void;
  setDocumentDefaultType: (type: string) => void;
  setDocumentWordWrap: (enabled: boolean) => void;
  setDocumentFontSize: (size: number) => void;
  setDocumentTabSize: (size: number) => void;
  setDocumentSpellCheck: (enabled: boolean) => void;
  setDocumentAutoOpenOnCreate: (enabled: boolean) => void;
  setConnectivityPreference: (preference: ConnectivityPreference) => void;
  setCharacterAssistModel: (model: string) => void;
  setCharacterAssistMaxTokens: (n: number) => void;
  setCharacterAssistSendContext: (enabled: boolean) => void;
  setCharacterAssistTelemetry: (enabled: boolean) => void;
  setCharacterAssistTone: (tone: string) => void;
  setWorkspaceChatMode: (mode: WorkspaceChatMode) => void;
  setReasoningEnabled: (enabled: boolean) => void;
  setToolSettingsSectionVisible: (id: ToolSettingsSectionId, visible: boolean) => void;
  setAllToolSettingsSectionsVisible: (visible: boolean) => void;
  setToolSettingsSubsectionExpanded: (key: string, expanded: boolean) => void;
  applyResearch: (action: ResearchConfigSetter) => void;
  setResearchAdvancedOpen: (open: boolean) => void;
  setResearchFirstRunNoticeDismissed: (dismissed: boolean) => void;
  // Convenience helpers built on top of applyResearch.
  setResearchActiveProfile: (id: ResearchDepthProfileId) => void;
  setResearchOverride: (override: ResearchProfileOverride) => void;
  setResearchDepthOverride: (depth: ResearchDepth, override: ResearchProfileOverride) => void;
  addResearchCustomProfile: (profile: ResearchDepthProfile) => void;
  updateResearchCustomProfile: (id: string, profile: Partial<ResearchDepthProfile>) => void;
  deleteResearchCustomProfile: (id: string) => void;
  setResearchDefaultDepth: (depth: ResearchDepth) => void;
  setResearchDefaultModelId: (modelId: string | null) => void;
  setResearchLiteModel: (modelId: string, providerId: string) => void;
  resetResearch: () => void;
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
  defaultMaxTokens: 0,
  defaultTopP: 1.0,
  defaultRepetitionPenalty: 1.0,
  defaultStopSequences: [],
  defaultReservedOutputTokens: 1024,
  defaultSystemPrompt: "",
  modelOverrides: {},
  backgroundJobsEnabled: true,
  autoSummarizeChats: false,
  summaryModel: "",
  memoryExtractionEnabled: true,
  memoryExtractionModel: "",
  defaultWebSearchEnabled: false,
  codeExecutionEnabled: false,
  customPythonPath: "",
  codeExecutionTimeoutSecs: 30,
  webSearchSearxngUrl: "",
  webSearchDefaultMode: "auto",
  webSearchMaxResults: 8,
  webSearchTimeRange: "",
  webSearchCategories: "",
  webSearchSafeSearch: 0,
  webSearchContextTokenLimit: 4000,
  webSearchFetchEnabled: true,
  webSearchFetchCount: 5,
  webSearchPerPageTimeoutSecs: 8,
  webSearchFetchMaxCharsPerSource: 8000,
  advancedSearchBundleEnabled: true,
  bundleExtractDocx: true,
  bundleExtractPptx: true,
  bundleExtractXlsx: true,
  bundleExtractEpub: true,
  bundleWaybackFallback: true,
  bundleArxivSearch: true,
  bundleWikipediaSearch: true,
  searxngSetupError: "",
  contextAnchoringEnabled: true,
  documentPanelEnabled: true,
  documentAutoSaveEnabled: true,
  documentAutoSaveDelay: 800,
  documentDefaultType: "document",
  documentWordWrap: true,
  documentFontSize: 14,
  documentTabSize: 2,
  documentSpellCheck: true,
  documentAutoOpenOnCreate: true,
  connectivityPreference: "auto",
  characterAssistModel: "",
  characterAssistMaxTokens: 1500,
  characterAssistSendContext: false,
  characterAssistTelemetry: true,
  characterAssistTone: "neutral",
  workspaceChatMode: "chat",
  reasoningEnabled: true,
  visibleToolSettingsSections: DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS,
  toolSettingsSubsectionsExpanded: {},
  research: DEFAULT_RESEARCH_CONFIG,
  researchAdvancedOpen: false,
  researchFirstRunNoticeDismissed: false,
};

function partializeSettings(state: SettingsStore): SettingsStoreState {
  return {
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
    defaultMaxTokens: state.defaultMaxTokens,
    defaultTopP: state.defaultTopP,
    defaultRepetitionPenalty: state.defaultRepetitionPenalty,
    defaultStopSequences: state.defaultStopSequences,
    defaultReservedOutputTokens: state.defaultReservedOutputTokens,
    defaultSystemPrompt: state.defaultSystemPrompt,
    modelOverrides: state.modelOverrides,
    backgroundJobsEnabled: state.backgroundJobsEnabled,
    autoSummarizeChats: state.autoSummarizeChats,
    summaryModel: state.summaryModel,
    memoryExtractionEnabled: state.memoryExtractionEnabled,
    memoryExtractionModel: state.memoryExtractionModel,
    defaultWebSearchEnabled: state.defaultWebSearchEnabled,
    codeExecutionEnabled: state.codeExecutionEnabled,
    customPythonPath: state.customPythonPath,
    codeExecutionTimeoutSecs: state.codeExecutionTimeoutSecs,
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
    advancedSearchBundleEnabled: state.advancedSearchBundleEnabled,
    bundleExtractDocx: state.bundleExtractDocx,
    bundleExtractPptx: state.bundleExtractPptx,
    bundleExtractXlsx: state.bundleExtractXlsx,
    bundleExtractEpub: state.bundleExtractEpub,
    bundleWaybackFallback: state.bundleWaybackFallback,
    bundleArxivSearch: state.bundleArxivSearch,
    bundleWikipediaSearch: state.bundleWikipediaSearch,
    searxngSetupError: state.searxngSetupError,
    contextAnchoringEnabled: state.contextAnchoringEnabled,
    documentPanelEnabled: state.documentPanelEnabled,
    documentAutoSaveEnabled: state.documentAutoSaveEnabled,
    documentAutoSaveDelay: state.documentAutoSaveDelay,
    documentDefaultType: state.documentDefaultType,
    documentWordWrap: state.documentWordWrap,
    documentFontSize: state.documentFontSize,
    documentTabSize: state.documentTabSize,
    documentSpellCheck: state.documentSpellCheck,
    documentAutoOpenOnCreate: state.documentAutoOpenOnCreate,
    connectivityPreference: state.connectivityPreference,
    characterAssistModel: state.characterAssistModel,
    characterAssistMaxTokens: state.characterAssistMaxTokens,
    characterAssistSendContext: state.characterAssistSendContext,
    characterAssistTelemetry: state.characterAssistTelemetry,
    characterAssistTone: state.characterAssistTone,
    workspaceChatMode: state.workspaceChatMode,
    reasoningEnabled: state.reasoningEnabled,
    visibleToolSettingsSections: state.visibleToolSettingsSections,
    toolSettingsSubsectionsExpanded: state.toolSettingsSubsectionsExpanded,
    research: state.research,
    researchAdvancedOpen: state.researchAdvancedOpen,
    researchFirstRunNoticeDismissed: state.researchFirstRunNoticeDismissed,
  };
}

let settingsHydrated = false;

export async function ensureSettingsHydrated(): Promise<void> {
  if (settingsHydrated) return;
  await useSettingsStore.persist.rehydrate();
  settingsHydrated = true;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      setActiveNav: (activeNav) => set({ activeNav }),
      setRecentChatsCollapsed: (recentChatsCollapsed) => set({ recentChatsCollapsed }),
      setRightPanelCollapsed: (rightPanelCollapsed) => set({ rightPanelCollapsed }),
      setMemoryMode: (memoryMode) => set({ memoryMode }),
      setMaxMemoryTokens: (maxMemoryTokens) => set({ maxMemoryTokens }),
      setMaxMemoryNodes: (maxMemoryNodes) => set({ maxMemoryNodes }),
      setMaxMemoryFiles: (maxMemoryFiles) => set({ maxMemoryFiles }),
      setMaxGraphDepth: (maxGraphDepth) => set({ maxGraphDepth }),
      toggleFavoriteModel: (modelId: string) => {
        const current = get().favoriteModels;
        const next = current.includes(modelId)
          ? current.filter((id) => id !== modelId)
          : [...current, modelId];
        set({ favoriteModels: next });
      },
      setAutoNameEnabled: (autoNameEnabled) => set({ autoNameEnabled }),
      setAutoNameModel: (autoNameModel) => set({ autoNameModel }),
      setDefaultMemoryEnabled: (defaultMemoryEnabled) => set({ defaultMemoryEnabled }),
      setDefaultTemperature: (defaultTemperature) => set({ defaultTemperature }),
      setDefaultContextLength: (defaultContextLength) => set({ defaultContextLength }),
      setDefaultMaxTokens: (defaultMaxTokens) => set({ defaultMaxTokens }),
      setDefaultTopP: (defaultTopP) => set({ defaultTopP }),
      setDefaultRepetitionPenalty: (defaultRepetitionPenalty) => set({ defaultRepetitionPenalty }),
      setDefaultStopSequences: (defaultStopSequences) => set({ defaultStopSequences }),
      setDefaultReservedOutputTokens: (defaultReservedOutputTokens) =>
        set({ defaultReservedOutputTokens }),
      setDefaultSystemPrompt: (defaultSystemPrompt) => set({ defaultSystemPrompt }),
      setModelOverride: (modelId: string, settings: ModelSettings) => {
        const current = get().modelOverrides;
        set({ modelOverrides: { ...current, [modelId]: settings } });
      },
      clearModelOverride: (modelId: string) => {
        const current = get().modelOverrides;
        const next = { ...current };
        delete next[modelId];
        set({ modelOverrides: next });
      },
      getModelSettings: (modelId: string): ResolvedModelSettings => {
        const state = get();
        const override = state.modelOverrides[modelId];
        return {
          temperature: override?.temperature ?? state.defaultTemperature,
          contextLength: override?.contextLength ?? state.defaultContextLength,
          maxTokens: override?.maxTokens ?? state.defaultMaxTokens,
          topP: override?.topP ?? state.defaultTopP,
          repetitionPenalty: override?.repetitionPenalty ?? state.defaultRepetitionPenalty,
          stopSequences: override?.stopSequences ?? state.defaultStopSequences,
          reservedOutputTokens:
            override?.reservedOutputTokens ?? state.defaultReservedOutputTokens,
          systemPrompt: override?.systemPrompt ?? state.defaultSystemPrompt,
        };
      },
      setBackgroundJobsEnabled: (backgroundJobsEnabled) => set({ backgroundJobsEnabled }),
      setAutoSummarizeChats: (autoSummarizeChats) => set({ autoSummarizeChats }),
      setSummaryModel: (summaryModel) => set({ summaryModel }),
      setMemoryExtractionEnabled: (memoryExtractionEnabled) => set({ memoryExtractionEnabled }),
      setMemoryExtractionModel: (memoryExtractionModel) => set({ memoryExtractionModel }),
      setDefaultWebSearchEnabled: (defaultWebSearchEnabled) => set({ defaultWebSearchEnabled }),
      setCodeExecutionEnabled: (codeExecutionEnabled) => set({ codeExecutionEnabled }),
      setCustomPythonPath: (customPythonPath) => set({ customPythonPath }),
      setCodeExecutionTimeoutSecs: (codeExecutionTimeoutSecs) =>
        set({ codeExecutionTimeoutSecs }),
      setWebSearchSearxngUrl: (webSearchSearxngUrl) => set({ webSearchSearxngUrl }),
      setWebSearchDefaultMode: (webSearchDefaultMode) => set({ webSearchDefaultMode }),
      setWebSearchMaxResults: (webSearchMaxResults) => set({ webSearchMaxResults }),
      setWebSearchTimeRange: (webSearchTimeRange) => set({ webSearchTimeRange }),
      setWebSearchCategories: (webSearchCategories) => set({ webSearchCategories }),
      setWebSearchSafeSearch: (webSearchSafeSearch) => set({ webSearchSafeSearch }),
      setWebSearchContextTokenLimit: (webSearchContextTokenLimit) => set({ webSearchContextTokenLimit }),
      setWebSearchFetchEnabled: (webSearchFetchEnabled) => set({ webSearchFetchEnabled }),
      setWebSearchFetchCount: (webSearchFetchCount) => set({ webSearchFetchCount }),
      setWebSearchPerPageTimeoutSecs: (webSearchPerPageTimeoutSecs) =>
        set({ webSearchPerPageTimeoutSecs }),
      setWebSearchFetchMaxCharsPerSource: (webSearchFetchMaxCharsPerSource) =>
        set({ webSearchFetchMaxCharsPerSource }),
      setAdvancedSearchBundleEnabled: (advancedSearchBundleEnabled) =>
        set({ advancedSearchBundleEnabled }),
      setBundleExtractDocx: (bundleExtractDocx) => set({ bundleExtractDocx }),
      setBundleExtractPptx: (bundleExtractPptx) => set({ bundleExtractPptx }),
      setBundleExtractXlsx: (bundleExtractXlsx) => set({ bundleExtractXlsx }),
      setBundleExtractEpub: (bundleExtractEpub) => set({ bundleExtractEpub }),
      setBundleWaybackFallback: (bundleWaybackFallback) => set({ bundleWaybackFallback }),
      setBundleArxivSearch: (bundleArxivSearch) => set({ bundleArxivSearch }),
      setBundleWikipediaSearch: (bundleWikipediaSearch) => set({ bundleWikipediaSearch }),
      setSearxngSetupError: (searxngSetupError) => set({ searxngSetupError }),
      setContextAnchoringEnabled: (contextAnchoringEnabled) => set({ contextAnchoringEnabled }),
      setDocumentPanelEnabled: (documentPanelEnabled) => set({ documentPanelEnabled }),
      setDocumentAutoSaveEnabled: (documentAutoSaveEnabled) => set({ documentAutoSaveEnabled }),
      setDocumentAutoSaveDelay: (documentAutoSaveDelay) => set({ documentAutoSaveDelay }),
      setDocumentDefaultType: (documentDefaultType) => set({ documentDefaultType }),
      setDocumentWordWrap: (documentWordWrap) => set({ documentWordWrap }),
      setDocumentFontSize: (documentFontSize) => set({ documentFontSize }),
      setDocumentTabSize: (documentTabSize) => set({ documentTabSize }),
      setDocumentSpellCheck: (documentSpellCheck) => set({ documentSpellCheck }),
      setDocumentAutoOpenOnCreate: (documentAutoOpenOnCreate) => set({ documentAutoOpenOnCreate }),
      setConnectivityPreference: (connectivityPreference) => set({ connectivityPreference }),
      setCharacterAssistModel: (characterAssistModel) => set({ characterAssistModel }),
      setCharacterAssistMaxTokens: (characterAssistMaxTokens) => set({ characterAssistMaxTokens }),
      setCharacterAssistSendContext: (characterAssistSendContext) => set({ characterAssistSendContext }),
      setCharacterAssistTelemetry: (characterAssistTelemetry) => set({ characterAssistTelemetry }),
      setCharacterAssistTone: (characterAssistTone) => set({ characterAssistTone }),
      setWorkspaceChatMode: (workspaceChatMode) => set({ workspaceChatMode }),
      setReasoningEnabled: (reasoningEnabled) => set({ reasoningEnabled }),
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
      applyResearch: (action) =>
        set((state) => ({ research: applyResearchConfig(state.research, action) })),
      setResearchAdvancedOpen: (researchAdvancedOpen) => set({ researchAdvancedOpen }),
      setResearchFirstRunNoticeDismissed: (researchFirstRunNoticeDismissed) =>
        set({ researchFirstRunNoticeDismissed }),
      setResearchActiveProfile: (id) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setActiveProfile", id }) })),
      setResearchOverride: (override) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setOverride", override }) })),
      setResearchDepthOverride: (depth, override) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setDepthOverride", depth, override }) })),
      addResearchCustomProfile: (profile) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "addCustomProfile", profile }) })),
      updateResearchCustomProfile: (id, profile) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "updateCustomProfile", id, profile }) })),
      deleteResearchCustomProfile: (id) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "deleteCustomProfile", id }) })),
      setResearchDefaultDepth: (defaultDepth) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setDefaultDepth", depth: defaultDepth }) })),
      setResearchDefaultModelId: (defaultModelId) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setDefaultModelId", modelId: defaultModelId }) })),
      setResearchLiteModel: (modelId, providerId) =>
        set((state) => ({ research: applyResearchConfig(state.research, { kind: "setLiteModel", modelId, providerId }) })),
      resetResearch: () =>
        set({ research: { ...DEFAULT_RESEARCH_CONFIG } }),
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
          // Always restore baseline of built-in depthOverrides; do not trust user overrides silently.
          depthOverrides: parsed.research?.depthOverrides ?? {},
          customProfiles: parsed.research?.customProfiles ?? [],
        };
        return { ...current, ...DEFAULT_STATE, ...migrated };
      },
    },
  ),
);
