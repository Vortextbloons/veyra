import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { aiScheduler, JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot } from "@/lib/ai-scheduler";
import { PriorityChip } from "@/components/scheduler/priority-chip";
import { formatElapsed, statusIcon } from "@/components/scheduler/job-row-helpers";

export function JobRow({
  job,
  showCancel = false,
  onClick,
}: {
  job: AiJobSnapshot;
  showCancel?: boolean;
  onClick?: () => void;
}) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (job.status !== "running" || !job.startedAt) return;
    const startedAt = job.startedAt;
    const update = () => {
      if (startedAt) setElapsed(formatElapsed(startedAt));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [job.status, job.startedAt]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group/job flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
    >
      <span className="shrink-0">{statusIcon(job.status)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-medium text-[var(--color-text)]">
            {JOB_LABELS[job.type] ?? job.title}
          </span>
          <PriorityChip priority={job.priority} />
        </div>
        {job.description && (
          <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-dim)]">
            {job.description}
          </p>
        )}
        {job.error && (
          <p className="mt-0.5 truncate text-[10px] text-red-300">
            {job.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {job.status === "running" && job.startedAt && (
          <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
            {elapsed}
          </span>
        )}
        {job.model && (
          <span className="max-w-[60px] truncate text-[9.5px] text-[var(--color-text-dim)]">
            {job.model}
          </span>
        )}
        {showCancel && job.status === "queued" && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Cancel ${job.title}`}
            onClick={(e) => {
              e.stopPropagation();
              aiScheduler.cancelAiJob(job.id);
            }}
            className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-red-400 group-hover/job:opacity-100"
          >
            <X className="size-3" />
          </span>
        )}
      </div>
    </button>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {title}
      </h4>
      {count !== undefined && count > 0 && (
        <span className="inline-flex items-center rounded-full bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-accent)]">
          {count}
        </span>
      )}
    </div>
  );
}
