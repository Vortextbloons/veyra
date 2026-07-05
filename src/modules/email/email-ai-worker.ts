import { ensureLmStudioModel } from "@/lib/lm-model-session";
import { sendLmStudioChat } from "@/lib/lm-studio-chat";
import { aiScheduler } from "@/lib/ai-scheduler";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import {
  emailClaimAiJob,
  emailCompleteAiJob,
  emailFailAiJob,
  emailRequeueAiJob,
  emailGetUnprocessedThreadIds,
  emailEnqueueAiJobs,
  emailGetThread,
  emailUpsertAiTags,
  emailSaveAiDraft,
} from "./tauri-commands";
import {
  buildPromptForTask,
  buildReplyDraftPrompt,
  parseJsonResponse,
  EMAIL_AI_PROMPT_VERSION,
  type EmailAiTaskType,
} from "./email-ai-prompts";
import type { EmailAiJob, EmailMessage } from "./email-types";

export type EmailAiJobSettledEvent = {
  job: EmailAiJob;
  outcome: "completed" | "failed";
};

type JobExecutionOutcome = "completed" | "failed" | "requeued";

export type EmailAiWorkerStatus = {
  running: boolean;
  processingJob: EmailAiJob | null;
  lastTickAt: number;
  lastError: string | null;
  jobsCompleted: number;
  jobsFailed: number;
};

type StatusListener = (status: EmailAiWorkerStatus) => void;

