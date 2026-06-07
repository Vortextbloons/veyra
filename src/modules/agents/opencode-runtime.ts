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

export type RunOpencodeAgentOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_AGENT_EVENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

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
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as OpencodeProjectSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function exportOpencodeSession(
  projectPath: string,
  sessionId: string,
): Promise<unknown> {
  const raw = await invoke<string>("export_opencode_session", { projectPath, sessionId });
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function deleteOpencodeSession(
  projectPath: string,
  sessionId: string,
): Promise<void> {
  await invoke<void>("delete_opencode_session", { projectPath, sessionId });
}

export async function stopOpencodeAgent(sessionId: string): Promise<void> {
  await invoke<void>("stop_opencode_agent", { sessionId });
}

export async function runOpencodeAgent(
  input: StartOpencodeAgentInput,
  onEvent?: (event: OpencodeRunEvent) => void,
  options?: RunOpencodeAgentOptions,
): Promise<OpencodeRunResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AGENT_EVENT_TIMEOUT_MS;
  const signal = options?.signal;

  let settled = false;
  let cleanedUp = false;
  let resolveResult: (result: OpencodeRunResult) => void = () => {};
  let rejectResult: (error: Error) => void = () => {};
  const eventPromise = new Promise<OpencodeRunResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (result: OpencodeRunResult) => {
    if (settled) return;
    settled = true;
    resolveResult(result);
  };

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    rejectResult(error);
  };

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let unlisten: () => void = () => {};
  let unlistenEvent: () => void = () => {};

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
    unlisten();
    unlistenEvent();
    signal?.removeEventListener("abort", onAbort);
  };

  const onAbort = () => {
    cleanup();
    void stopOpencodeAgent(input.sessionId).catch(() => undefined);
    finish({
      stdout: "",
      stderr: "Agent run aborted",
      exitCode: 1,
    });
  };

  unlisten = await listen<OpencodeRunFinishedEvent>("agent://run-finished", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    cleanup();
    finish(event.payload.result);
  });
  unlistenEvent = await listen<OpencodeRunEvent>("agent://run-event", (event) => {
    if (event.payload.sessionId !== input.sessionId) return;
    onEvent?.(event.payload);
  });

  signal?.addEventListener("abort", onAbort, { once: true });

  timeoutTimer = setTimeout(() => {
    cleanup();
    void stopOpencodeAgent(input.sessionId).catch(() => undefined);
    fail(new Error(`Agent run timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    await invoke<void>("run_opencode_agent", { input });
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
