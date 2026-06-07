import { sendLmStudioChat } from "@/lib/lm-studio";
import { AUTO_NAME_SYSTEM, buildAutoNameUserMessage } from "@/lib/prompts";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";

const TITLE_CONTEXT_LENGTH = 2048;
const TITLE_MAX_OUTPUT_TOKENS = 80;
const SNIPPET_MAX_CHARS = 400;

function truncateSnippet(text: string, max = SNIPPET_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function hasThinkMarkup(text: string): boolean {
  return /<\s*think\b/i.test(text) || /<\/\s*think\s*>/i.test(text);
}

function stripThinkBlocks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!hasThinkMarkup(trimmed)) return trimmed;

  let out = trimmed.replace(/[\s\S]*?<\/\s*think\s*>/gi, "").trim();
  out = out.replace(/<\s*think\b[\s\S]*$/gi, "").trim();
  return out || trimmed;
}

function fallbackTitleFromExchange(userMessage: string, assistantMessage: string): string {
  const source = assistantMessage.trim() || userMessage.trim();
  if (!source) return "";

  const line = source.split(/\n/).find((l) => l.trim().length > 0)?.trim() ?? source;
  const words = line.replace(/^#+\s*/, "").split(/\s+/).filter(Boolean).slice(0, 7);
  if (words.length < 2) return "";
  return words.join(" ").slice(0, 80);
}

export function cleanGeneratedTitle(message: string, reasoning: string): string {
  const messageText = stripThinkBlocks(message.trim());
  const reasoningText = stripThinkBlocks(reasoning.trim());

  const candidates: string[] = [];
  if (messageText) candidates.push(messageText);
  if (reasoningText) candidates.push(reasoningText);

  for (const block of candidates) {
    const lines = block
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      let title = line.replace(/^title:\s*/i, "").trim();
      title = title.replace(/^["'`]|["'`]$/g, "").replace(/\.+$/, "").trim();
      if (title.length >= 2 && title.length <= 80 && !/^thinking\.?$/i.test(title)) {
        return title;
      }
    }

    const compact = block.replace(/\s+/g, " ").trim();
    const lastSegment = compact.split(/(?:Title:|title:)\s*/i).pop()?.trim() ?? compact;
    let title = lastSegment.replace(/^["'`]|["'`]$/g, "").replace(/\.+$/, "").trim();
    if (title.length > 80) title = title.slice(0, 80).trim();
    if (title.length >= 2 && title.length <= 80) return title;
  }

  return "";
}

export function resolveAutoNameModel(chatModel: string): {
  chatModel: string;
  titleModel: string;
  usesAlternateModel: boolean;
} {
  const chat = chatModel.trim();
  const configured = useSettingsStore.getState().autoNameModel.trim();
  if (!chat) return { chatModel: "", titleModel: "", usesAlternateModel: false };
  if (!configured || configured === chat) {
    return { chatModel: chat, titleModel: chat, usesAlternateModel: false };
  }

  const available = useProviderStore.getState().models.some((m) => m.id === configured);
  if (!available) {
    return { chatModel: chat, titleModel: chat, usesAlternateModel: false };
  }

  return { chatModel: chat, titleModel: configured, usesAlternateModel: true };
}

export async function generateConversationTitle(options: {
  model: string;
  userMessage: string;
  assistantMessage: string;
  signal?: AbortSignal;
}): Promise<{ prompt: string; title: string }> {
  const { model, userMessage, assistantMessage, signal } = options;
  if (!model.trim()) return { prompt: "", title: "" };

  const userContent = buildAutoNameUserMessage({
    userSnippet: truncateSnippet(userMessage),
    assistantSnippet: truncateSnippet(assistantMessage),
  });
  const fullPrompt = `${AUTO_NAME_SYSTEM}\n\n---\n\n${userContent}`;

  let message = "";
  let reasoning = "";

  await sendLmStudioChat({
    model,
    messages: [
      {
        id: "auto-name-system",
        role: "system",
        content: AUTO_NAME_SYSTEM,
        timestamp: 0,
      },
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
        timestamp: Date.now(),
      },
    ],
    temperature: 0.2,
    contextLength: TITLE_CONTEXT_LENGTH,
    maxTokens: TITLE_MAX_OUTPUT_TOKENS,
    store: false,
    signal,
    onChunk: (chunk) => {
      if (chunk) message += chunk;
    },
    onReasoningChunk: (chunk) => {
      if (chunk) reasoning += chunk;
    },
    onError: () => {},
    onComplete: () => {},
  }).catch((error) => {
    console.warn("[auto-name] Title generation failed:", error);
  });

  const llmTitle = cleanGeneratedTitle(message, reasoning);
  if (llmTitle) return { prompt: fullPrompt, title: llmTitle };

  const fallback = fallbackTitleFromExchange(userMessage, assistantMessage);
  return { prompt: fullPrompt, title: fallback };
}

export async function runAutoNameForConversation(options: {
  conversationId: string;
  chatModel: string;
  userMessage: string;
  assistantMessage: string;
  signal?: AbortSignal;
}): Promise<{ prompt?: string; output?: string } | void> {
  if (!useSettingsStore.getState().autoNameEnabled) return;

  const { conversationId, userMessage, assistantMessage, signal } = options;
  const { titleModel } = resolveAutoNameModel(options.chatModel);

  if (!titleModel || !assistantMessage.trim()) return;

  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  const userMsgCount = conv?.messages.filter((m) => m.role === "user").length ?? 0;
  if (userMsgCount > 1) return;

  const { prompt, title } = await generateConversationTitle({
    model: titleModel,
    userMessage,
    assistantMessage,
    signal,
  });

  const latest = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  const latestUserMsgCount = latest?.messages.filter((m) => m.role === "user").length ?? 0;
  if (title && !signal?.aborted && latest?.title === "New conversation" && latestUserMsgCount <= 1) {
    useChatStore.getState().renameConversation(conversationId, title);
    return { prompt, output: title };
  }
}
