import { useState, useCallback, type ReactNode } from "react";
import { ChevronLeft, Copy, Check } from "lucide-react";
import { JOB_LABELS } from "@/lib/ai-scheduler";
import type { AiJobSnapshot } from "@/lib/ai-scheduler";
import { PriorityChip } from "@/components/scheduler/priority-chip";
import {
  formatElapsed,
  formatDurationMs,
  statusIcon,
  statusColor,
  statusBorderColor,
  jobTypeIcon,
} from "@/components/scheduler/job-row";

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

export function JobDetail({ job, onBack }: { job: AiJobSnapshot; onBack: () => void }) {
  const duration =
    job.startedAt && job.finishedAt
      ? formatDurationMs(job.finishedAt - job.startedAt)
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
