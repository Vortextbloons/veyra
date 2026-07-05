import { useState, useRef, useCallback } from "react";
import { Activity, Pause, Play, X } from "lucide-react";
import { useAiScheduler } from "@/hooks/use-ai-scheduler";
import { aiScheduler, JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot } from "@/lib/ai-scheduler";
import { useClickOutside } from "@/hooks/use-click-outside";
import { PriorityChip } from "@/components/scheduler/priority-chip";
import { JobRow, SectionHeader } from "@/components/scheduler/job-row";
import { formatElapsed } from "@/components/scheduler/job-row-helpers";
import { JobDetail } from "@/components/scheduler/job-detail";

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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const snapshot = useAiScheduler();

  useClickOutside(ref, open, () => {
    setOpen(false);
    setSelectedJobId(null);
  });

  const allJobs = [
    ...(snapshot.activeJob ? [snapshot.activeJob] : []),
    ...snapshot.queuedJobs,
    ...snapshot.recentJobs,
  ];
  const selectedJob = selectedJobId ? allJobs.find((j) => j.id === selectedJobId) ?? null : null;

  const queuedBackground = snapshot.queuedJobs.filter((j) => j.priority > 0);

  const handleSelectJob = useCallback((job: AiJobSnapshot) => {
    setSelectedJobId(job.id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedJobId(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSelectedJobId(null);
  }, []);

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
          className="absolute left-1/2 top-full z-50 mt-2 w-[320px] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-[var(--color-accent)]" />
              <span className="text-[12px] font-medium text-white">
                {selectedJob ? JOB_LABELS[selectedJob.type] ?? selectedJob.title : "Scheduler"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close scheduler"
              onClick={handleClose}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-3" />
            </button>
          </div>

          {selectedJob ? (
            <JobDetail job={selectedJob} onBack={handleBack} />
          ) : (
            <div className="max-h-[400px] overflow-y-auto p-3">
              {/* Now Running */}
              <div className="mb-3">
                <SectionHeader title="Now" />
                {snapshot.activeJob ? (
                  <button
                    type="button"
                    onClick={() => {
                      const active = snapshot.activeJob;
                      if (active) handleSelectJob(active);
                    }}
                    className="w-full rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] p-2 text-left transition-colors hover:bg-indigo-500/[0.1]"
                  >
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
                      <p className="mt-1 truncate text-[10px] text-[var(--color-text-dim)]">
                        {snapshot.activeJob.description}
                      </p>
                    )}
                  </button>
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
                      <JobRow
                        key={job.id}
                        job={job}
                        showCancel
                        onClick={() => handleSelectJob(job)}
                      />
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
                      <JobRow
                        key={job.id}
                        job={job}
                        onClick={() => handleSelectJob(job)}
                      />
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
          )}
        </div>
      )}
    </div>
  );
}
