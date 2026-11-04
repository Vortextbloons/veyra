import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentReasoningLevel, PiRunResult } from "@/modules/agents/agent-types";
import type { ProviderToolDefinition } from "@/lib/providers/types";

type StartPiAgentInput = {
  sessionId: string;
  projectPath: string;
  prompt: string;
  model: string;
  contextLength?: number;
  reservedOutputTokens?: number;
  providerId?: string;
  providerBaseUrl?: string;
  reasoningEnabled?: boolean;
  reasoningLevel?: AgentReasoningLevel;
  images?: { data: string; mimeType: string }[];
  tools?: ProviderToolDefinition[];
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
  onUiRequest?: (request: Record<string, unknown>) => Promise<string | undefined>;
};

const DEFAULT_AGENT_EVENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export async function checkPiAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_pi_available");
  } catch {
    return false;
  }
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
  if (signal?.aborted) {
    return {
      stdout: "",
      stderr: "Agent run aborted",
      exitCode: 1,
    };
  }

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

  try {
    unlisten = await listen<PiRunFinishedEvent>("agent://run-finished", (event) => {
      if (event.payload.sessionId !== input.sessionId) return;
      cleanup();
      finish(event.payload.result);
    });
    unlistenEvent = await listen<PiRunEvent>("agent://run-event", (event) => {
      if (event.payload.sessionId !== input.sessionId) return;
      if (event.payload.stream === "stdout") {
        try {
          const request = JSON.parse(event.payload.line) as Record<string, unknown>;
          if (request.type === "extension_ui_request" && typeof request.id === "string" && ["input", "editor", "select", "confirm"].includes(String(request.method))) {
            void (async () => {
              let value: string | undefined;
              try { value = await options?.onUiRequest?.(request); } catch { value = undefined; }
              if (!settled && !signal?.aborted) await invoke("respond_pi_ui", { sessionId: input.sessionId, requestId: request.id, value: value ?? null });
            })().catch(() => undefined);
            return;
          }
        } catch { /* Normal streaming output is handled below. */ }
      }
      onEvent?.(event.payload);
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
    return eventPromise;
  }

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
