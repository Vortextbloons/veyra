/** Serializes all LM Studio HTTP work so only one request runs at a time. */
let chain: Promise<void> = Promise.resolve();

export function runLmStudioExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
