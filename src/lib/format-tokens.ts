/**
 * Compact token counts for tight UI: `100_000` reads as `100K`, `1_048_576` as `1M`.
 * Values under 1000 are shown exactly.
 */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens)) return "0";
  const sign = tokens < 0 ? "-" : "";
  const value = Math.abs(Math.round(tokens));
  // Anything that would round to 1000K or more reads as millions instead.
  if (value >= 999_500) return `${sign}${trimTrailingZero((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1000) {
    return `${sign}${trimTrailingZero((value / 1000).toFixed(value % 1000 ? 1 : 0))}K`;
  }
  return `${sign}${value}`;
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/, "");
}
