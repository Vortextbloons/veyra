import {
  Bot,
  Play,
  Square,
  ScanSearch,
  Loader2,
  Settings2,
  XCircle,
  Mail,
  MailOpen,
  CheckCircle2,
  Clock3,
  ListTodo,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Activity,
} from "lucide-react";
import { getTaskTypeIcon, getTaskTypeLabel } from "./ai-output-helpers";
import { taskCoveragePct, useEmailAiDashboard } from "../hooks/use-email-ai-dashboard";
import type { EmailAiJob, EmailAiTaskCoverage, EmailThread } from "../email-types";

const TASK_ACCENT: Record<string, string> = {
  thread_summary: "from-violet-500/20 to-indigo-500/10 border-violet-500/25 text-violet-300",
  classification: "from-emerald-500/20 to-teal-500/10 border-emerald-500/25 text-emerald-300",
  spam_score: "from-amber-500/20 to-orange-500/10 border-amber-500/25 text-amber-300",
  urgency_score: "from-rose-500/20 to-red-500/10 border-rose-500/25 text-rose-300",
};

function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/70 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            {label}
          </div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white">
            {value}
          </div>
          {hint && (
            <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]/80">{hint}</div>
          )}
        </div>
        <div
          className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${accent ?? "from-white/10 to-white/5 text-[var(--color-text-dim)]"}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function TaskCoverageCard({
  task,
  isActivelyProcessing = false,
}: {
  task: EmailAiTaskCoverage;
  isActivelyProcessing?: boolean;
}) {
  const pct = taskCoveragePct(task);
  const accent =
    TASK_ACCENT[task.taskType] ??
    "from-white/10 to-white/5 border-white/10 text-[var(--color-text-dim)]";
  const staleRunning = Math.max(0, task.running - (isActivelyProcessing ? 1 : 0));
  const displayQueued = task.queued + staleRunning;

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {getTaskTypeIcon(task.taskType)}
            <span className="text-[11px] font-medium text-white">{task.label}</span>
          </div>
          <div className="mt-3 text-[28px] font-semibold tabular-nums leading-none text-white">
            {pct}%
          </div>
          <div className="mt-1 text-[10px] text-white/60">
            {task.covered} of {task.covered + task.pending + task.queued + task.running || "—"}{" "}
            threads
          </div>
        </div>
        <div className="relative grid size-14 shrink-0 place-items-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-black/20"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${(pct / 100) * 150.8} 150.8`}
              strokeLinecap="round"
              className="text-white/80"
            />
          </svg>
          <span className="text-[10px] font-medium tabular-nums text-white/80">{pct}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9.5px] text-white/55">
        {task.pending > 0 && <span>{task.pending} pending</span>}
        {displayQueued > 0 && <span>{displayQueued} queued</span>}
        {isActivelyProcessing && task.running > 0 && (
          <span className="text-sky-200">1 processing</span>
        )}
        {task.failed > 0 && <span className="text-red-200">{task.failed} failed</span>}
      </div>
    </div>
  );
}

function JobRow({
  job,
  isActivelyProcessing,
}: {
  job: EmailAiJob;
  isActivelyProcessing: boolean;
}) {
  const showProcessing = job.status === "running" && isActivelyProcessing;
  const label = showProcessing ? "processing" : job.status === "running" ? "queued" : job.status;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)]/60 bg-black/20 px-3 py-2.5">
      <div className="grid size-7 place-items-center rounded-md bg-white/[0.04]">
        {getTaskTypeIcon(job.taskType)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {getTaskTypeLabel(job.taskType)}
        </div>
        <div className="truncate text-[10px] text-[var(--color-text-dim)]">
          {job.threadId ? `Thread ${job.threadId.slice(0, 8)}…` : "Background job"}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
          showProcessing
            ? "bg-sky-500/15 text-sky-300"
            : job.status === "failed"
              ? "bg-red-500/15 text-red-300"
              : "bg-white/[0.06] text-[var(--color-text-dim)]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function RecentThreadRow({
  thread,
  onSelect,
}: {
  thread: EmailThread;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-panel)]/50 px-3 py-2.5 text-left transition-colors hover:border-[var(--color-border)] hover:bg-white/[0.03]"
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[11px] font-semibold text-white">
        {thread.participants[0]?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {thread.subject}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--color-text-dim)]">
          {thread.aiMetadata?.summary || thread.messages.at(-1)?.snippet || "No preview"}
        </div>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-[var(--color-text-dim)]/50" />
    </button>
  );
}

function DashboardActions({
  accountId,
  workerRunning,
  aiScanLoading,
  activeJobCount,
  onStart,
  onStop,
  onScan,
  onCancel,
}: {
  accountId: string;
  workerRunning: boolean;
  aiScanLoading: boolean;
  activeJobCount: number;
  onStart: () => void;
  onStop: () => void;
  onScan: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!workerRunning ? (
        <button
          type="button"
          onClick={onStart}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-[11px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.35)] hover:brightness-110"
        >
          <Play className="size-3.5" />
          Start worker
        </button>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white/[0.04] px-3 text-[11px] font-medium text-[var(--color-text)] hover:bg-white/[0.07]"
        >
          <Square className="size-3.5" />
          Stop worker
        </button>
      )}
      <button
        type="button"
        onClick={() => onScan(accountId)}
        disabled={aiScanLoading || !workerRunning}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white/[0.04] px-3 text-[11px] font-medium text-[var(--color-text)] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {aiScanLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ScanSearch className="size-3.5" />
        )}
        Scan inbox
      </button>
      {activeJobCount > 0 && (
        <button
          type="button"
          onClick={() => onCancel(accountId)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-[11px] font-medium text-red-300 hover:bg-red-500/15"
        >
          <XCircle className="size-3.5" />
          Clear queue ({activeJobCount})
        </button>
      )}
    </div>
  );
}

export function EmailDashboard({ accountId }: { accountId: string }) {
  const dash = useEmailAiDashboard(accountId);

  if (!dash.emailAiEnabled) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--color-bg)] p-8">
        <div className="max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/80 p-8 text-center shadow-xl shadow-black/20">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-accent)]/25 to-indigo-500/10 ring-1 ring-inset ring-[var(--color-accent)]/30">
            <Bot className="size-7 text-[var(--color-accent)]" />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold text-white">Email AI Dashboard</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-dim)]">
            Enable Email AI in settings to summarize threads, classify mail, detect spam, and
            generate reply drafts.
          </p>
          <button
            type="button"
            onClick={() => dash.setActiveNav("settings")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[12px] font-medium text-white hover:brightness-110"
          >
            <Settings2 className="size-4" />
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  const { stats, workerStatus, aiCoverage, isProcessing, queuedJobCount } = dash;
  const workerLabel = !workerStatus.running
    ? "Worker stopped"
    : isProcessing
      ? workerStatus.processingJobCount > 1
        ? `Processing ${workerStatus.processingJobCount} jobs`
        : workerStatus.processingJob
          ? `Processing ${getTaskTypeLabel(workerStatus.processingJob.taskType)}`
          : "Processing"
      : queuedJobCount > 0
        ? `${queuedJobCount} job${queuedJobCount === 1 ? "" : "s"} queued`
        : "Worker ready";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg)]">
      <div className="relative shrink-0 overflow-hidden border-b border-[var(--color-border)] px-6 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(14,165,233,0.08),transparent_50%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)]/30 to-indigo-500/20 ring-1 ring-inset ring-[var(--color-accent)]/25">
                <Bot className="size-4 text-[var(--color-accent)]" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-white">
                  Email AI Dashboard
                </h2>
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  Coverage, queue status, and inbox intelligence
                </p>
              </div>
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-black/25 px-3 py-1">
              <span
                className={`size-2 rounded-full ${
                  isProcessing
                    ? "animate-pulse bg-sky-400"
                    : workerStatus.running
                      ? "bg-emerald-400"
                      : "bg-zinc-500"
                }`}
              />
              <span className="text-[11px] text-[var(--color-text-dim)]">{workerLabel}</span>
              {dash.aiCoverageLoading && (
                <Loader2 className="size-3 animate-spin text-[var(--color-text-dim)]" />
              )}
            </div>
          </div>
          <DashboardActions
            accountId={accountId}
            workerRunning={workerStatus.running}
            aiScanLoading={dash.aiScanLoading}
            activeJobCount={dash.queuedJobCount}
            onStart={dash.startEmailAi}
            onStop={dash.stopEmailAi}
            onScan={(id) => void dash.runEmailAiScan(id)}
            onCancel={(id) => void dash.cancelQueuedAiJobs(id)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard
                label="Threads"
                value={stats.totalThreads}
                hint={`${stats.unreadThreads} unread`}
                icon={<Mail className="size-4" />}
                accent="from-sky-500/20 to-blue-500/10 text-sky-300"
              />
              <StatCard
                label="Analyzed"
                value={stats.analyzedThreads}
                hint="With AI metadata"
                icon={<Sparkles className="size-4" />}
                accent="from-violet-500/20 to-purple-500/10 text-violet-300"
              />
              <StatCard
                label="Pending"
                value={stats.totalPending}
                hint="Awaiting scan"
                icon={<Clock3 className="size-4" />}
                accent="from-amber-500/20 to-yellow-500/10 text-amber-300"
              />
              <StatCard
                label="In queue"
                value={queuedJobCount}
                hint={
                  isProcessing
                    ? `${workerStatus.processingJobCount} processing`
                    : "Waiting to run"
                }
                icon={<ListTodo className="size-4" />}
                accent="from-indigo-500/20 to-violet-500/10 text-indigo-300"
              />
              <StatCard
                label="Coverage"
                value={`${stats.overallPct}%`}
                hint={`${workerStatus.jobsCompleted} jobs done`}
                icon={<Activity className="size-4" />}
                accent="from-emerald-500/20 to-teal-500/10 text-emerald-300"
              />
            </div>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                Task coverage
              </h3>
              <button
                type="button"
                onClick={() => dash.setActiveNav("settings")}
                className="flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:brightness-110"
              >
                <Settings2 className="size-3" />
                Configure tasks
              </button>
            </div>
            {aiCoverage && aiCoverage.tasks.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {aiCoverage.tasks.map((task) => (
                  <TaskCoverageCard
                    key={task.taskType}
                    task={task}
                    isActivelyProcessing={
                      isProcessing &&
                      workerStatus.processingJobs.some(
                        (active) => active.taskType === task.taskType,
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)]/40 px-4 py-8 text-center text-[12px] text-[var(--color-text-dim)]">
                No background tasks enabled. Turn on summaries, classification, or spam detection
                in Settings → Email.
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                Active queue
              </h3>
              {aiCoverage && aiCoverage.activeJobs.length > 0 ? (
                <div className="space-y-2">
                  {aiCoverage.activeJobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      isActivelyProcessing={
                        isProcessing &&
                      workerStatus.processingJobs.some((active) => active.id === job.id)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/40 px-4 py-10 text-center">
                  <CheckCircle2 className="size-8 text-[var(--color-text-dim)]/30" />
                  <p className="mt-2 text-[12px] text-[var(--color-text-dim)]">Queue is empty</p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-dim)]/60">
                    Start the worker and scan your inbox to process threads.
                  </p>
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                Recently analyzed
              </h3>
              {dash.recentAnalyzedThreads.length > 0 ? (
                <div className="space-y-2">
                  {dash.recentAnalyzedThreads.map((thread) => (
                    <RecentThreadRow
                      key={thread.id}
                      thread={thread}
                      onSelect={dash.selectThread}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/40 px-4 py-10 text-center">
                  <MailOpen className="size-8 text-[var(--color-text-dim)]/30" />
                  <p className="mt-2 text-[12px] text-[var(--color-text-dim)]">
                    No analyzed threads yet
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-dim)]/60">
                    Run a scan to populate summaries and classifications.
                  </p>
                </div>
              )}
            </section>
          </div>

          {workerStatus.lastError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{workerStatus.lastError}</span>
            </div>
          )}

          {stats && stats.totalFailed > 0 && (
            <div className="text-center text-[11px] text-[var(--color-text-dim)]">
              {stats.totalFailed} failed job{stats.totalFailed === 1 ? "" : "s"} across enabled
              tasks · {workerStatus.jobsFailed} total session failures
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmailAiSidebarDashboard({ accountId }: { accountId: string }) {
  const dash = useEmailAiDashboard(accountId);

  if (!dash.emailAiEnabled) {
    return (
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-panel)]/80 p-3">
        <button
          type="button"
          onClick={() => dash.setActiveNav("settings")}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-2 text-left hover:bg-white/[0.03]"
        >
          <Bot className="size-3.5 text-[var(--color-text-dim)]" />
          <span className="text-[10px] text-[var(--color-text-dim)]">Enable Email AI</span>
        </button>
      </div>
    );
  }

  const pct = dash.stats?.overallPct ?? 0;

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-gradient-to-b from-[var(--color-panel)]/95 to-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bot className="size-3.5 text-[var(--color-accent)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            AI
          </span>
        </div>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            dash.isProcessing
              ? "bg-sky-500/15 text-sky-300"
              : dash.workerStatus.running
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-white/[0.06] text-[var(--color-text-dim)]"
          }`}
        >
          {dash.isProcessing ? "Busy" : dash.workerStatus.running ? "Ready" : "Off"}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-md bg-black/25 px-2 py-1.5 text-center">
          <div className="text-[13px] font-semibold tabular-nums text-white">{pct}%</div>
          <div className="text-[8px] uppercase tracking-wide text-[var(--color-text-dim)]">Done</div>
        </div>
        <div className="rounded-md bg-black/25 px-2 py-1.5 text-center">
          <div className="text-[13px] font-semibold tabular-nums text-white">
            {dash.stats?.totalPending ?? 0}
          </div>
          <div className="text-[8px] uppercase tracking-wide text-[var(--color-text-dim)]">Wait</div>
        </div>
        <div className="rounded-md bg-black/25 px-2 py-1.5 text-center">
          <div className="text-[13px] font-semibold tabular-nums text-white">
            {dash.queuedJobCount}
          </div>
          <div className="text-[8px] uppercase tracking-wide text-[var(--color-text-dim)]">Queue</div>
        </div>
      </div>
      <div className="flex gap-1">
        {!dash.workerStatus.running ? (
          <button
            type="button"
            onClick={dash.startEmailAi}
            className="flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-[var(--color-accent)] text-[9px] font-medium text-white"
          >
            <Play className="size-2.5" />
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={dash.stopEmailAi}
            className="flex h-6 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] text-[9px] text-[var(--color-text)]"
          >
            <Square className="size-2.5" />
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={() => void dash.runEmailAiScan(accountId)}
          disabled={!dash.workerStatus.running || dash.aiScanLoading}
          className="flex h-6 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] text-[9px] text-[var(--color-text-dim)] disabled:opacity-40"
        >
          {dash.aiScanLoading ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <ScanSearch className="size-2.5" />
          )}
          Scan
        </button>
      </div>
    </div>
  );
}
