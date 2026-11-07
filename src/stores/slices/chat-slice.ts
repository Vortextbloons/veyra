import type { StateCreator } from "zustand";

export type ChatSliceState = {
  interactiveAnswersEnabled: boolean;
  artifactsEnabled: boolean;
};

export type ChatSliceActions = {
  setInteractiveAnswersEnabled: (enabled: boolean) => void;
  setArtifactsEnabled: (enabled: boolean) => void;
};

export const DEFAULT_CHAT_STATE: ChatSliceState = {
  interactiveAnswersEnabled: false,
  artifactsEnabled: true,
};

export type ChatSlice = ChatSliceState & ChatSliceActions;

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (set) => ({
  ...DEFAULT_CHAT_STATE,
  setInteractiveAnswersEnabled: (interactiveAnswersEnabled) => set({ interactiveAnswersEnabled }),
  setArtifactsEnabled: (artifactsEnabled) => set({ artifactsEnabled }),
});
