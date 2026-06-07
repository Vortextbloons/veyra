import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { aiScheduler } from "@/lib/ai-scheduler";
import { flushConversationSave, saveConversationSnapshot } from "@/lib/conversation-storage";
import { unloadAllProviderModels } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { clearAllDelayedMemoryTimers } from "@/lib/post-chat-jobs";
import { terminateDecryptWorker } from "@/lib/conversation-storage";
import { invokeStopSearxngContainer } from "@/modules/web-search/searxng-setup";
import { useChatStore } from "@/stores/chat-store";

const SHUTDOWN_STEP_TIMEOUT_MS = 6000;

export type ShutdownStepId =
  | "preparing"
  | "saving"
  | "unloading_models"
  | "stopping_search"
  | "done";

export type ShutdownStep = {
  id: ShutdownStepId;
  label: string;
};

export type ShutdownSnapshot = {
  active: boolean;
  step: ShutdownStepId;
  label: string;
  steps: ShutdownStep[];
};

const SHUTDOWN_STEPS: ShutdownStep[] = [
  { id: "preparing", label: "Stopping background work" },
  { id: "saving", label: "Saving conversations" },
  { id: "unloading_models", label: "Unloading models" },
  { id: "stopping_search", label: "Stopping web search" },
];

const STEP_LABELS: Record<ShutdownStepId, string> = {
  preparing: "Stopping background work…",
  saving: "Saving your conversations…",
  unloading_models: "Unloading models from memory…",
  stopping_search: "Stopping web search container…",
  done: "Goodbye!",
};

let shuttingDown = false;
let shutdownComplete = false;
let closeInProgress = false;
let snapshot: ShutdownSnapshot = {
  active: false,
  step: "preparing",
  label: "",
  steps: SHUTDOWN_STEPS,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setShutdownStep(step: ShutdownStepId): void {
  snapshot = {
    ...snapshot,
    step,
    label: STEP_LABELS[step],
  };
  notify();
}

function setShutdownActive(active: boolean): void {
  snapshot = {
    ...snapshot,
    active,
    step: active ? "preparing" : "done",
    label: active ? STEP_LABELS.preparing : "",
  };
  notify();
}

export function getShutdownSnapshot(): ShutdownSnapshot {
  return snapshot;
}

export function subscribeToShutdown(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function waitForShutdownUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function withTimeout(promise: Promise<void>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${SHUTDOWN_STEP_TIMEOUT_MS}ms`)),
          SHUTDOWN_STEP_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    console.warn("[veyra shutdown]", err instanceof Error ? err.message : err);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function persistConversations(): Promise<void> {
  const {
    conversations,
    streamingBuffer,
    activeConversationId,
    commitAssistantMessage,
  } = useChatStore.getState();

  if (
    streamingBuffer &&
    activeConversationId &&
    streamingBuffer.conversationId === activeConversationId
  ) {
    commitAssistantMessage(activeConversationId, streamingBuffer.messageId, {});
  }

  void saveConversationSnapshot(conversations);
  await flushConversationSave();
}

/** Release external resources started by Veyra (models, Docker, jobs). */
export async function runAppShutdown(): Promise<void> {
  if (shutdownComplete || shuttingDown) return;
  shuttingDown = true;

  setShutdownActive(true);
  await waitForShutdownUi();

  setShutdownStep("preparing");
  aiScheduler.shutdown();
  clearAllDelayedMemoryTimers();
  terminateDecryptWorker();

  setShutdownStep("saving");
  await withTimeout(persistConversations(), "Save conversations");

  setShutdownStep("unloading_models");
  await withTimeout(
    unloadAllProviderModels(useProviderStore.getState().selectedProvider),
    "Unload provider models",
  );

  setShutdownStep("stopping_search");
  await withTimeout(invokeStopSearxngContainer(), "Stop SearXNG container");

  setShutdownStep("done");
}

export function isAppShuttingDown(): boolean {
  return shuttingDown;
}

async function finishAppExit(): Promise<void> {
  shutdownComplete = true;
  const window = getCurrentWindow();

  try {
    // `close()` re-fires onCloseRequested; while shuttingDown the handler returns
    // early and the window never actually closes. `destroy()` skips that loop.
    await window.destroy();
  } catch (err) {
    console.warn("[veyra shutdown] window.destroy failed:", err);
  }

  try {
    await invoke("exit_app");
  } catch (err) {
    console.warn("[veyra shutdown] exit_app failed:", err);
  }
}

/** Intercept window close so cleanup can finish before the process exits. */
export async function registerAppShutdownHandler(): Promise<() => void> {
  if (!isTauri()) return () => undefined;

  const unlisten = await getCurrentWindow()
    .onCloseRequested(async (event) => {
      if (shutdownComplete) return;

      event.preventDefault();

      if (closeInProgress) return;
      closeInProgress = true;

      try {
        await runAppShutdown();
      } catch (err) {
        console.warn("[veyra shutdown] Cleanup failed:", err);
      }

      await finishAppExit();
    })
    .catch((err) => {
      console.warn("[veyra shutdown] Failed to register close handler:", err);
      return () => undefined;
    });

  return () => {
    unlisten();
  };
}
