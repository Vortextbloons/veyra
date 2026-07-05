import {
  aiScheduler,
  EMAIL_SCHEDULER_JOB_PREFIX,
  type AiJobPriority,
  type AiJobSnapshot,
  type AiJobStatus,
  type AiJobType,
} from "@/lib/ai-scheduler";
import { useSettingsStore } from "@/stores/settings-store";
import { getTaskTypeLabel } from "./components/ai-output-helpers";
import { emailAiWorker } from "./email-ai-worker";
import { emailListAiJobs } from "./tauri-commands";
import type { EmailAiJob } from "./email-types";

const EMAIL_RECENT_LIMIT = 20;

function emailTaskTypeToSchedulerType(taskType: string): AiJobType {
  switch (taskType) {
    case "thread_summary":
      return "email_thread_summary";
    case "classification":
      return "email_classification";
    case "spam_score":
      return "email_spam_score";
    case "urgency_score":
      return "email_urgency_score";
    case "reply_draft":
      return "email_reply_draft";
    default:
      return "email_thread_summary";
  }
}

function mapEmailStatus(status: EmailAiJob["status"]): AiJobStatus {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "queued":
    default:
      return "queued";
  }
}

function toSchedulerPriority(priority: number): AiJobPriority {
  const clamped = Math.max(0, Math.min(4, priority));
  return clamped as AiJobPriority;
}

export function emailJobToSchedulerSnapshot(
  job: EmailAiJob,
  overrides?: Partial<Pick<AiJobSnapshot, "status" | "startedAt">>,
): AiJobSnapshot {
  const status = overrides?.status ?? mapEmailStatus(job.status);
  const threadHint = job.threadId ? `Thread ${job.threadId.slice(0, 8)}…` : "Background job";

  return {
    id: `${EMAIL_SCHEDULER_JOB_PREFIX}${job.id}`,
    source: "email",
    type: emailTaskTypeToSchedulerType(job.taskType),
    priority: toSchedulerPriority(job.priority),
    title: getTaskTypeLabel(job.taskType),
    description: threadHint,
    model: job.modelId,
    createdAt: job.createdAt,
    startedAt: overrides?.startedAt ?? job.startedAt,
    finishedAt: job.finishedAt,
    status,
    error: job.error,
  };
}

let syncStarted = false;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let refreshInFlight: Promise<void> | null = null;

async function refreshEmailSchedulerJobs(): Promise<void> {
  if (!useSettingsStore.getState().emailAiEnabled) {
    aiScheduler.setExternalEmailJobs({ active: [], queued: [], recent: [] });
    return;
  }

  const workerProcessing = emailAiWorker.getStatus().processingJobs;
  const processingIds = new Set(workerProcessing.map((job) => job.id));

  const [queued, running, completed, failed] = await Promise.all([
    emailListAiJobs({ status: "queued", limit: 50 }),
    emailListAiJobs({ status: "running", limit: 20 }),
    emailListAiJobs({ status: "completed", limit: EMAIL_RECENT_LIMIT }),
    emailListAiJobs({ status: "failed", limit: 10 }),
  ]);

  const active: AiJobSnapshot[] = [
    ...workerProcessing.map((job) =>
      emailJobToSchedulerSnapshot(job, {
        status: "running",
        startedAt: job.startedAt ?? Date.now(),
      }),
    ),
    ...running
      .filter((job) => !processingIds.has(job.id))
      .map((job) => emailJobToSchedulerSnapshot(job)),
  ];

  const queuedSnapshots = queued
    .filter((job) => !processingIds.has(job.id))
    .map((job) => emailJobToSchedulerSnapshot(job));

  const recent = [...completed, ...failed]
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, EMAIL_RECENT_LIMIT)
    .map((job) => emailJobToSchedulerSnapshot(job));

  aiScheduler.setExternalEmailJobs({
    active,
    queued: queuedSnapshots,
    recent,
  });
}

function scheduleRefresh(): void {
  if (refreshInFlight) return;
  refreshInFlight = refreshEmailSchedulerJobs()
    .catch((err) => {
      console.error("[EmailAiSchedulerSync] refresh failed:", err);
    })
    .finally(() => {
      refreshInFlight = null;
    });
}

export function startEmailAiSchedulerSync(): void {
  if (syncStarted) return;
  syncStarted = true;

  emailAiWorker.subscribe(() => {
    scheduleRefresh();
  });
  emailAiWorker.onJobSettled(() => {
    scheduleRefresh();
  });

  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (!useSettingsStore.getState().emailAiEnabled) {
      aiScheduler.setExternalEmailJobs({ active: [], queued: [], recent: [] });
      return;
    }
    scheduleRefresh();
  }, 3000);

  scheduleRefresh();
}
