import { ensureLmStudioModel } from "@/lib/lm-model-session";
import { sendLmStudioChat } from "@/lib/lm-studio-chat";
import { aiScheduler } from "@/lib/ai-scheduler";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import {
  emailClaimAiJob,
  emailCompleteAiJob,
  emailFailAiJob,
  emailGetUnprocessedThreadIds,
  emailEnqueueAiJobs,
  emailGetThread,
} from "./tauri-commands";
import {
  buildPromptForTask,
  parseJsonResponse,
  EMAIL_AI_PROMPT_VERSION,
  type EmailAiTaskType,
} from "./email-ai-prompts";
import type { EmailAiJob, EmailMessage } from "./email-types";

type EmailAiWorkerStatus = {
  running: boolean;
  processingJob: EmailAiJob | null;
  lastTickAt: number;
  lastError: string | null;
  jobsCompleted: number;
  jobsFailed: number;
};

type StatusListener = (status: EmailAiWorkerStatus) => void;

export class EmailAiWorker {
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pausedByUserJob = false;
  private processingJob: EmailAiJob | null = null;
  private lastTickAt = 0;
  private lastError: string | null = null;
  private jobsCompleted = 0;
  private jobsFailed = 0;
  private abortController: AbortController | null = null;
  private listeners: Set<StatusListener> = new Set();
  private unsubscribeScheduler: (() => void) | null = null;

