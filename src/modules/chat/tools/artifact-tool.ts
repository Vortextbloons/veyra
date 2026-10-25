import type { ProviderToolCall } from "@/lib/providers/types";
import { CREATE_ARTIFACT_TOOL_NAME } from "@/lib/tool-registry";
import { normalizeArtifact } from "@/modules/chat/artifact";
import { useChatStore } from "@/stores/chat-store";

type ArtifactToolContext = {
  signal?: AbortSignal;
  conversationId?: string;
  assistantMessageId: string;
};

function setToolState(
  context: ArtifactToolContext,
  call: ProviderToolCall,
  phase: "running" | "done" | "error",
  detail?: string,
): void {
  if (!context.conversationId) return;
  const format = typeof call.arguments.format === "string" ? call.arguments.format : "artifact";
  const title = typeof call.arguments.title === "string" ? call.arguments.title.trim().slice(0, 80) : "";
  useChatStore.getState().setAssistantToolState(context.conversationId, context.assistantMessageId, {
    id: call.id,
    name: CREATE_ARTIFACT_TOOL_NAME,
    label: "Create artifact",
    phase,
    input: [format, title].filter(Boolean).join(" · "),
    detail: phase === "done" ? detail : undefined,
    error: phase === "error" ? detail : undefined,
  });
}

export function executeArtifactCall(call: ProviderToolCall, context: ArtifactToolContext): string {
  const { conversationId, assistantMessageId, signal } = context;
  setToolState(context, call, "running");

  if (signal?.aborted) return fail(context, call, "Cancelled before saving.");
  if (!conversationId) return fail(context, call, "The conversation is no longer available.");

  const owner = useChatStore.getState().conversations
    .find((conversation) => conversation.id === conversationId)
    ?.messages.find((message) => message.id === assistantMessageId && message.role === "assistant");
  if (!owner) return fail(context, call, "This assistant response is no longer available.");
  if (owner.artifact) return fail(context, call, "This response already has an artifact.");

  const normalized = normalizeArtifact(call.arguments, crypto.randomUUID());
  if (!normalized.ok) return fail(context, call, normalized.error);
  if (signal?.aborted) return fail(context, call, "Cancelled before saving.");

  const stored = useChatStore.getState().setAssistantArtifact(
    conversationId,
    assistantMessageId,
    normalized.artifact,
  );
  if (!stored) return fail(context, call, "The artifact could not be attached to this response.");

  const { title, format } = normalized.artifact;
  const detail = `Saved ${format} artifact: ${title}`;
  setToolState(context, call, "done", detail);
  return `Tool result for ${CREATE_ARTIFACT_TOOL_NAME}: ${detail}. The complete artifact is attached to this reply. Continue with a brief sentence and do not repeat its content.`;
}

function fail(context: ArtifactToolContext, call: ProviderToolCall, message: string): string {
  setToolState(context, call, "error", message);
  return `Tool result for ${CREATE_ARTIFACT_TOOL_NAME}: ${message}`;
}
