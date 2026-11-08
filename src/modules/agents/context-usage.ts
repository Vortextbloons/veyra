/** Pi usage separates uncached input from cached input. All occupy context. */
export function contextTokensFromUsage(usage: Record<string, unknown>): number {
  return ["input", "cacheRead", "cacheWrite", "output"].reduce((total, key) => {
    const value = usage[key];
    return total + (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}
