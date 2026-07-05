import type { StateCreator } from "zustand";

export type EmailAiSliceState = {
  emailAiEnabled: boolean;
  emailAiAutoDraft: boolean;
  emailAiWorkerCount: number;
  emailAiBackgroundSummary: boolean;
  emailAiBackgroundClassification: boolean;
  emailAiBackgroundSpam: boolean;
  emailAiBackgroundUrgency: boolean;
  emailAiPollInterval: number;
  emailAiSummaryModel: string;
  emailAiClassificationModel: string;
  emailAiDraftModel: string;
};

export type EmailAiSliceActions = {
  setEmailAiEnabled: (enabled: boolean) => void;
  setEmailAiAutoDraft: (autoDraft: boolean) => void;
  setEmailAiWorkerCount: (count: number) => void;
  setEmailAiBackgroundSummary: (enabled: boolean) => void;
  setEmailAiBackgroundClassification: (enabled: boolean) => void;
  setEmailAiBackgroundSpam: (enabled: boolean) => void;
  setEmailAiBackgroundUrgency: (enabled: boolean) => void;
  setEmailAiPollInterval: (interval: number) => void;
  setEmailAiSummaryModel: (model: string) => void;
  setEmailAiClassificationModel: (model: string) => void;
  setEmailAiDraftModel: (model: string) => void;
};

export const DEFAULT_EMAIL_AI_STATE: EmailAiSliceState = {
  emailAiEnabled: false,
  emailAiAutoDraft: false,
  emailAiWorkerCount: 1,
  emailAiBackgroundSummary: true,
  emailAiBackgroundClassification: true,
  emailAiBackgroundSpam: true,
  emailAiBackgroundUrgency: true,
  emailAiPollInterval: 60000,
  emailAiSummaryModel: "",
  emailAiClassificationModel: "",
  emailAiDraftModel: "",
};

export type EmailAiSlice = EmailAiSliceState & EmailAiSliceActions;

export const createEmailAiSlice: StateCreator<EmailAiSlice, [], [], EmailAiSlice> = (set) => ({
  ...DEFAULT_EMAIL_AI_STATE,
  setEmailAiEnabled: (emailAiEnabled) => set({ emailAiEnabled }),
  setEmailAiAutoDraft: (emailAiAutoDraft) => set({ emailAiAutoDraft }),
  setEmailAiWorkerCount: (emailAiWorkerCount) =>
    set({ emailAiWorkerCount: Math.max(1, Math.min(4, emailAiWorkerCount)) }),
  setEmailAiBackgroundSummary: (emailAiBackgroundSummary) => set({ emailAiBackgroundSummary }),
  setEmailAiBackgroundClassification: (emailAiBackgroundClassification) =>
    set({ emailAiBackgroundClassification }),
  setEmailAiBackgroundSpam: (emailAiBackgroundSpam) => set({ emailAiBackgroundSpam }),
  setEmailAiBackgroundUrgency: (emailAiBackgroundUrgency) => set({ emailAiBackgroundUrgency }),
  setEmailAiPollInterval: (emailAiPollInterval) =>
    set({ emailAiPollInterval: Math.max(15000, emailAiPollInterval) }),
  setEmailAiSummaryModel: (emailAiSummaryModel) => set({ emailAiSummaryModel }),
  setEmailAiClassificationModel: (emailAiClassificationModel) =>
    set({ emailAiClassificationModel }),
  setEmailAiDraftModel: (emailAiDraftModel) => set({ emailAiDraftModel }),
});
