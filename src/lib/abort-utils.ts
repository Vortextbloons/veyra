const DEFAULT_FETCH_TIMEOUT_MS = 5 * 60 * 1000;

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/** Combine an optional caller signal with a timeout abort signal. */
export function withFetchTimeout(
  signal: AbortSignal | undefined,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const merged = signal
    ? mergeAbortSignals([signal, controller.signal])
    : controller.signal;

  return {
    signal: merged,
    cleanup: () => {
      clearTimeout(timer);
    },
  };
}
