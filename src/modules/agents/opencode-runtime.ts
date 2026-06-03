import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentMode, OpencodeRunResult } from "@/modules/agents/agent-types";

type StartOpencodeAgentInput = {
  sessionId: string;
  mode: AgentMode;
  projectPath: string;
  prompt: string;
  model: string;
  providerId?: string;
  opencodeSessionId?: string;
};

type OpencodeRunFinishedEvent = {
  sessionId: string;
  result: OpencodeRunResult;
};

export async function checkOpencodeAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_opencode_available");
  } catch {
    return false;
  }
}

export async function runOpencodeAgent(
  input: StartOpencodeAgentInput,
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

  try {
    await invoke<void>("run_opencode_agent", { input });
  } catch (error) {
    unlisten();
    throw error;
  }
  return await eventPromise;
}
