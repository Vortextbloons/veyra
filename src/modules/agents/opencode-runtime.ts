import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentMode, OpencodeProjectSession, OpencodeRunResult } from "@/modules/agents/agent-types";

type StartOpencodeAgentInput = {
  sessionId: string;
  mode: AgentMode;
  projectPath: string;
  prompt: string;
  model: string;
  contextLength?: number;
  reservedOutputTokens?: number;
  providerId?: string;
  opencodeSessionId?: string;
};

type OpencodeRunFinishedEvent = {
  sessionId: string;
  result: OpencodeRunResult;
};

type OpencodeRunEvent = {
  sessionId: string;
  stream: "stdout" | "stderr";
  line: string;
};

export async function checkOpencodeAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_opencode_available");
  } catch {
    return false;
  }
}

export async function listOpencodeProjectSessions(
  projectPath: string,
): Promise<OpencodeProjectSession[]> {
  const raw = await invoke<string>("list_opencode_project_sessions", { projectPath });
  const parsed = JSON.parse(raw) as OpencodeProjectSession[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function exportOpencodeSession(
  projectPath: string,
  sessionId: string,
): Promise<unknown> {
  const raw = await invoke<string>("export_opencode_session", { projectPath, sessionId });
  return JSON.parse(raw) as unknown;
}

export async function deleteOpencodeSession(
  projectPath: string,
  sessionId: string,
): Promise<void> {
  await invoke<void>("delete_opencode_session", { projectPath, sessionId });
}

export async function runOpencodeAgent(
  input: StartOpencodeAgentInput,
  onEvent?: (event: OpencodeRunEvent) => void,
): Promise<OpencodeRunResult> {
  let resolveResult: (result: OpencodeRunResult) => void = () => undefined;
  const eventPromise = new Promise<OpencodeRunResult>((resolve) => {
    resolveResult = resolve;
  });
  const unlisten = await listen<OpencodeRunFinishedEvent>("agent://run-finished", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    unlisten();
    resolveResult(event.payload.result);
  });
  const unlistenEvent = await listen<OpencodeRunEvent>("agent://run-event", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    onEvent?.(event.payload);
  });

  try {
    await invoke<void>("run_opencode_agent", { input });
  } catch (error) {
    unlisten();
    unlistenEvent();
    throw error;
  }
  const result = await eventPromise;
  unlistenEvent();
  return result;
}
