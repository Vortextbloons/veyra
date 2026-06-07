/** Serializes all LM Studio HTTP work so only one request runs at a time. */
let chain: Promise<void> = Promise.resolve();

const DEFAULT_LM_STUDIO_TASK_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`LM Studio request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function runLmStudioExclusive<T>(
  task: () => Promise<T>,
  timeoutMs = DEFAULT_LM_STUDIO_TASK_TIMEOUT_MS,
): Promise<T> {
  const run = chain.then(
    () => withTimeout(task(), timeoutMs),
    () => withTimeout(task(), timeoutMs),
  );
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
