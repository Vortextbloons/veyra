import type { StateCreator } from "zustand";

export type CodeExecutionSliceState = {
  codeExecutionEnabled: boolean;
  customPythonPath: string;
  codeExecutionTimeoutSecs: number;
};

export type CodeExecutionSliceActions = {
  setCodeExecutionEnabled: (enabled: boolean) => void;
  setCustomPythonPath: (path: string) => void;
  setCodeExecutionTimeoutSecs: (secs: number) => void;
};

export const DEFAULT_CODE_EXECUTION_STATE: CodeExecutionSliceState = {
  codeExecutionEnabled: true,
  customPythonPath: "",
  codeExecutionTimeoutSecs: 30,
};

export type CodeExecutionSlice = CodeExecutionSliceState & CodeExecutionSliceActions;

export const createCodeExecutionSlice: StateCreator<CodeExecutionSlice, [], [], CodeExecutionSlice> = (set) => ({
  ...DEFAULT_CODE_EXECUTION_STATE,
  setCodeExecutionEnabled: (codeExecutionEnabled) => set({ codeExecutionEnabled }),
  setCustomPythonPath: (customPythonPath) => set({ customPythonPath }),
  setCodeExecutionTimeoutSecs: (codeExecutionTimeoutSecs) => set({ codeExecutionTimeoutSecs }),
});
