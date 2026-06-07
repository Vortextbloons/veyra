import { create } from "zustand";
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

export type SettingsStoreState = {
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
  schedulerPanelCollapsed: boolean;
  defaultWebSearchEnabled: boolean;
  webSearchSearxngUrl: string;
  webSearchDefaultMode: "auto" | "always" | "off";
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
};

export type ResolvedModelSettings = {
  temperature: number;
  contextLength: number;
  maxTokens: number;
  topP: number;
  repetitionPenalty: number;
  stopSequences: string[];
  reservedOutputTokens: number;
  systemPrompt: string;
};

export type SettingsStore = SettingsStoreState & {
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
  setSchedulerPanelCollapsed: (collapsed: boolean) => void;
  setDefaultWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchSearxngUrl: (url: string) => void;
  setWebSearchDefaultMode: (mode: "auto" | "always" | "off") => void;
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
  schedulerPanelCollapsed: false,
  defaultWebSearchEnabled: false,
  webSearchSearxngUrl: "",
  webSearchDefaultMode: "auto",
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
};

function loadState(): SettingsStoreState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SettingsStoreState> & {
      webSearchEnabled?: boolean;
    };
    const migrated: Partial<SettingsStoreState> = { ...parsed };
    if (
      parsed.webSearchEnabled !== undefined &&
      parsed.defaultWebSearchEnabled === undefined
    ) {
      migrated.defaultWebSearchEnabled = parsed.webSearchEnabled;
    }
    return { ...DEFAULT_STATE, ...migrated };
  } catch {
    return DEFAULT_STATE;
  }
}

function persistState(state: SettingsStoreState) {
  try {
    const subset: SettingsStoreState = {
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
      schedulerPanelCollapsed: state.schedulerPanelCollapsed,
      defaultWebSearchEnabled: state.defaultWebSearchEnabled,
      webSearchSearxngUrl: state.webSearchSearxngUrl,
      webSearchDefaultMode: state.webSearchDefaultMode,
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
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(subset));
  } catch {
    // storage unavailable; ignore
  }
}

let settingsHydrated = false;
let settingsHydratePromise: Promise<void> | null = null;

export async function ensureSettingsHydrated(): Promise<void> {
  if (settingsHydrated) return;
  settingsHydratePromise ??= Promise.resolve().then(() => {
    useSettingsStore.setState(loadState());
    settingsHydrated = true;
  });
  await settingsHydratePromise;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const apply = (patch: Partial<SettingsStoreState>) => {
    set((state) => {
      const next = { ...state, ...patch };
      persistState(next);
      return next;
    });
  };
  return {
    ...DEFAULT_STATE,
    setActiveNav: (activeNav) => apply({ activeNav }),
    setRecentChatsCollapsed: (recentChatsCollapsed) =>
      apply({ recentChatsCollapsed }),
    setRightPanelCollapsed: (rightPanelCollapsed) =>
      apply({ rightPanelCollapsed }),
    setMemoryMode: (memoryMode) => apply({ memoryMode }),
    setMaxMemoryTokens: (maxMemoryTokens) => apply({ maxMemoryTokens }),
    setMaxMemoryNodes: (maxMemoryNodes) => apply({ maxMemoryNodes }),
    setMaxMemoryFiles: (maxMemoryFiles) => apply({ maxMemoryFiles }),
    setMaxGraphDepth: (maxGraphDepth) => apply({ maxGraphDepth }),
    toggleFavoriteModel: (modelId: string) => {
      const current = get().favoriteModels;
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId];
      apply({ favoriteModels: next });
    },
    setAutoNameEnabled: (autoNameEnabled) => apply({ autoNameEnabled }),
    setAutoNameModel: (autoNameModel) => apply({ autoNameModel }),
    setDefaultMemoryEnabled: (defaultMemoryEnabled) => apply({ defaultMemoryEnabled }),
    setDefaultTemperature: (defaultTemperature) => apply({ defaultTemperature }),
    setDefaultContextLength: (defaultContextLength) => apply({ defaultContextLength }),
    setDefaultMaxTokens: (defaultMaxTokens) => apply({ defaultMaxTokens }),
    setDefaultTopP: (defaultTopP) => apply({ defaultTopP }),
    setDefaultRepetitionPenalty: (defaultRepetitionPenalty) => apply({ defaultRepetitionPenalty }),
    setDefaultStopSequences: (defaultStopSequences) => apply({ defaultStopSequences }),
    setDefaultReservedOutputTokens: (defaultReservedOutputTokens) => apply({ defaultReservedOutputTokens }),
    setDefaultSystemPrompt: (defaultSystemPrompt) => apply({ defaultSystemPrompt }),
    setModelOverride: (modelId: string, settings: ModelSettings) => {
      const current = get().modelOverrides;
      apply({ modelOverrides: { ...current, [modelId]: settings } });
    },
    clearModelOverride: (modelId: string) => {
      const current = get().modelOverrides;
      const next = { ...current };
      delete next[modelId];
      apply({ modelOverrides: next });
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
        reservedOutputTokens: override?.reservedOutputTokens ?? state.defaultReservedOutputTokens,
        systemPrompt: override?.systemPrompt ?? state.defaultSystemPrompt,
      };
    },
    setBackgroundJobsEnabled: (backgroundJobsEnabled) => apply({ backgroundJobsEnabled }),
    setAutoSummarizeChats: (autoSummarizeChats) => apply({ autoSummarizeChats }),
    setSummaryModel: (summaryModel) => apply({ summaryModel }),
    setMemoryExtractionEnabled: (memoryExtractionEnabled) => apply({ memoryExtractionEnabled }),
    setMemoryExtractionModel: (memoryExtractionModel) => apply({ memoryExtractionModel }),
    setSchedulerPanelCollapsed: (schedulerPanelCollapsed) => apply({ schedulerPanelCollapsed }),
    setDefaultWebSearchEnabled: (defaultWebSearchEnabled) =>
      apply({ defaultWebSearchEnabled }),
    setWebSearchSearxngUrl: (webSearchSearxngUrl) => apply({ webSearchSearxngUrl }),
    setWebSearchDefaultMode: (webSearchDefaultMode) => apply({ webSearchDefaultMode }),
    setSearxngSetupError: (searxngSetupError) => apply({ searxngSetupError }),
    setContextAnchoringEnabled: (contextAnchoringEnabled) => apply({ contextAnchoringEnabled }),
    setDocumentPanelEnabled: (documentPanelEnabled) => apply({ documentPanelEnabled }),
    setDocumentAutoSaveEnabled: (documentAutoSaveEnabled) => apply({ documentAutoSaveEnabled }),
    setDocumentAutoSaveDelay: (documentAutoSaveDelay) => apply({ documentAutoSaveDelay }),
    setDocumentDefaultType: (documentDefaultType) => apply({ documentDefaultType }),
    setDocumentWordWrap: (documentWordWrap) => apply({ documentWordWrap }),
    setDocumentFontSize: (documentFontSize) => apply({ documentFontSize }),
    setDocumentTabSize: (documentTabSize) => apply({ documentTabSize }),
    setDocumentSpellCheck: (documentSpellCheck) => apply({ documentSpellCheck }),
    setDocumentAutoOpenOnCreate: (documentAutoOpenOnCreate) => apply({ documentAutoOpenOnCreate }),
  };
});
