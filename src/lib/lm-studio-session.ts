/** Serializes all LM Studio HTTP work so only one request runs at a time. */
let chain: Promise<void> = Promise.resolve();

const DEFAULT_LM_STUDIO_TASK_TIMEOUT_MS = 300_000;

let backgroundSlots = 1;
let backgroundActive = 0;
const backgroundWaiters: Array<() => void> = [];

export function configureLmStudioBackgroundConcurrency(slots: number): void {
  backgroundSlots = Math.max(1, Math.min(4, slots));
}

async function acquireBackgroundSlot(): Promise<void> {
  if (backgroundActive < backgroundSlots) {
    backgroundActive++;
    return;
  }
  await new Promise<void>((resolve) => {
    backgroundWaiters.push(resolve);
  });
  backgroundActive++;
}

function releaseBackgroundSlot(): void {
  backgroundActive = Math.max(0, backgroundActive - 1);
  const next = backgroundWaiters.shift();
  if (next) next();
}

export function runLmStudioBackground<T>(
  task: () => Promise<T>,
  timeoutMs = DEFAULT_LM_STUDIO_TASK_TIMEOUT_MS,
): Promise<T> {
  const run = async () => {
    await acquireBackgroundSlot();
    try {
      return await withTimeout(task(), timeoutMs);
    } finally {
      releaseBackgroundSlot();
    }
  };
  return run();
}

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
