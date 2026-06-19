import type { StateCreator } from "zustand";
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

export type ResearchSliceState = {
  research: ResearchConfigState;
  researchAdvancedOpen: boolean;
  researchFirstRunNoticeDismissed: boolean;
};

export type ResearchSliceActions = {
  applyResearch: (action: ResearchConfigSetter) => void;
  setResearchAdvancedOpen: (open: boolean) => void;
  setResearchFirstRunNoticeDismissed: (dismissed: boolean) => void;
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

export const DEFAULT_RESEARCH_SLICE_STATE: ResearchSliceState = {
  research: DEFAULT_RESEARCH_CONFIG,
  researchAdvancedOpen: false,
  researchFirstRunNoticeDismissed: false,
};

export type ResearchSlice = ResearchSliceState & ResearchSliceActions;

export const createResearchSlice: StateCreator<ResearchSlice, [], [], ResearchSlice> = (set) => ({
  ...DEFAULT_RESEARCH_SLICE_STATE,
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
});
