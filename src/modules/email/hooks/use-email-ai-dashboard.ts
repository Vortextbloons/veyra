import { useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useEmailStore } from "../email-store";
import { emailAiWorker, type EmailAiWorkerStatus } from "../email-ai-worker";
import type { EmailAiCoverageSnapshot, EmailAiTaskCoverage, EmailThread } from "../email-types";

export type EmailAiDashboardStats = {
  totalThreads: number;
  analyzedThreads: number;
  unreadThreads: number;
  totalCovered: number;
  totalPending: number;
  totalQueued: number;
  totalRunning: number;
  totalFailed: number;
  overallPct: number;
};

export function computeDashboardStats(
  threads: EmailThread[],
  accountId: string,
  coverage: EmailAiCoverageSnapshot | null,
): EmailAiDashboardStats {
  const accountThreads = threads.filter((thread) => thread.accountId === accountId);
  const analyzedThreads = accountThreads.filter(
    (thread) =>
      Boolean(thread.aiMetadata?.summary) ||
      Boolean(thread.aiMetadata?.category) ||
      (thread.aiMetadata?.tags?.length ?? 0) > 0,
  ).length;

  const tasks = coverage?.tasks ?? [];
  const totalCovered = tasks.reduce((sum, task) => sum + task.covered, 0);
  const totalPending = tasks.reduce((sum, task) => sum + task.pending, 0);
  const totalQueued = tasks.reduce((sum, task) => sum + task.queued, 0);
  const totalRunning = tasks.reduce((sum, task) => sum + task.running, 0);
  const totalFailed = tasks.reduce((sum, task) => sum + task.failed, 0);
  const denominator = totalCovered + totalPending + totalQueued + totalRunning;
  const overallPct = denominator > 0 ? Math.round((totalCovered / denominator) * 100) : 0;

  return {
    totalThreads: accountThreads.length,
    analyzedThreads,
    unreadThreads: accountThreads.filter((thread) => !thread.isRead).length,
    totalCovered,
    totalPending,
    totalQueued,
    totalRunning,
    totalFailed,
    overallPct,
  };
}

export function taskCoveragePct(task: EmailAiTaskCoverage): number {
  const total = task.covered + task.pending + task.queued + task.running;
  return total > 0 ? Math.round((task.covered / total) * 100) : 0;
}

export function useEmailAiDashboard(accountId: string | null) {
  const emailAiEnabled = useSettingsStore((s) => s.emailAiEnabled);
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);
  const threads = useEmailStore((s) => s.threads);
  const aiCoverage = useEmailStore((s) => s.aiCoverage);
  const aiCoverageLoading = useEmailStore((s) => s.aiCoverageLoading);
  const aiScanLoading = useEmailStore((s) => s.aiScanLoading);
  const loadAiCoverage = useEmailStore((s) => s.loadAiCoverage);
  const runEmailAiScan = useEmailStore((s) => s.runEmailAiScan);
  const cancelQueuedAiJobs = useEmailStore((s) => s.cancelQueuedAiJobs);
  const startEmailAi = useEmailStore((s) => s.startEmailAi);
  const stopEmailAi = useEmailStore((s) => s.stopEmailAi);
  const selectThread = useEmailStore((s) => s.selectThread);

  const [workerStatus, setWorkerStatus] = useState<EmailAiWorkerStatus>(
    emailAiWorker.getStatus(),
  );

  useEffect(() => emailAiWorker.subscribe(setWorkerStatus), []);

  useEffect(() => {
    if (!emailAiEnabled || !accountId) return;
    void loadAiCoverage(accountId);
  }, [accountId, emailAiEnabled, loadAiCoverage]);

  useEffect(() => {
    if (!emailAiEnabled || !accountId || !workerStatus.running) return;
    const busy =
      workerStatus.processingJob !== null ||
      (aiCoverage?.activeJobs.length ?? 0) > 0;
    const intervalMs = busy ? 2000 : 6000;
    const timer = setInterval(() => {
      void loadAiCoverage(accountId, { silent: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [
    accountId,
    emailAiEnabled,
    workerStatus.running,
    workerStatus.processingJob,
    aiCoverage?.activeJobs.length,
    loadAiCoverage,
  ]);

  const stats = useMemo(
    () =>
      accountId
        ? computeDashboardStats(threads, accountId, aiCoverage)
        : null,
    [threads, accountId, aiCoverage],
  );

  const recentAnalyzedThreads = useMemo(() => {
    if (!accountId) return [];
    return threads
      .filter(
        (thread) =>
          thread.accountId === accountId &&
          (thread.aiMetadata?.summary || thread.aiMetadata?.category),
      )
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 6);
  }, [threads, accountId]);

  const activeJobCount = aiCoverage?.activeJobs.length ?? 0;
  const isProcessing = workerStatus.processingJob !== null;
  const queuedJobCount =
    aiCoverage?.activeJobs.filter((job) => {
      if (job.status === "queued") return true;
      if (job.status === "running") {
        return workerStatus.processingJob?.id !== job.id;
      }
      return false;
    }).length ?? 0;

  return {
    emailAiEnabled,
    setActiveNav,
    aiCoverage,
    aiCoverageLoading,
    aiScanLoading,
    workerStatus,
    stats,
    recentAnalyzedThreads,
    activeJobCount,
    queuedJobCount,
    isProcessing,
    loadAiCoverage,
    runEmailAiScan,
    cancelQueuedAiJobs,
    startEmailAi,
    stopEmailAi,
    selectThread,
  };
}