  start(_accountId: string): void {
    if (this.running) return;
    this.running = true;

    this.unsubscribeScheduler = aiScheduler.subscribeToScheduler(() => {
      const snapshot = aiScheduler.getSchedulerSnapshot();
      if (snapshot.isUserJobRunning && !this.pausedByUserJob) {
        this.pausedByUserJob = true;
        this.abortController?.abort();
      } else if (!snapshot.isUserJobRunning && this.pausedByUserJob) {
        this.pausedByUserJob = false;
        void this.tick();
      }
    });

    const settings = useSettingsStore.getState();
    this.pollTimer = setInterval(() => {
      void this.tick();
    }, settings.emailAiPollInterval);

    void this.tick();
    this.notify();
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    this.processingJob = null;
    this.pausedByUserJob = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.unsubscribeScheduler) {
      this.unsubscribeScheduler();
      this.unsubscribeScheduler = null;
    }
    this.notify();
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): EmailAiWorkerStatus {
    return {
      running: this.running,
      processingJob: this.processingJob,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
    };
  }

  async enqueueForNewMessages(accountId: string): Promise<void> {
    const settings = useSettingsStore.getState();
    if (!settings.emailAiEnabled) return;

    const taskTypes: EmailAiTaskType[] = [];
    if (settings.emailAiBackgroundSummary) taskTypes.push("thread_summary");
    if (settings.emailAiBackgroundClassification) taskTypes.push("classification");
    if (settings.emailAiBackgroundSpam) taskTypes.push("spam_score");
    if (settings.emailAiBackgroundUrgency) taskTypes.push("urgency_score");

    for (const taskType of taskTypes) {
      try {
        const threadIds = await emailGetUnprocessedThreadIds(accountId, taskType);
        if (threadIds.length === 0) continue;

        const inputs = threadIds.map((threadId) => ({
          accountId,
          threadId,
          taskType,
          priority: 2,
          modelId: this.resolveModelForTask(taskType),
        }));

        await emailEnqueueAiJobs(inputs);
      } catch (err) {
        console.error(`[EmailAiWorker] enqueue failed for ${taskType}:`, err);
      }
    }
  }

  private async tick(): Promise<void> {
    if (!this.running || this.pausedByUserJob) return;

    const settings = useSettingsStore.getState();
    if (!settings.emailAiEnabled) return;

    this.lastTickAt = Date.now();

    const taskTypes = this.getEnabledTaskTypes();
    if (taskTypes.length === 0) return;

    try {
      const job = await emailClaimAiJob(taskTypes);
      if (!job) return;

      this.processingJob = job;
      this.abortController = new AbortController();
      this.notify();

      await this.executeJob(job, this.abortController.signal);
      this.jobsCompleted++;
      this.lastError = null;
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        // Aborted by pause or stop — don't count as failure
      } else {
        this.jobsFailed++;
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      this.processingJob = null;
      this.abortController = null;
      this.notify();
    }
  }

  private async executeJob(
    job: EmailAiJob,
    signal: AbortSignal,
  ): Promise<void> {
    const modelId =
      job.modelId || this.resolveModelForTask(job.taskType as EmailAiTaskType);
    if (!modelId) {
      await emailFailAiJob(job.id, "no model configured for this task");
      return;
    }

    let messages: EmailMessage[] = [];
    if (job.threadId) {
      try {
        const thread = await emailGetThread(job.threadId);
        messages = thread.messages;
      } catch {
        await emailFailAiJob(job.id, "failed to load thread");
        return;
      }
    }

    if (messages.length === 0) {
      await emailFailAiJob(job.id, "no messages to process");
      return;
    }

    const { system, user } = buildPromptForTask(
      job.taskType as EmailAiTaskType,
      messages,
    );

    await ensureLmStudioModel(modelId, signal);

    let output = "";
    await sendLmStudioChat({
      messages: [
        { id: "system", role: "system", content: system, timestamp: Date.now() },
        { id: "user", role: "user", content: user, timestamp: Date.now() },
      ],
      model: modelId,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: { type: "json_object" },
      signal,
      onChunk: (content) => {
        output += content;
      },
      onError: (err) => {
        throw new Error(err);
      },
    });

    if (signal.aborted) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonResponse<Record<string, unknown>>(output);
    } catch {
      await emailFailAiJob(job.id, "failed to parse AI response as JSON");
      return;
    }

    const displayText = this.buildDisplayText(job.taskType, parsed);

    await emailCompleteAiJob({
      jobId: job.id,
      modelId,
      promptVersion: EMAIL_AI_PROMPT_VERSION,
      sourceMessageIdsJson: JSON.stringify(messages.map((m) => m.id)),
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      resultJson: JSON.stringify(parsed),
      displayText,
    });
  }

  private resolveModelForTask(taskType: EmailAiTaskType): string {
    const settings = useSettingsStore.getState();
    const fallback = useProviderStore.getState().selectedModel || "";
    switch (taskType) {
      case "thread_summary":
        return settings.emailAiSummaryModel || fallback;
      case "classification":
        return settings.emailAiClassificationModel || fallback;
      case "spam_score":
        return settings.emailAiClassificationModel || fallback;
      case "urgency_score":
        return settings.emailAiSummaryModel || fallback;
      default:
        return fallback;
    }
  }

  private getEnabledTaskTypes(): string[] {
    const settings = useSettingsStore.getState();
    const types: string[] = [];
    if (settings.emailAiBackgroundSummary) types.push("thread_summary");
    if (settings.emailAiBackgroundClassification) {
      types.push("classification");
      types.push("spam_score");
    }
    if (settings.emailAiBackgroundUrgency) types.push("urgency_score");
    return types;
  }

  private buildDisplayText(
    taskType: string,
    parsed: Record<string, unknown>,
  ): string {
    switch (taskType) {
      case "thread_summary":
        return typeof parsed.shortSummary === "string"
          ? parsed.shortSummary
          : "";
      case "classification":
        return typeof parsed.category === "string" ? parsed.category : "";
      case "spam_score": {
        const spam = typeof parsed.spamScore === "number" ? parsed.spamScore : 0;
        const mkt =
          typeof parsed.marketingScore === "number"
            ? parsed.marketingScore
            : 0;
        if (spam > 0.7) return "Likely spam";
        if (mkt > 0.7) return "Marketing/Newsletter";
        return "Clean";
      }
      case "urgency_score":
        return typeof parsed.level === "string" ? parsed.level : "";
      default:
        return "";
    }
  }

  private notify(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const emailAiWorker = new EmailAiWorker();
