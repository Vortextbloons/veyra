import { invoke } from "@tauri-apps/api/core";

export type PythonAvailabilityResult = {
  available: boolean;
  resolvedPath: string | null;
  source: string | null;
  version: string | null;
  message: string | null;
};

export type PythonExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
};

export async function invokeCheckPythonAvailable(
  pythonPath?: string | null,
): Promise<PythonAvailabilityResult> {
  return invoke<PythonAvailabilityResult>("check_python_available", {
    pythonPath: pythonPath?.trim() || null,
  });
}

export async function invokeExecutePythonCode(options: {
  code: string;
  timeoutSecs?: number;
  pythonPath?: string | null;
}): Promise<PythonExecutionResult> {
  return invoke<PythonExecutionResult>("execute_python_code", {
    code: options.code,
    timeoutSecs: options.timeoutSecs ?? null,
    pythonPath: options.pythonPath?.trim() || null,
  });
}
