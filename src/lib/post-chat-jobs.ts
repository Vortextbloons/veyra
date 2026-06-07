import { runAutoNameForConversation, resolveAutoNameModel } from "@/lib/auto-name";
import { shouldSummarizeConversation, runSummarizeForConversation } from "@/lib/chat-summarize";
import { shouldExtractMemoryBatch, runMemoryExtractionBatch } from "@/lib/memory-extraction";
import { runMemoryRetentionCleanup } from "@/lib/memory-retention";
import { runPostChatModelPipeline } from "@/lib/lm-model-session";
import { aiScheduler } from "@/lib/ai-scheduler";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

export type PostChatJobOptions = {
  conversationId: string;
  chatModel: string;
  providerId: string;
  userMessage: string;
  assistantMessage: string;
  assistantMessageId?: string;
  /** Only the first user turn should trigger auto-naming. */
  isFirstExchange?: boolean;
};

export type ManualMemoryExtractionOptions = {
  conversationId: string;
  chatModel: string;
  providerId: string;
};

const MEMORY_BATCH_DELAY_MS = 3 * 60 * 1000;
const delayedMemoryTimers = new Map<string, number>();

export function resolvePostChatModels(chatModel: string): {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
  memoryModel: string;
} {
  const chat = chatModel.trim();
  const { titleModel } = resolveAutoNameModel(chat);
  const settings = useSettingsStore.getState();
  const summaryModel = settings.summaryModel.trim() || chat;
  const memoryModel = settings.memoryExtractionModel.trim() || summaryModel || chat;
  return { chatModel: chat, titleModel, summaryModel, memoryModel };
}

export function planPostChatWork(options: {
  chatModel: string;
  isFirstExchange: boolean;
  conversationId: string;
}): { willTitle: boolean; willSummarize: boolean; willExtractMemory: boolean; titleModel: string; summaryModel: string; memoryModel: string } {
  const settings = useSettingsStore.getState();
  const { titleModel, summaryModel, memoryModel } = resolvePostChatModels(options.chatModel);
  const willTitle = settings.autoNameEnabled && options.isFirstExchange;

  const conv = useChatStore.getState().conversations.find((c) => c.id === options.conversationId);
  const contextLimit = settings.getModelSettings(options.chatModel).contextLength;
  const willSummarize =
    settings.autoSummarizeChats &&
    Boolean(conv && shouldSummarizeConversation(conv.messages, contextLimit));
  const willExtractMemory =
    settings.memoryExtractionEnabled &&
    Boolean(conv && shouldExtractMemoryBatch(options.conversationId));

  return { willTitle, willSummarize, willExtractMemory, titleModel, summaryModel, memoryModel };
}

/** Call after user chat completes, before enqueueing background work. */
export async function handoffAfterUserChat(options: {
  chatModel: string;
  conversationId: string;
  isFirstExchange: boolean;
  signal?: AbortSignal;
}): Promise<{ willTitle: boolean; willSummarize: boolean; willExtractMemory: boolean }> {
  const plan = planPostChatWork({
    chatModel: options.chatModel,
    isFirstExchange: options.isFirstExchange,
    conversationId: options.conversationId,
  });

  return { willTitle: plan.willTitle, willSummarize: plan.willSummarize, willExtractMemory: plan.willExtractMemory };
}

/** One queued job: sequential model load/unload + title then summary. */
export function queuePostChatJobs(options: PostChatJobOptions): void {
  const settings = useSettingsStore.getState();

  const { conversationId, chatModel, providerId, userMessage, assistantMessage } = options;
  if (!assistantMessage.trim()) return;

  if (!settings.backgroundJobsEnabled) return;
  if (!chatModel.trim()) return;
  if (settings.memoryExtractionEnabled) {
    useChatStore.getState().markMemoryPending(conversationId);
  }

  const plan = planPostChatWork({
    chatModel,
    isFirstExchange: options.isFirstExchange ?? false,
    conversationId,
  });

  if (plan.willExtractMemory) {
    clearDelayedMemoryTimer(conversationId);
  } else if (settings.memoryExtractionEnabled) {
    scheduleDelayedMemoryExtraction({ conversationId, chatModel, providerId, memoryModel: plan.memoryModel });
  }

  if (!plan.willTitle && !plan.willSummarize && !plan.willExtractMemory) {
    return;
  }

  aiScheduler.cancelQueuedJobs({ type: "auto_name_chat", conversationId });
  aiScheduler.cancelQueuedJobs({ type: "summarize_chat", conversationId });
  aiScheduler.cancelQueuedJobs({ type: "extract_memory", conversationId });
  aiScheduler.cancelQueuedJobs({ type: "maintenance", conversationId });

  const contextLimit = settings.getModelSettings(chatModel).contextLength;
  const description = buildJobDescription(plan);

  aiScheduler.enqueueAiJob({
    type: "maintenance",
    priority: 1,
    title: plan.willTitle ? "Naming chat" : plan.willSummarize ? "Updating chat summary" : "Extracting memories",
    description,
    conversationId,
    model: chatModel,
    run: async (signal) => {
      return runPostChatModelPipeline({
        chatModel,
        titleModel: plan.titleModel,
        summaryModel: plan.summaryModel,
        willTitle: plan.willTitle,
        willSummarize: plan.willSummarize,
        willExtractMemory: plan.willExtractMemory,
        signal,
        runTitle: async () => {
          return runAutoNameForConversation({
            conversationId,
            chatModel,
            userMessage,
            assistantMessage,
            signal,
          });
        },
        runSummary: async () => {
          return runSummarizeForConversation({
            conversationId,
            providerId,
            model: plan.summaryModel,
            contextLimit,
            signal,
          });
        },
        runMemoryExtraction: async () => {
          const result = await runMemoryExtractionBatch({
            conversationId,
            providerId,
            model: plan.memoryModel,
            signal,
          });
          if (!signal.aborted) await runMemoryRetentionCleanup();
          return result;
        },
      });
    },
  });
}

