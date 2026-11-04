import type { StateCreator } from "zustand";

export type ChatSliceState = {
  contextAnchoringEnabled: boolean;
  enhancedModeEnabled: boolean;
  interactiveAnswersEnabled: boolean;
  artifactsEnabled: boolean;
};

export type ChatSliceActions = {
  setContextAnchoringEnabled: (enabled: boolean) => void;
  setEnhancedModeEnabled: (enabled: boolean) => void;
  setInteractiveAnswersEnabled: (enabled: boolean) => void;
  setArtifactsEnabled: (enabled: boolean) => void;
};

export const DEFAULT_CHAT_STATE: ChatSliceState = {
  contextAnchoringEnabled: true,
  enhancedModeEnabled: false,
  interactiveAnswersEnabled: false,
  artifactsEnabled: true,
};

export type ChatSlice = ChatSliceState & ChatSliceActions;

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (set) => ({
  ...DEFAULT_CHAT_STATE,
  setContextAnchoringEnabled: (contextAnchoringEnabled) => set({ contextAnchoringEnabled }),
  setEnhancedModeEnabled: (enhancedModeEnabled) => set({ enhancedModeEnabled }),
  setInteractiveAnswersEnabled: (interactiveAnswersEnabled) => set({ interactiveAnswersEnabled }),
  setArtifactsEnabled: (artifactsEnabled) => set({ artifactsEnabled }),
});
