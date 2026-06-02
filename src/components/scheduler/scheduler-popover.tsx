import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Activity,
  Pause,
  Play,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useAiScheduler } from "@/hooks/use-ai-scheduler";
import { aiScheduler, JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot, AiJobStatus } from "@/lib/ai-scheduler";

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function statusIcon(status: AiJobStatus): ReactNode {
  switch (status) {
    case "running":
      return <Loader2 className="size-3 animate-spin text-indigo-400" />;
    case "completed":
      return <CheckCircle2 className="size-3 text-emerald-400" />;
    case "failed":
      return <XCircle className="size-3 text-red-400" />;
    case "cancelled":
    case "aborted":
      return <AlertCircle className="size-3 text-amber-400" />;
    case "queued":
      return <Clock className="size-3 text-[var(--color-text-dim)]" />;
  }
}

function PriorityChip({ priority }: { priority: number }) {
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

function JobRow({
  job,
  showCancel = false,
}: {
  job: AiJobSnapshot;
  showCancel?: boolean;
}) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (job.status !== "running" || !job.startedAt) return;
    const update = () => setElapsed(formatElapsed(job.startedAt!));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [job.status, job.startedAt]);

  return (
    <div className="group/job flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
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
          <button
            type="button"
            aria-label={`Cancel ${job.title}`}
            onClick={() => aiScheduler.cancelAiJob(job.id)}
            className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-red-400 group-hover/job:opacity-100"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
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

function SchedulerStatusDot() {
  const snapshot = useAiScheduler();

  let color: string;
  if (snapshot.pausedBackground) {
    color = "bg-gray-400";
  } else if (snapshot.isUserJobRunning) {
    color = "bg-indigo-400";
  } else if (snapshot.activeJob) {
    color = "bg-amber-400";
  } else {
    color = "bg-emerald-400";
  }

  return <span className={`size-1.5 rounded-full ${color}`} />;
}

export function SchedulerPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const snapshot = useAiScheduler();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const queuedBackground = snapshot.queuedJobs.filter((j) => j.priority > 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Scheduler"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`grid size-6 place-items-center rounded transition-colors ${
          open
            ? "bg-white/[0.08] text-white"
            : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        <div className="relative">
          <Activity className="size-3.5" />
          <span className="absolute -right-0.5 -top-0.5">
            <SchedulerStatusDot />
          </span>
        </div>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Scheduler panel"
          className="absolute left-1/2 top-full z-50 mt-2 w-[300px] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/50"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-[var(--color-accent)]" />
              <span className="text-[12px] font-medium text-white">
                Scheduler
              </span>
            </div>
            <button
              type="button"
              aria-label="Close scheduler"
              onClick={() => setOpen(false)}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-3" />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-3">
            {/* Now Running */}
            <div className="mb-3">
              <SectionHeader title="Now" />
              {snapshot.activeJob ? (
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] p-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-indigo-400" />
                    </span>
                    <span className="text-[11.5px] font-medium text-white">
                      {JOB_LABELS[snapshot.activeJob.type] ?? snapshot.activeJob.title}
                    </span>
                    <PriorityChip priority={snapshot.activeJob.priority} />
                    {snapshot.activeJob.startedAt && (
                      <span className="ml-auto font-mono text-[10px] text-indigo-300">
                        {formatElapsed(snapshot.activeJob.startedAt)}
                      </span>
                    )}
                  </div>
                  {snapshot.activeJob.description && (
                    <p className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                      {snapshot.activeJob.description}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-center text-[11px] text-[var(--color-text-dim)]">
                  Idle
                </div>
              )}
            </div>

            {/* Queue */}
            {queuedBackground.length > 0 && (
              <div className="mb-3">
                <SectionHeader title="Next" count={queuedBackground.length} />
                <div className="space-y-0.5">
                  {queuedBackground.map((job) => (
                    <JobRow key={job.id} job={job} showCancel />
                  ))}
                </div>
              </div>
            )}

            {/* Recent */}
            {snapshot.recentJobs.length > 0 && (
              <div className="mb-3">
                <SectionHeader title="History" />
                <div className="max-h-32 space-y-0.5 overflow-y-auto">
                  {snapshot.recentJobs.slice(0, 6).map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-1.5 border-t border-[var(--color-border)] pt-3">
              {snapshot.pausedBackground ? (
                <button
                  type="button"
                  onClick={() => aiScheduler.resumeBackgroundJobs()}
                  className="flex h-7 items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20 transition-colors hover:bg-emerald-500/15"
                >
                  <Play className="size-3" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => aiScheduler.pauseBackgroundJobs()}
                  className="flex h-7 items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20 transition-colors hover:bg-amber-500/15"
                >
                  <Pause className="size-3" />
                  Pause
                </button>
              )}
              {snapshot.queuedBackgroundJobs > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    for (const job of snapshot.queuedJobs) {
                      if (job.priority > 0) aiScheduler.cancelAiJob(job.id);
                    }
                  }}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.04] hover:text-red-400"
                >
                  <X className="size-3" />
                  Clear queue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
