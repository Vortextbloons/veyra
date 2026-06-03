import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
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
  ChevronLeft,
  Copy,
  Check,
  MessageSquare,
  Wrench,
  Brain,
  FileText,
  Zap,
  Bot,
} from "lucide-react";
import { useAiScheduler } from "@/hooks/use-ai-scheduler";
import { aiScheduler, JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot, AiJobStatus, AiJobType } from "@/lib/ai-scheduler";
import { useClickOutside } from "@/hooks/use-click-outside";

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
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

function statusColor(status: AiJobStatus): string {
  switch (status) {
    case "running":
      return "text-indigo-400 bg-indigo-500/15 ring-indigo-500/25";
    case "completed":
      return "text-emerald-400 bg-emerald-500/15 ring-emerald-500/25";
    case "failed":
      return "text-red-400 bg-red-500/15 ring-red-500/25";
    case "cancelled":
    case "aborted":
      return "text-amber-400 bg-amber-500/15 ring-amber-500/25";
    case "queued":
      return "text-[var(--color-text-dim)] bg-white/[0.04] ring-white/[0.06]";
  }
}

function statusBorderColor(status: AiJobStatus): string {
  switch (status) {
    case "running":
      return "border-indigo-500/30";
    case "completed":
      return "border-emerald-500/30";
    case "failed":
      return "border-red-500/30";
    case "cancelled":
    case "aborted":
      return "border-amber-500/30";
    case "queued":
      return "border-[var(--color-border)]";
  }
}

function jobTypeIcon(type: AiJobType): ReactNode {
  switch (type) {
    case "user_chat":
      return <MessageSquare className="size-3.5" />;
    case "agent_opencode":
      return <Bot className="size-3.5" />;
    case "auto_name_chat":
    case "summarize_chat":
      return <FileText className="size-3.5" />;
    case "extract_memory":
      return <Brain className="size-3.5" />;
    case "compress_context":
      return <Zap className="size-3.5" />;
    case "maintenance":
      return <Wrench className="size-3.5" />;
    default:
      return <Bot className="size-3.5" />;
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
      title="Copy to clipboard"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

function JobRow({
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
    const update = () => setElapsed(formatElapsed(job.startedAt!));
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

function DetailSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {title}
        </span>
        <ChevronLeft
          className={`size-3 text-[var(--color-text-dim)] transition-transform ${open ? "-rotate-90" : "rotate-0"}`}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-[10.5px] text-[var(--color-text-dim)]">{label}</span>
      <span className="truncate font-mono text-[10.5px] text-[var(--color-text)]">{value}</span>
    </div>
  );
}

function JobDetail({ job, onBack }: { job: AiJobSnapshot; onBack: () => void }) {
  const duration =
    job.startedAt && job.finishedAt
      ? formatDuration(job.finishedAt - job.startedAt)
      : job.startedAt && job.status === "running"
        ? formatElapsed(job.startedAt)
        : null;

  return (
    <div className="flex flex-col" style={{ animation: "slideIn 180ms ease-out" }}>
      {/* Detail Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="grid size-6 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-[var(--color-text-dim)]">{jobTypeIcon(job.type)}</span>
          <span className="truncate text-[12px] font-medium text-white">
            {JOB_LABELS[job.type] ?? job.title}
          </span>
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {/* Status Banner */}
        <div className={`mx-3 mt-3 rounded-lg border ${statusBorderColor(job.status)} bg-white/[0.02] p-3`}>
          <div className="flex items-center gap-2">
            {statusIcon(job.status)}
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusColor(job.status)}`}
            >
              {job.status}
            </span>
            <PriorityChip priority={job.priority} />
            {duration && (
              <span className="ml-auto font-mono text-[10.5px] text-[var(--color-text-dim)]">
                {duration}
              </span>
            )}
          </div>
          {job.error && (
            <div className="mt-2.5 rounded-md border border-red-500/20 bg-red-500/[0.06] p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                  Error
                </span>
                <CopyButton text={job.error} />
              </div>
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-relaxed text-red-300">
                {job.error}
              </pre>
            </div>
          )}
        </div>

        {/* Details Grid */}
        <DetailSection title="Details">
          <div className="space-y-1">
            <MetaRow label="Job ID" value={job.id.slice(0, 12) + "..."} />
            <MetaRow label="Type" value={job.type} />
            <MetaRow label="Title" value={job.title} />
            {job.model && <MetaRow label="Model" value={job.model} />}
            {job.conversationId && (
              <MetaRow label="Conversation" value={job.conversationId.slice(0, 12) + "..."} />
            )}
          </div>
        </DetailSection>

        {/* Timestamps */}
        <DetailSection title="Timing">
          <div className="space-y-1">
            <MetaRow label="Created" value={new Date(job.createdAt).toLocaleString()} />
            {job.startedAt && (
              <MetaRow label="Started" value={new Date(job.startedAt).toLocaleString()} />
            )}
            {job.finishedAt && (
              <MetaRow label="Finished" value={new Date(job.finishedAt).toLocaleString()} />
            )}
            {duration && <MetaRow label="Duration" value={duration} />}
          </div>
        </DetailSection>

        {/* Description */}
        {job.description && (
          <DetailSection title="Description">
            <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--color-text)]">
              {job.description}
            </p>
          </DetailSection>
        )}

        {/* Prompt */}
        {job.prompt && (
          <DetailSection title="Prompt" defaultOpen={false}>
            <div className="relative rounded-md border border-[var(--color-border)] bg-white/[0.02] p-2.5">
              <div className="absolute right-2 top-2">
                <CopyButton text={job.prompt} />
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-[var(--color-text)]">
                {job.prompt}
              </pre>
            </div>
          </DetailSection>
        )}

        {/* Output */}
        {job.output && (
          <DetailSection title="Output" defaultOpen={false}>
            <div className="relative rounded-md border border-[var(--color-border)] bg-white/[0.02] p-2.5">
              <div className="absolute right-2 top-2">
                <CopyButton text={job.output} />
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-[var(--color-text)]">
                {job.output}
              </pre>
            </div>
          </DetailSection>
        )}

        {/* Spacer */}
        <div className="h-3" />
      </div>
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
          className="absolute left-1/2 top-full z-50 mt-2 w-[320px] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/50"
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
                    onClick={() => handleSelectJob(snapshot.activeJob!)}
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
