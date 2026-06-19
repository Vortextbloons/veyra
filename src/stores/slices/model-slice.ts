import type { StateCreator } from "zustand";

export type ModelSettings = {
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopSequences?: string[];
  reservedOutputTokens?: number;
  systemPrompt?: string;
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

export type ModelSliceState = {
  favoriteModels: string[];
  autoNameEnabled: boolean;
  autoNameModel: string;
  defaultTemperature: number;
  defaultContextLength: number;
  defaultMaxTokens: number;
  defaultTopP: number;
  defaultRepetitionPenalty: number;
  defaultStopSequences: string[];
  defaultReservedOutputTokens: number;
  defaultSystemPrompt: string;
  modelOverrides: Record<string, ModelSettings>;
  reasoningEnabled: boolean;
  backgroundJobsEnabled: boolean;
  autoSummarizeChats: boolean;
  summaryModel: string;
};

export type ModelSliceActions = {
  toggleFavoriteModel: (modelId: string) => void;
  setAutoNameEnabled: (enabled: boolean) => void;
  setAutoNameModel: (modelId: string) => void;
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
  setReasoningEnabled: (enabled: boolean) => void;
  setBackgroundJobsEnabled: (enabled: boolean) => void;
  setAutoSummarizeChats: (enabled: boolean) => void;
  setSummaryModel: (modelId: string) => void;
};

export const DEFAULT_MODEL_STATE: ModelSliceState = {
  favoriteModels: [],
  autoNameEnabled: true,
  autoNameModel: "",
  defaultTemperature: 0.7,
  defaultContextLength: 8192,
  defaultMaxTokens: 0,
  defaultTopP: 1.0,
  defaultRepetitionPenalty: 1.0,
  defaultStopSequences: [],
  defaultReservedOutputTokens: 1024,
  defaultSystemPrompt: "",
  modelOverrides: {},
  reasoningEnabled: true,
  backgroundJobsEnabled: true,
  autoSummarizeChats: false,
  summaryModel: "",
};

export type ModelSlice = ModelSliceState & ModelSliceActions;

export const createModelSlice: StateCreator<ModelSlice, [], [], ModelSlice> = (set, get) => ({
  ...DEFAULT_MODEL_STATE,
  toggleFavoriteModel: (modelId: string) => {
    const current = get().favoriteModels;
    const next = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    set({ favoriteModels: next });
  },
  setAutoNameEnabled: (autoNameEnabled) => set({ autoNameEnabled }),
  setAutoNameModel: (autoNameModel) => set({ autoNameModel }),
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
  setReasoningEnabled: (reasoningEnabled) => set({ reasoningEnabled }),
  setBackgroundJobsEnabled: (backgroundJobsEnabled) => set({ backgroundJobsEnabled }),
  setAutoSummarizeChats: (autoSummarizeChats) => set({ autoSummarizeChats }),
  setSummaryModel: (summaryModel) => set({ summaryModel }),
});
