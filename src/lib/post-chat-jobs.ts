import { runAutoNameForConversation, resolveAutoNameModel } from "@/lib/auto-name";
import { shouldSummarizeConversation, runSummarizeForConversation } from "@/modules/chat/chat-summarize";
import { runPostChatModelPipeline } from "@/lib/lm-model-session";
import { aiScheduler } from "@/lib/ai-scheduler";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

type PostChatJobOptions = {
  conversationId: string;
  chatModel: string;
  providerId: string;
  userMessage: string;
  assistantMessage: string;
  assistantMessageId?: string;
  /** Only the first user turn should trigger auto-naming. */
  isFirstExchange?: boolean;
};

function resolvePostChatModels(chatModel: string): {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
} {
  const chat = chatModel.trim();
  const { titleModel } = resolveAutoNameModel(chat);
  const settings = useSettingsStore.getState();
  const summaryModel = settings.summaryModel.trim() || chat;
  return { chatModel: chat, titleModel, summaryModel };
}

function planPostChatWork(options: {
  chatModel: string;
  isFirstExchange: boolean;
  conversationId: string;
}): { willTitle: boolean; willSummarize: boolean; titleModel: string; summaryModel: string } {
  const settings = useSettingsStore.getState();
  const { titleModel, summaryModel } = resolvePostChatModels(options.chatModel);
  const willTitle = settings.autoNameEnabled && options.isFirstExchange;

  const conv = useChatStore.getState().conversations.find((c) => c.id === options.conversationId);
  const contextLimit = settings.getModelSettings(options.chatModel).contextLength;
  const willSummarize =
    settings.autoSummarizeChats &&
    Boolean(conv && shouldSummarizeConversation(conv.messages, contextLimit));

  return { willTitle, willSummarize, titleModel, summaryModel };
}

/** Call after user chat completes, before enqueueing background work. */
export async function handoffAfterUserChat(options: {
  chatModel: string;
  conversationId: string;
  isFirstExchange: boolean;
  signal?: AbortSignal;
}): Promise<{ willTitle: boolean; willSummarize: boolean }> {
  const plan = planPostChatWork({
    chatModel: options.chatModel,
    isFirstExchange: options.isFirstExchange,
    conversationId: options.conversationId,
  });

  return { willTitle: plan.willTitle, willSummarize: plan.willSummarize };
}

/** One queued job: sequential model load/unload + title then summary. */
export function queuePostChatJobs(options: PostChatJobOptions): void {
  const settings = useSettingsStore.getState();

  const { conversationId, chatModel, providerId, userMessage, assistantMessage } = options;
  if (!assistantMessage.trim()) return;

  if (!settings.backgroundJobsEnabled) return;
  if (!chatModel.trim()) return;

  const plan = planPostChatWork({
    chatModel,
    isFirstExchange: options.isFirstExchange ?? false,
    conversationId,
  });

  if (!plan.willTitle && !plan.willSummarize) {
    return;
  }

  aiScheduler.cancelQueuedJobs({ type: "auto_name_chat", conversationId });
  aiScheduler.cancelQueuedJobs({ type: "summarize_chat", conversationId });
  aiScheduler.cancelQueuedJobs({ type: "maintenance", conversationId });

  const contextLimit = settings.getModelSettings(chatModel).contextLength;
  const description = buildJobDescription(plan);

  aiScheduler.enqueueAiJob({
    type: "maintenance",
    priority: 1,
    title: plan.willTitle ? "Naming chat" : "Updating chat summary",
    description,
    conversationId,
    model: chatModel,
    run: async (signal) => {
      return runPostChatModelPipeline({
        chatModel,
        titleModel: plan.titleModel,
        summaryModel: plan.summaryModel,
        providerId,
        willTitle: plan.willTitle,
        willSummarize: plan.willSummarize,
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
      });
    },
  });
}

function buildJobDescription(plan: {
  willTitle: boolean;
  willSummarize: boolean;
  titleModel: string;
  summaryModel: string;
}): string {
  const parts: string[] = [];
  if (plan.willTitle) parts.push(`title (${plan.titleModel})`);
  if (plan.willSummarize) parts.push(`summary (${plan.summaryModel})`);
  return `Sequential: ${parts.join(" → ")}`;
}
