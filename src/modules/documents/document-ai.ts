import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ChatMessage } from "@/modules/chat/chat-types";

function makeChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

export type AiAssistAction =
  | "improve"
  | "expand"
  | "shorten"
  | "rewrite"
  | "summarize"
  | "custom";

export type AiAssistMessage = {
  role: "user" | "assistant";
  content: string;
  action?: AiAssistAction;
};

const ACTION_PROMPTS: Record<AiAssistAction, string> = {
  improve:
    "Improve the following text for clarity, flow, grammar, and polish. Preserve the original meaning and tone. Return only the improved text, no explanations.",
  expand:
    "Expand the following text with more detail, examples, or explanation. Match the existing tone. Return only the expanded text.",
  shorten:
    "Condense the following text to be more concise while preserving the key meaning. Return only the shortened text.",
  rewrite:
    "Rewrite the following text in a clearer, more polished way. Return only the rewritten text.",
  summarize:
    "Provide a concise summary of the following document. Return only the summary.",
  custom: "",
};

export function buildAiMessages(
  documentContent: string,
  documentTitle: string,
  action: AiAssistAction,
  userPrompt: string,
  selectedText?: string,
  history?: AiAssistMessage[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  const systemContent = `You are a professional writing assistant helping with a document titled "${documentTitle}".

Rules:
- Return ONLY the requested text, no preamble or explanation
- Preserve markdown formatting
- Match the document's existing tone and style
- For edits, return only the changed text unless asked for the full document`;

  messages.push(makeChatMessage("system", systemContent));

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push(makeChatMessage(msg.role, msg.content));
    }
  }

  let userContent: string;

  if (action === "custom") {
    if (selectedText) {
      userContent = `Selected text:\n\n${selectedText}\n\nInstruction: ${userPrompt}`;
    } else {
      const truncated =
        documentContent.length > 8000
          ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
          : documentContent;
      userContent = `Document content:\n\n${truncated}\n\nInstruction: ${userPrompt}`;
    }
  } else if (action === "summarize") {
    const truncated =
      documentContent.length > 8000
        ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
        : documentContent;
    userContent = `${ACTION_PROMPTS[action]}\n\nDocument:\n\n${truncated}`;
  } else if (selectedText) {
    userContent = `${ACTION_PROMPTS[action]}\n\nSelected text:\n\n${selectedText}`;
  } else {
    const truncated =
      documentContent.length > 8000
        ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
        : documentContent;
    userContent = `${ACTION_PROMPTS[action]}\n\nFull document:\n\n${truncated}`;
  }

  messages.push(makeChatMessage("user", userContent));

  return messages;
}

export async function streamAiAssist(options: {
  messages: ChatMessage[];
  onChunk: (content: string, done: boolean) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { messages, onChunk, onError, signal } = options;

  const providerState = useProviderStore.getState();
  const adapter = getProviderAdapter(providerState.selectedProvider);
  if (!adapter) {
    onError("No provider available. Connect to LM Studio first.");
    return;
  }

  const modelSettings = useSettingsStore.getState().getModelSettings(providerState.selectedModel);

  await adapter.sendChat({
    messages,
    model: providerState.selectedModel,
    temperature: modelSettings.temperature,
    maxTokens: modelSettings.maxTokens,
    topP: modelSettings.topP,
    repetitionPenalty: modelSettings.repetitionPenalty,
    contextLength: modelSettings.contextLength,
    signal,
    onChunk,
    onError,
  });
}
