import type { StateCreator } from "zustand";

export type DocumentSliceState = {
  documentPanelEnabled: boolean;
  documentAutoSaveEnabled: boolean;
  documentAutoSaveDelay: number;
  documentDefaultType: string;
  documentWordWrap: boolean;
  documentFontSize: number;
  documentTabSize: number;
  documentSpellCheck: boolean;
  documentAutoOpenOnCreate: boolean;
  documentDefaultViewMode: "source" | "split" | "preview";
  documentAiPanelAutoShow: boolean;
  documentListDensity: "comfortable" | "compact";
};

export type DocumentSliceActions = {
  setDocumentPanelEnabled: (enabled: boolean) => void;
  setDocumentAutoSaveEnabled: (enabled: boolean) => void;
  setDocumentAutoSaveDelay: (ms: number) => void;
  setDocumentDefaultType: (type: string) => void;
  setDocumentWordWrap: (enabled: boolean) => void;
  setDocumentFontSize: (size: number) => void;
  setDocumentTabSize: (size: number) => void;
  setDocumentSpellCheck: (enabled: boolean) => void;
  setDocumentAutoOpenOnCreate: (enabled: boolean) => void;
  setDocumentDefaultViewMode: (mode: "source" | "split" | "preview") => void;
  setDocumentAiPanelAutoShow: (enabled: boolean) => void;
  setDocumentListDensity: (density: "comfortable" | "compact") => void;
};

export const DEFAULT_DOCUMENT_STATE: DocumentSliceState = {
  documentPanelEnabled: true,
  documentAutoSaveEnabled: true,
  documentAutoSaveDelay: 800,
  documentDefaultType: "document",
  documentWordWrap: true,
  documentFontSize: 14,
  documentTabSize: 2,
  documentSpellCheck: true,
  documentAutoOpenOnCreate: true,
  documentDefaultViewMode: "split",
  documentAiPanelAutoShow: false,
  documentListDensity: "comfortable",
};

export type DocumentSlice = DocumentSliceState & DocumentSliceActions;

export const createDocumentSlice: StateCreator<DocumentSlice, [], [], DocumentSlice> = (set) => ({
  ...DEFAULT_DOCUMENT_STATE,
  setDocumentPanelEnabled: (documentPanelEnabled) => set({ documentPanelEnabled }),
  setDocumentAutoSaveEnabled: (documentAutoSaveEnabled) => set({ documentAutoSaveEnabled }),
  setDocumentAutoSaveDelay: (documentAutoSaveDelay) => set({ documentAutoSaveDelay }),
  setDocumentDefaultType: (documentDefaultType) => set({ documentDefaultType }),
  setDocumentWordWrap: (documentWordWrap) => set({ documentWordWrap }),
  setDocumentFontSize: (documentFontSize) => set({ documentFontSize }),
  setDocumentTabSize: (documentTabSize) => set({ documentTabSize }),
  setDocumentSpellCheck: (documentSpellCheck) => set({ documentSpellCheck }),
  setDocumentAutoOpenOnCreate: (documentAutoOpenOnCreate) => set({ documentAutoOpenOnCreate }),
  setDocumentDefaultViewMode: (documentDefaultViewMode) => set({ documentDefaultViewMode }),
  setDocumentAiPanelAutoShow: (documentAiPanelAutoShow) => set({ documentAiPanelAutoShow }),
  setDocumentListDensity: (documentListDensity) => set({ documentListDensity }),
});
