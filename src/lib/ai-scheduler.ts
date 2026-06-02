export type AiJobPriority = 0 | 1 | 2 | 3 | 4;

export type AiJobType =
  | "user_chat"
  | "auto_name_chat"
  | "summarize_chat"
  | "extract_memory"
  | "compress_context"
  | "maintenance";

export type AiJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "aborted";

export type AiJob = {
  id: string;
  type: AiJobType;
  priority: AiJobPriority;
  title: string;
  description?: string;
  conversationId?: string;
  model?: string;
  prompt?: string;
  output?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: AiJobStatus;
  error?: string;
  run: (signal: AbortSignal) => Promise<{ prompt?: string; output?: string } | string | void>;
};

export type AiJobSnapshot = Omit<AiJob, "run">;

export type AiSchedulerSnapshot = {
  activeJob: AiJobSnapshot | null;
  queuedJobs: AiJobSnapshot[];
  recentJobs: AiJobSnapshot[];
  pausedBackground: boolean;
  isUserJobRunning: boolean;
  queuedUserJobs: number;
  queuedBackgroundJobs: number;
};

type Listener = () => void;

const MAX_RECENT = 20;

function snapshotOf(job: AiJob): AiJobSnapshot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { run, ...rest } = job;
  return rest;
}

function sortJobs(jobs: AiJob[]): AiJob[] {
  return [...jobs].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.createdAt - b.createdAt;
  });
}

const EMPTY_SNAPSHOT: AiSchedulerSnapshot = {
  activeJob: null,
  queuedJobs: [],
  recentJobs: [],
  pausedBackground: false,
  isUserJobRunning: false,
  queuedUserJobs: 0,
  queuedBackgroundJobs: 0,
};

class AiScheduler {
  private queue: AiJob[] = [];
  private activeJob: AiJob | null = null;
  private activeController: AbortController | null = null;
  private recentJobs: AiJobSnapshot[] = [];
  private pausedBackground = false;
  private listeners: Set<Listener> = new Set();
  private draining = false;
  private drainTail: Promise<void> = Promise.resolve();
  private snapshot: AiSchedulerSnapshot = EMPTY_SNAPSHOT;

  enqueueAiJob(job: Omit<AiJob, "id" | "createdAt" | "status">): string {
    const id = crypto.randomUUID();
    const fullJob: AiJob = {
      ...job,
      id,
      createdAt: Date.now(),
      status: "queued",
    };
    this.queue.push(fullJob);
    this.notify();
    this.requestDrain();
    return id;
  }