type EmailAiFullTaskType = EmailAiTaskType | "reply_draft";

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
  private jobSettledListeners: Set<(event: EmailAiJobSettledEvent) => void> = new Set();
  private unsubscribeScheduler: (() => void) | null = null;

  start(): void {
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

    this.startPollTimer();
    void this.tick();
    this.notify();
  }

  private startPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    const settings = useSettingsStore.getState();
    this.pollTimer = setInterval(() => {
      void this.tick();
    }, settings.emailAiPollInterval);
  }

  /** Re-read poll interval and other runtime settings while the worker is active. */
  applyRuntimeSettings(): void {
    if (!this.running) return;
    this.startPollTimer();
  }

  restartPollTimer(): void {
    this.applyRuntimeSettings();
  }

  /** Run the worker loop immediately (e.g. after enqueueing an on-demand draft). */
  wake(): void {
    if (!this.running || this.pausedByUserJob) return;
    void this.tick();
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

  onJobSettled(listener: (event: EmailAiJobSettledEvent) => void): () => void {
    this.jobSettledListeners.add(listener);
    return () => {
      this.jobSettledListeners.delete(listener);
    };
  }

  private emitJobSettled(event: EmailAiJobSettledEvent): void {
    for (const listener of this.jobSettledListeners) {
      listener(event);
    }
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

    const taskTypes = this.getEnabledEnqueueTaskTypes();
    for (const taskType of taskTypes) {
      try {
        const threadIds = await emailGetUnprocessedThreadIds(accountId, taskType);
        if (threadIds.length === 0) continue;

        const inputs = threadIds.map((threadId) => ({
          accountId,
          threadId,
          taskType,
          priority: 2,
          tone: taskType === "reply_draft" ? "concise" : undefined,
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

    const taskTypes = this.getEnabledClaimTaskTypes();
    if (taskTypes.length === 0) return;

    const batchSize = Math.max(1, settings.emailAiWorkerCount);
    let processed = 0;

    while (processed < batchSize && this.running && !this.pausedByUserJob) {
      try {
        const job = await emailClaimAiJob(taskTypes);
        if (!job) break;

        this.processingJob = job;
        this.abortController = new AbortController();
        this.notify();

        const outcome = await this.executeJob(job, this.abortController.signal);
        if (outcome === "completed") {
          this.jobsCompleted++;
          this.emitJobSettled({ job, outcome: "completed" });
          this.lastError = null;
          processed++;
        } else if (outcome === "failed") {
          this.jobsFailed++;
          this.emitJobSettled({ job, outcome: "failed" });
          this.lastError = null;
        }
      } catch (err) {
        if (this.abortController?.signal.aborted) {
          // Aborted by pause or stop — the job was already re-queued or failed in executeJob
        } else {
          this.jobsFailed++;
          this.lastError = err instanceof Error ? err.message : String(err);
        }
        break; // Stop batch on error
      } finally {
        this.processingJob = null;
        this.abortController = null;
        this.notify();
      }
    }
  }

  private async executeJob(
    job: EmailAiJob,
    signal: AbortSignal,
  ): Promise<JobExecutionOutcome> {
    const modelId = this.resolveModelForTask(job.taskType as EmailAiFullTaskType);
    if (!modelId) {
      return this.failJob(job.id, "no model configured for this task");
    }

    let messages: EmailMessage[] = [];
    if (job.threadId) {
      try {
        const thread = await emailGetThread(job.threadId);
        messages = thread.messages;
      } catch {
        return this.failJob(job.id, "failed to load thread");
      }
    }

    if (messages.length === 0) {
      return this.failJob(job.id, "no messages to process");
    }

    // For reply_draft, use the tone from the job; otherwise use buildPromptForTask
    let system: string;
    let user: string;
    if (job.taskType === "reply_draft") {
      const tone = job.tone || "concise";
      const prompt = buildReplyDraftPrompt(messages, tone);
      system = prompt.system;
      user = prompt.user;
    } else {
      const prompt = buildPromptForTask(
        job.taskType as EmailAiTaskType,
        messages,
      );
      system = prompt.system;
      user = prompt.user;
    }

    try {
      await ensureLmStudioModel(modelId, signal);
    } catch (err) {
      if (signal.aborted) {
        await this.requeueJob(job);
        return "requeued";
      }
      return this.failJob(
        job.id,
        `model load failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (signal.aborted) {
      await this.requeueJob(job);
      return "requeued";
    }

    let output = "";
    try {
      await sendLmStudioChat({
        messages: [
          { id: "system", role: "system", content: system, timestamp: Date.now() },
          { id: "user", role: "user", content: user, timestamp: Date.now() },
        ],
        model: modelId,
        temperature: 0.3,
        maxTokens: 1024,
        responseFormat: { type: "json_object" },
        reasoningEnabled: false,
        signal,
        onChunk: (content) => {
          output += content;
        },
        onError: (err) => {
          throw new Error(err);
        },
      });
    } catch (err) {
      if (signal.aborted) {
        await this.requeueJob(job);
      } else {
        return this.failJob(
          job.id,
          `inference failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return "requeued";
    }

    if (signal.aborted) {
      await this.requeueJob(job);
      return "requeued";
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonResponse<Record<string, unknown>>(output);
    } catch {
      return this.failJob(job.id, "failed to parse AI response as JSON");
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

    if (job.taskType === "reply_draft" && job.threadId) {
      const subject = typeof parsed.subject === "string" ? parsed.subject : `Re: ${messages[messages.length - 1]?.subject ?? ""}`;
      const body = typeof parsed.body === "string" ? parsed.body : "";
      const tone = typeof parsed.tone === "string" ? parsed.tone : "concise";
      const lastMsg = messages[messages.length - 1];
      const toJson = lastMsg ? JSON.stringify([{ name: lastMsg.from.name, email: lastMsg.from.email }]) : "[]";
      try {
        await emailSaveAiDraft({
          jobId: job.id,
          accountId: job.accountId,
          threadId: job.threadId,
          messageId: job.messageId,
          modelId,
          tone,
          toJson,
          ccJson: "[]",
          bccJson: "[]",
          subject,
          body,
        });
      } catch (err) {
        console.error("[EmailAiWorker] failed to save AI draft:", err);
      }
    }

    if (job.taskType === "classification" && job.messageId) {
      const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string") : [];
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
      const reason = typeof parsed.reason === "string" ? parsed.reason : "";
      if (tags.length > 0) {
        try {
          await emailUpsertAiTags(job.messageId, tags, confidence, reason);
        } catch (err) {
          console.error("[EmailAiWorker] failed to apply AI tags:", err);
        }
      }
    }

    return "completed";
  }

  private async failJob(jobId: string, error: string): Promise<JobExecutionOutcome> {
    const updated = await emailFailAiJob(jobId, error);
    return updated.status === "failed" ? "failed" : "requeued";
  }

  private async requeueJob(job: EmailAiJob): Promise<void> {
    try {
      await emailRequeueAiJob(job.id);
    } catch {
      // Best effort — stale jobs are reconciled on the next coverage refresh.
    }
  }

  private resolveModelForTask(taskType: EmailAiFullTaskType): string {
    const settings = useSettingsStore.getState();
    const fallback = useProviderStore.getState().selectedModel || "";
    switch (taskType) {
      case "thread_summary":
        return settings.emailAiSummaryModel || fallback;
      case "classification":
      case "spam_score":
        return settings.emailAiClassificationModel || fallback;
      case "urgency_score":
        return settings.emailAiSummaryModel || fallback;
      case "reply_draft":
        return settings.emailAiDraftModel || fallback;
      default:
        return fallback;
    }
  }

  /** Task types used when enqueueing new jobs (per-setting toggles). */
  private getEnabledEnqueueTaskTypes(): string[] {
    const settings = useSettingsStore.getState();
    const types: string[] = [];
    if (settings.emailAiBackgroundSummary) types.push("thread_summary");
    if (settings.emailAiBackgroundClassification) types.push("classification");
    if (settings.emailAiBackgroundSpam) types.push("spam_score");
    if (settings.emailAiBackgroundUrgency) types.push("urgency_score");
    if (settings.emailAiAutoDraft) types.push("reply_draft");
    return types;
  }

  /** Task types used when claiming jobs. Always includes reply_draft for on-demand generation. */
  private getEnabledClaimTaskTypes(): string[] {
    const settings = useSettingsStore.getState();
    const types: string[] = [];
    if (settings.emailAiBackgroundSummary) types.push("thread_summary");
    if (settings.emailAiBackgroundClassification) types.push("classification");
    if (settings.emailAiBackgroundSpam) types.push("spam_score");
    if (settings.emailAiBackgroundUrgency) types.push("urgency_score");
    // Always claim reply_draft for on-demand generation, even if auto-draft is off
    types.push("reply_draft");
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
      case "reply_draft":
        return typeof parsed.subject === "string" ? `Draft: ${parsed.subject}` : "Draft generated";
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
