/** Dev-only startup timing helpers. */
export function markStartup(name: string): void {
  if (import.meta.env.DEV) {
    performance.mark(name);
  }
}

export function logStartupDuration(startMark: string, endMark: string, label: string): void {
  if (!import.meta.env.DEV) return;
  try {
    performance.measure(`veyra:${label}`, startMark, endMark);
    const entry = performance.getEntriesByName(`veyra:${label}`).at(-1);
    if (entry) {
      console.info(`[veyra startup] ${label}: ${Math.round(entry.duration)}ms`);
    }
  } catch {
    // measure may fail if marks are missing
  }
}

export function deferUntilIdle(callback: () => void, timeout = 2000): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}

export async function emitAppReady(): Promise<void> {
  markStartup("veyra:app-ready");
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("app_ready");
  } catch {
    // not running under Tauri (e.g. vite preview)
  }
}