  cancelQueuedJobs(filter: {
    type?: AiJobType;
    conversationId?: string;
  }): void {
    let changed = false;
    this.queue = this.queue.filter((job) => {
      const matchesType = !filter.type || job.type === filter.type;
      const matchesConversation =
        !filter.conversationId || job.conversationId === filter.conversationId;
      if (matchesType && matchesConversation) {
        job.status = "cancelled";
        job.finishedAt = Date.now();
        this.recentJobs.unshift(snapshotOf(job));
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) {
      this.trimRecent();
      this.notify();
    }
  }

  cancelAiJob(jobId: string): void {
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx !== -1) {
      const job = this.queue[idx];
      this.queue.splice(idx, 1);
      job.status = "cancelled";
      job.finishedAt = Date.now();
      this.recentJobs.unshift(snapshotOf(job));
      this.trimRecent();
      this.notify();
      return;
    }
    if (this.activeJob?.id === jobId) {
      this.activeController?.abort();
    }
  }

  cancelAiJobsByConversation(conversationId: string): void {
    this.queue = this.queue.filter((j) => {
      if (j.conversationId === conversationId) {
        j.status = "cancelled";
        j.finishedAt = Date.now();
        this.recentJobs.unshift(snapshotOf(j));
        return false;
      }
      return true;
    });
    this.trimRecent();
    if (this.activeJob?.conversationId === conversationId) {
      this.activeController?.abort();
    }
    this.notify();
  }

  pauseBackgroundJobs(): void {
    this.pausedBackground = true;
    this.notify();
  }

  resumeBackgroundJobs(): void {
    this.pausedBackground = false;
    this.notify();
    this.requestDrain();
  }

  getSchedulerSnapshot(): AiSchedulerSnapshot {
    return this.snapshot;
  }

  private rebuildSnapshot(): void {
    const queued = sortJobs(this.queue);
    const queuedUserJobs = queued.filter((j) => j.priority === 0).length;
    const queuedBackgroundJobs = queued.filter((j) => j.priority > 0).length;
    this.snapshot = {
      activeJob: this.activeJob ? snapshotOf(this.activeJob) : null,
      queuedJobs: queued.map(snapshotOf),
      recentJobs: [...this.recentJobs],
      pausedBackground: this.pausedBackground,
      isUserJobRunning: this.activeJob?.priority === 0,
      queuedUserJobs,
      queuedBackgroundJobs,
    };
  }

  subscribeToScheduler(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.rebuildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private trimRecent(): void {
    if (this.recentJobs.length > MAX_RECENT) {
      this.recentJobs.length = MAX_RECENT;
    }
  }

  private requestDrain(): void {
    this.drainTail = this.drainTail
      .then(() => this.runDrainLoop())
      .catch(() => this.runDrainLoop());
  }

  private async runDrainLoop(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (true) {
        if (this.activeJob) break;

        const sorted = sortJobs(this.queue);
        const next = sorted.find((job) => job.priority === 0) ?? (this.pausedBackground ? undefined : sorted[0]);
        if (!next) break;

        this.queue = this.queue.filter((j) => j.id !== next.id);
        this.activeJob = next;
        next.status = "running";
        next.startedAt = Date.now();
        this.notify();

        const controller = new AbortController();
        this.activeController = controller;

        try {
          const result = await next.run(controller.signal);
          if (result !== undefined && result !== null) {
            if (typeof result === "string") {
              if (!next.output) next.output = result;
            } else {
              if (result.prompt && !next.prompt) next.prompt = result.prompt;
              if (result.output && !next.output) next.output = result.output;
            }
          }
          if (next.status === "running") {
            next.status = "completed";
            next.finishedAt = Date.now();
          }
        } catch (err: unknown) {
          if (controller.signal.aborted) {
            if (next.status === "running") {
              next.status = "aborted";
              next.finishedAt = Date.now();
            }
          } else if (next.status === "running") {
            next.status = "failed";
            next.finishedAt = Date.now();
            next.error = err instanceof Error ? err.message : "Unknown error";
          }
        }

        this.recentJobs.unshift(snapshotOf(next));
        this.trimRecent();
        this.activeJob = null;
        this.activeController = null;
        this.notify();
      }
    } finally {
      this.draining = false;
    }
  }

  /** Cancel all queued and active jobs (app exit). */
  shutdown(): void {
    const now = Date.now();
    for (const job of this.queue) {
      job.status = "cancelled";
      job.finishedAt = now;
      this.recentJobs.unshift(snapshotOf(job));
    }
    this.queue = [];
    this.trimRecent();

    if (this.activeJob) {
      this.activeJob.status = "aborted";
      this.activeJob.finishedAt = now;
      this.recentJobs.unshift(snapshotOf(this.activeJob));
      this.trimRecent();
      this.activeController?.abort();
      this.activeJob = null;
      this.activeController = null;
    }

    this.notify();
  }

  /** Abort the active background job (priority > 0). */
  abortActiveBackgroundJob(): boolean {
    if (this.activeJob && this.activeJob.priority > 0) {
      this.activeJob.status = "aborted";
      this.activeJob.finishedAt = Date.now();
      this.activeController?.abort();
      return true;
    }
    return false;
  }

  hasUserJobQueued(): boolean {
    return this.queue.some((j) => j.priority === 0);
  }

  isBackgroundPaused(): boolean {
    return this.pausedBackground;
  }
}

export const aiScheduler = new AiScheduler();

export const JOB_LABELS: Record<AiJobType, string> = {
  user_chat: "User message",
  auto_name_chat: "Naming chat",
  summarize_chat: "Summarizing chat",
  extract_memory: "Extracting memories",
  compress_context: "Compressing context",
  maintenance: "Maintenance",
};
