import { useMemo } from "react";
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Loader2,
} from "lucide-react";
import type { ResearchRun, ResearchDepth } from "../research-types";

const DEPTH_LABELS: Record<ResearchDepth, string> = {
  quick: "Quick",
  standard: "Standard",
  deep: "Deep",
  exhaustive: "Exhaustive",
};

const DEPTH_BADGE_CLASSES: Record<ResearchDepth, string> = {
  quick: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  standard: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  deep: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  exhaustive: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  planning: {
    label: "Planning",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  searching: {
    label: "Searching",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  reading: {
    label: "Reading",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  extracting: {
    label: "Extracting",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  verifying: {
    label: "Verifying",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  synthesizing: {
    label: "Writing",
    icon: <Loader2 className="size-3 animate-spin" />,
    color: "text-amber-300",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="size-3" />,
    color: "text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: <AlertCircle className="size-3" />,
    color: "text-red-300",
  },
  paused: {
    label: "Paused",
    icon: <PauseCircle className="size-3" />,
    color: "text-[var(--color-text-dim)]",
  },
};

type Props = {
  run: ResearchRun;
  isActive?: boolean;
  onClick?: () => void;
};

export function ResearchRunCard({ run, isActive, onClick }: Props) {
  const status = STATUS_CONFIG[run.status] ?? {
    label: run.status,
    icon: <FlaskConical className="size-3" />,
    color: "text-[var(--color-text-dim)]",
  };

  const dateStr = useMemo(() => {
    const d = new Date(run.createdAt);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [run.createdAt]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-all ${
        isActive
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-white/15 hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-[var(--color-text)]">
          {run.clarifiedQuestion || run.question}
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${
            DEPTH_BADGE_CLASSES[run.depth]
          }`}
        >
          {DEPTH_LABELS[run.depth]}
        </span>
        <span
          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${status.color} border-white/10 bg-white/[0.03]`}
        >
          {status.icon}
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
        <Clock className="size-3" />
        <span>{dateStr}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              run.status === "failed"
                ? "bg-red-500/60"
                : run.status === "completed"
                  ? "bg-emerald-500/60"
                  : "bg-amber-500/60"
            }`}
            style={{ width: `${run.progressPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
          {run.progressPercent}%
        </span>
      </div>
    </button>
  );
}