export function queueMemoryExtractionNow(options: ManualMemoryExtractionOptions): void {
  const settings = useSettingsStore.getState();
  if (!settings.backgroundJobsEnabled) return;

  const chatModel = options.chatModel.trim();
  if (!chatModel) return;

  const { memoryModel } = resolvePostChatModels(chatModel);
  useChatStore.getState().markMemoryPending(options.conversationId, Date.now() - MEMORY_BATCH_DELAY_MS);
  clearDelayedMemoryTimer(options.conversationId);
  aiScheduler.cancelQueuedJobs({ type: "extract_memory", conversationId: options.conversationId });

  aiScheduler.enqueueAiJob({
    type: "extract_memory",
    priority: 2,
    title: "Extracting memories",
    description: `Manual memory extraction (${memoryModel})`,
    conversationId: options.conversationId,
    model: memoryModel,
    run: async (signal) => {
      return runPostChatModelPipeline({
        chatModel,
        titleModel: memoryModel,
        summaryModel: memoryModel,
        willTitle: false,
        willSummarize: false,
        willExtractMemory: true,
        signal,
        runTitle: async () => {},
        runSummary: async () => {},
        runMemoryExtraction: async () => {
          const result = await runMemoryExtractionBatch({
            conversationId: options.conversationId,
            providerId: options.providerId,
            model: memoryModel,
            force: true,
            signal,
          });
          if (!signal.aborted) await runMemoryRetentionCleanup();
          return result;
        },
      });
    },
  });
}

function clearDelayedMemoryTimer(conversationId: string): void {
  const existing = delayedMemoryTimers.get(conversationId);
  if (existing !== undefined) {
    window.clearTimeout(existing);
    delayedMemoryTimers.delete(conversationId);
  }
}

/** Cancel all pending delayed memory extraction timers (call on app shutdown). */
export function clearAllDelayedMemoryTimers(): void {
  for (const timer of delayedMemoryTimers.values()) {
    window.clearTimeout(timer);
  }
  delayedMemoryTimers.clear();
}

function scheduleDelayedMemoryExtraction(options: {
  conversationId: string;
  chatModel: string;
  providerId: string;
  memoryModel: string;
}): void {
  clearDelayedMemoryTimer(options.conversationId);
  const timer = window.setTimeout(() => {
    delayedMemoryTimers.delete(options.conversationId);
    if (!useSettingsStore.getState().backgroundJobsEnabled) return;
    if (!useSettingsStore.getState().memoryExtractionEnabled) return;
    if (!shouldExtractMemoryBatch(options.conversationId)) return;

    aiScheduler.cancelQueuedJobs({ type: "extract_memory", conversationId: options.conversationId });
    aiScheduler.enqueueAiJob({
      type: "extract_memory",
      priority: 3,
      title: "Extracting memories",
      description: `Batched memory extraction (${options.memoryModel})`,
      conversationId: options.conversationId,
      model: options.memoryModel,
      run: async (signal) => {
        return runPostChatModelPipeline({
          chatModel: options.chatModel,
          titleModel: options.memoryModel,
          summaryModel: options.memoryModel,
          willTitle: false,
          willSummarize: false,
          willExtractMemory: true,
          signal,
          runTitle: async () => {},
          runSummary: async () => {},
          runMemoryExtraction: async () => {
            const result = await runMemoryExtractionBatch({
              conversationId: options.conversationId,
              providerId: options.providerId,
              model: options.memoryModel,
              signal,
            });
            if (!signal.aborted) await runMemoryRetentionCleanup();
            return result;
          },
        });
      },
    });
  }, MEMORY_BATCH_DELAY_MS);
  delayedMemoryTimers.set(options.conversationId, timer);
}

function buildJobDescription(plan: {
  willTitle: boolean;
  willSummarize: boolean;
  willExtractMemory: boolean;
  titleModel: string;
  summaryModel: string;
  memoryModel: string;
}): string {
  const parts: string[] = [];
  if (plan.willTitle) parts.push(`title (${plan.titleModel})`);
  if (plan.willSummarize) parts.push(`summary (${plan.summaryModel})`);
  if (plan.willExtractMemory) parts.push(`memory batch (${plan.memoryModel})`);
  return `Sequential: ${parts.join(" → ")}`;
}
