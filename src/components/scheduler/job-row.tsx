/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, type ReactNode } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  MessageSquare,
  Wrench,
  Brain,
  FileText,
  Zap,
  Bot,
} from "lucide-react";
import { aiScheduler, JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot, AiJobStatus, AiJobType } from "@/lib/ai-scheduler";
import { PriorityChip } from "@/components/scheduler/priority-chip";

export function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function statusIcon(status: AiJobStatus): ReactNode {
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

export function statusColor(status: AiJobStatus): string {
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

export function statusBorderColor(status: AiJobStatus): string {
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

export function jobTypeIcon(type: AiJobType): ReactNode {
  switch (type) {
    case "user_chat":
      return <MessageSquare className="size-3.5" />;
    case "agent_pi":
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
