import type { StateCreator } from "zustand";

export type CodeExecutionSliceState = {
  codeExecutionEnabled: boolean;
  customPythonPath: string;
  codeExecutionTimeoutSecs: number;
};

export const DEFAULT_CODE_EXECUTION_STATE: CodeExecutionSliceState = {
  codeExecutionEnabled: true,
  customPythonPath: "",
  codeExecutionTimeoutSecs: 30,
};

export type CodeExecutionSlice = CodeExecutionSliceState;

export const createCodeExecutionSlice: StateCreator<CodeExecutionSlice, [], [], CodeExecutionSlice> = () => ({
  ...DEFAULT_CODE_EXECUTION_STATE,
});
