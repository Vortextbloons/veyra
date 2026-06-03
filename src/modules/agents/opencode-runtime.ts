import { invoke } from "@tauri-apps/api/core";
import type { AgentMode, OpencodeRunResult } from "@/modules/agents/agent-types";

type StartOpencodeAgentInput = {
  sessionId: string;
  mode: AgentMode;
  projectPath: string;
  prompt: string;
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
  return await invoke<OpencodeRunResult>("run_opencode_agent", { input });
}
