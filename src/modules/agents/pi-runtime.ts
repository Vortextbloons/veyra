import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentMode, PiSession, PiRunResult } from "@/modules/agents/agent-types";

type StartPiAgentInput = {
  sessionId: string;
  mode: AgentMode;
  projectPath: string;
  prompt: string;
  model: string;
  contextLength?: number;
  reservedOutputTokens?: number;
  providerId?: string;
  reasoningEnabled?: boolean;
};

type PiRunFinishedEvent = {
  sessionId: string;
  result: PiRunResult;
};

type PiRunEvent = {
  sessionId: string;
  stream: "stdout" | "stderr";
  line: string;
  sequence: number;
};

export type RunPiAgentOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_AGENT_EVENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export async function checkPiAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_pi_available");
  } catch {
    return false;
  }
}

export async function listPiSessions(projectPath: string): Promise<PiSession[]> {
  const raw = await invoke<string>("list_pi_sessions", { projectPath });
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as PiSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Validates that the session file exists. Does not switch an active Pi process. */
export async function switchPiSession(sessionPath: string): Promise<void> {
  await invoke<void>("switch_pi_session", { sessionPath });
}

export async function deletePiSession(sessionPath: string): Promise<void> {
  await invoke<void>("delete_pi_session", { sessionPath });
}

export async function stopPiAgent(sessionId: string): Promise<void> {
  await invoke<void>("stop_pi_agent", { sessionId });
}

export async function runPiAgent(
  input: StartPiAgentInput,
  onEvent?: (event: PiRunEvent) => void,
  options?: RunPiAgentOptions,
): Promise<PiRunResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AGENT_EVENT_TIMEOUT_MS;
  const signal = options?.signal;

  let settled = false;
  let cleanedUp = false;
  let resolveResult: (result: PiRunResult) => void = () => {};
  let rejectResult: (error: Error) => void = () => {};
  const eventPromise = new Promise<PiRunResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (result: PiRunResult) => {
    if (settled) return;
    settled = true;
    resolveResult(result);
  };

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    rejectResult(error);
  };

  const timeoutTimer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined };
  let unlisten: () => void = () => {};
  let unlistenEvent: () => void = () => {};

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeoutTimer.id !== undefined) clearTimeout(timeoutTimer.id);
    unlisten();
    unlistenEvent();
    signal?.removeEventListener("abort", onAbort);
  };

  const onAbort = () => {
    cleanup();
    void stopPiAgent(input.sessionId).catch(() => undefined);
    finish({
      stdout: "",
      stderr: "Agent run aborted",
      exitCode: 1,
    });
  };

  unlisten = await listen<PiRunFinishedEvent>("agent://run-finished", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    cleanup();
    finish(event.payload.result);
  });
  unlistenEvent = await listen<PiRunEvent>("agent://run-event", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    onEvent?.(event.payload);
  });

  signal?.addEventListener("abort", onAbort, { once: true });

  timeoutTimer.id = setTimeout(() => {
    cleanup();
    void stopPiAgent(input.sessionId).catch(() => undefined);
    fail(new Error(`Agent run timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    await invoke<void>("run_pi_agent", { input });
  } catch (error) {
    cleanup();
    throw error;
  }

  try {
    return await eventPromise;
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    cleanup();
  }
}
