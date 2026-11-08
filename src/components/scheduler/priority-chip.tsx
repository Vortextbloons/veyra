export function PriorityChip({ priority }: { priority: number }) {
  const colors =
    priority === 0
      ? "bg-accent-tint text-accent ring-accent-line-soft"
      : priority <= 2
        ? "bg-accent-tint text-accent ring-accent-line-soft"
        : "bg-white/[0.04] text-[var(--color-muted)] ring-white/[0.06]";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide ring-1 ring-inset ${colors}`}
    >
      P{priority}
    </span>
  );
}
