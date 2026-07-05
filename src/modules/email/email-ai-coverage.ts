import { useSettingsStore } from "@/stores/settings-store";
import { getTaskTypeLabel } from "./components/ai-output-helpers";
import { emailGetUnprocessedThreadIds, emailListAiJobs, emailReconcileAiJobs } from "./tauri-commands";
import type { EmailAiCoverageSnapshot, EmailAiJob } from "./email-types";

/** Jobs marked running longer than this are treated as orphaned during coverage refresh. */
export const STALE_RUNNING_JOB_MS = 5 * 60 * 1000;

export const BACKGROUND_AI_TASK_TYPES = [
  "thread_summary",
  "classification",
  "spam_score",
  "urgency_score",
] as const;

export function getEnabledBackgroundAiTaskTypes(): string[] {
  const settings = useSettingsStore.getState();
  const types: string[] = [];
  if (settings.emailAiBackgroundSummary) types.push("thread_summary");
  if (settings.emailAiBackgroundClassification) types.push("classification");
  if (settings.emailAiBackgroundSpam) types.push("spam_score");
  if (settings.emailAiBackgroundUrgency) types.push("urgency_score");
  return types;
}

export async function fetchEmailAiCoverage(
  accountId: string,
  totalThreads: number,
): Promise<EmailAiCoverageSnapshot> {
  const enabledTypes = getEnabledBackgroundAiTaskTypes();
  if (enabledTypes.length === 0) {
    return { tasks: [], activeJobs: [], totalThreads, loadedAt: Date.now() };
  }

  await emailReconcileAiJobs(STALE_RUNNING_JOB_MS);

  const [completed, queued, running, failed] = await Promise.all([
    emailListAiJobs({ accountId, status: "completed", limit: 500 }),
    emailListAiJobs({ accountId, status: "queued", limit: 200 }),
    emailListAiJobs({ accountId, status: "running", limit: 20 }),
    emailListAiJobs({ accountId, status: "failed", limit: 100 }),
  ]);

  const pendingCounts = await Promise.all(
    enabledTypes.map(async (taskType) => ({
      taskType,
      pending: (await emailGetUnprocessedThreadIds(accountId, taskType)).length,
    })),
  );

  const tasks = enabledTypes.map((taskType) => {
    const coveredThreads = new Set(
      completed
        .filter((job) => job.taskType === taskType && job.threadId)
        .map((job) => job.threadId as string),
    );
    return {
      taskType,
      label: getTaskTypeLabel(taskType),
      covered: coveredThreads.size,
      queued: queued.filter((job) => job.taskType === taskType).length,
      running: running.filter((job) => job.taskType === taskType).length,
      pending: pendingCounts.find((entry) => entry.taskType === taskType)?.pending ?? 0,
      failed: failed.filter((job) => job.taskType === taskType).length,
    };
  });

  const activeJobs: EmailAiJob[] = [...queued, ...running]
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .slice(0, 10);

  return { tasks, activeJobs, totalThreads, loadedAt: Date.now() };
}
