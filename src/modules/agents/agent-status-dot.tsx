import type { AgentSession } from "@/modules/agents/agent-types";

export function StatusDot({
  status,
  className = "",
}: {
  status: AgentSession["status"];
  className?: string;
}) {
  if (status === "running") {
    return (
      <span
        className={`inline-block size-2 animate-pulse rounded-full bg-indigo-400 ${className}`}
      />
    );
  }
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "ready"
        ? "bg-cyan-400"
        : status === "failed"
          ? "bg-red-400"
          : status === "stopped"
            ? "bg-amber-400"
            : "bg-[var(--color-text-dim)]/50";
  return <span className={`inline-block size-2 rounded-full ${color} ${className}`} />;
}
