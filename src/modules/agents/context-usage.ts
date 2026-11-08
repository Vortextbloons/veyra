export type ContextTokenUsage = { input: number; output: number };

/** Pi reports cached input separately; it still occupies input context. */
export function splitContextUsage(usage: Record<string, unknown>): ContextTokenUsage {
  const count = (key: string): number => {
    const value = usage[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  };
  return { input: count("input") + count("cacheRead") + count("cacheWrite"), output: count("output") };
}

export function contextTokensFromUsage(usage: Record<string, unknown>): number {
  const { input, output } = splitContextUsage(usage);
  return input + output;
}
