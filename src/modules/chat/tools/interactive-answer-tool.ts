import type { ProviderToolCall } from "@/lib/providers/types";
import { INTERACTIVE_ANSWER_TOOL_NAME } from "@/lib/tool-registry";
import { normalizeInteractiveAnswer } from "@/modules/chat/interactive-answer";
import { useChatStore } from "@/stores/chat-store";

type InteractiveAnswerToolContext = {
  signal?: AbortSignal;
  conversationId?: string;
  assistantMessageId: string;
};

function setToolState(
  context: InteractiveAnswerToolContext,
  call: ProviderToolCall,
  phase: "running" | "done" | "error",
  detail?: string,
): void {
  if (!context.conversationId) return;
  useChatStore.getState().setAssistantToolState(context.conversationId, context.assistantMessageId, {
    id: call.id,
    name: INTERACTIVE_ANSWER_TOOL_NAME,
    label: "Interactive answer",
    phase,
    input: typeof call.arguments.title === "string" ? call.arguments.title.slice(0, 80) : undefined,
    detail: phase === "done" ? detail : undefined,
    error: phase === "error" ? detail : undefined,
  });
}

export function executeInteractiveAnswerCall(
  call: ProviderToolCall,
  context: InteractiveAnswerToolContext,
): string {
  const { conversationId, assistantMessageId, signal } = context;
  setToolState(context, call, "running");

  if (signal?.aborted) {
    setToolState(context, call, "error", "Cancelled before rendering.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": cancelled before rendering.";
  }
  if (!conversationId) {
    setToolState(context, call, "error", "The conversation is no longer available.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": the conversation is no longer available.";
  }

  const owner = useChatStore.getState().conversations
    .find((conversation) => conversation.id === conversationId)
    ?.messages.find((message) => message.id === assistantMessageId && message.role === "assistant");
  if (!owner) {
    setToolState(context, call, "error", "This assistant response is no longer available.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": this assistant response is no longer available.";
  }
  if (owner.interactiveAnswer) {
    setToolState(context, call, "error", "Only one interactive answer can be attached to a response.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": only one interactive answer can be attached to a response.";
  }

  const normalized = normalizeInteractiveAnswer(call.arguments, call.id);
  if (!normalized.ok) {
    setToolState(context, call, "error", normalized.error);
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": " + normalized.error;
  }
  if (signal?.aborted) {
    setToolState(context, call, "error", "Cancelled before rendering.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": cancelled before rendering.";
  }

  const stored = useChatStore.getState().setAssistantInteractiveAnswer(
    conversationId,
    assistantMessageId,
    normalized.answer,
  );
  if (!stored) {
    setToolState(context, call, "error", "This assistant response is no longer available.");
    return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": this assistant response is no longer available.";
  }

  const detail = "Rendered " + normalized.answer.kind + ": " + normalized.answer.title;
  setToolState(context, call, "done", detail);
  return "Tool result for " + INTERACTIVE_ANSWER_TOOL_NAME + ": " + detail + ". Continue with a concise response without repeating the interactive answer.";
}
