// Human-friendly elapsed-time formatter for research timers.
// - < 1s   → "0s"
// - < 60s  → "42s"
// - < 1h   → "2m 34s"
// - >= 1h  → "1h 12m" (drops seconds when hours are present)
export function formatElapsedTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return "0s";
  const s = Math.floor(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
}
