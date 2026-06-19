import type { StateCreator } from "zustand";

export type CharacterSliceState = {
  characterAssistModel: string;
  characterAssistMaxTokens: number;
  characterAssistSendContext: boolean;
  characterAssistTelemetry: boolean;
  characterAssistTone: string;
};

export type CharacterSliceActions = {
  setCharacterAssistModel: (model: string) => void;
  setCharacterAssistMaxTokens: (n: number) => void;
  setCharacterAssistSendContext: (enabled: boolean) => void;
  setCharacterAssistTelemetry: (enabled: boolean) => void;
  setCharacterAssistTone: (tone: string) => void;
};

export const DEFAULT_CHARACTER_STATE: CharacterSliceState = {
  characterAssistModel: "",
  characterAssistMaxTokens: 1500,
  characterAssistSendContext: false,
  characterAssistTelemetry: true,
  characterAssistTone: "neutral",
};

export type CharacterSlice = CharacterSliceState & CharacterSliceActions;

export const createCharacterSlice: StateCreator<CharacterSlice, [], [], CharacterSlice> = (set) => ({
  ...DEFAULT_CHARACTER_STATE,
  setCharacterAssistModel: (characterAssistModel) => set({ characterAssistModel }),
  setCharacterAssistMaxTokens: (characterAssistMaxTokens) => set({ characterAssistMaxTokens }),
  setCharacterAssistSendContext: (characterAssistSendContext) => set({ characterAssistSendContext }),
  setCharacterAssistTelemetry: (characterAssistTelemetry) => set({ characterAssistTelemetry }),
  setCharacterAssistTone: (characterAssistTone) => set({ characterAssistTone }),
});
