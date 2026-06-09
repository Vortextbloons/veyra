import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";
import type { MemoryMode } from "@/lib/memory-types";
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
  webSearchSearxngUrl: string;
  webSearchDefaultMode: "auto" | "always" | "off";
  webSearchMaxResults: number;
  webSearchTimeRange: "" | "day" | "week" | "month" | "year";
  webSearchCategories: string;
  webSearchSafeSearch: 0 | 1 | 2;
  webSearchContextTokenLimit: number;
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
  setWebSearchSearxngUrl: (url: string) => void;
  setWebSearchDefaultMode: (mode: "auto" | "always" | "off") => void;
  setWebSearchMaxResults: (n: number) => void;
  setWebSearchTimeRange: (range: "" | "day" | "week" | "month" | "year") => void;
  setWebSearchCategories: (categories: string) => void;
  setWebSearchSafeSearch: (level: 0 | 1 | 2) => void;
  setWebSearchContextTokenLimit: (n: number) => void;
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
  webSearchSearxngUrl: "",
  webSearchDefaultMode: "auto",
  webSearchMaxResults: 8,
  webSearchTimeRange: "",
  webSearchCategories: "",
  webSearchSafeSearch: 0,
  webSearchContextTokenLimit: 2500,
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
    webSearchSearxngUrl: state.webSearchSearxngUrl,
    webSearchDefaultMode: state.webSearchDefaultMode,
    webSearchMaxResults: state.webSearchMaxResults,
    webSearchTimeRange: state.webSearchTimeRange,
    webSearchCategories: state.webSearchCategories,
    webSearchSafeSearch: state.webSearchSafeSearch,
    webSearchContextTokenLimit: state.webSearchContextTokenLimit,
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
      setWebSearchSearxngUrl: (webSearchSearxngUrl) => set({ webSearchSearxngUrl }),
      setWebSearchDefaultMode: (webSearchDefaultMode) => set({ webSearchDefaultMode }),
      setWebSearchMaxResults: (webSearchMaxResults) => set({ webSearchMaxResults }),
      setWebSearchTimeRange: (webSearchTimeRange) => set({ webSearchTimeRange }),
      setWebSearchCategories: (webSearchCategories) => set({ webSearchCategories }),
      setWebSearchSafeSearch: (webSearchSafeSearch) => set({ webSearchSafeSearch }),
      setWebSearchContextTokenLimit: (webSearchContextTokenLimit) => set({ webSearchContextTokenLimit }),
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
        return { ...current, ...DEFAULT_STATE, ...migrated };
      },
    },
  ),
);
