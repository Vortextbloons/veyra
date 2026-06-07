export function PriorityChip({ priority }: { priority: number }) {
  const colors =
    priority === 0
      ? "bg-indigo-500/15 text-indigo-300 ring-indigo-500/25"
      : priority <= 2
        ? "bg-violet-500/10 text-violet-300 ring-violet-500/20"
        : "bg-white/[0.04] text-[var(--color-text-dim)] ring-white/[0.06]";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide ring-1 ring-inset ${colors}`}
    >
      P{priority}
    </span>
  );
}
