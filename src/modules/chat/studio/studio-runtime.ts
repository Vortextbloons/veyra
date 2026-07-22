import type { ProviderToolCall } from "@/lib/providers/types";
import { useChatStore } from "@/stores/chat-store";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "./studio-tool";
import { validateStudioArtifact } from "./studio-validator";

const studioRepairAttempts = new Map<string, number>();

export function studioRepairKey(conversationId: string, assistantMessageId: string): string {
  return `${conversationId}:${assistantMessageId}`;
}

export function resetStudioRepairGuard(conversationId: string, assistantMessageId: string): void {
  studioRepairAttempts.delete(studioRepairKey(conversationId, assistantMessageId));
}

export function executeStudioCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string }): string {
  const label = "Studio Render";
  const fail = (issues: Array<{ code: string; message: string }>, finalFailure = false) => {
    const message = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "error", error: message });
    if (finalFailure) {
      return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Studio generation failed for this response.`;
    }
    return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Return one complete corrected payload.`;
  };
  if (!context.conversationId || !context.assistantMessageId) return fail([{ code: "missing_context", message: "The originating conversation is unavailable." }]);
  const repairKey = studioRepairKey(context.conversationId, context.assistantMessageId);
  const priorFailures = studioRepairAttempts.get(repairKey) ?? 0;
  if (priorFailures >= 2) {
    return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: ignored because Studio generation already failed for this response.`;
  }
  const conversation = useChatStore.getState().conversations.find((item) => item.id === context.conversationId);
  if (conversation?.presentationMode !== "studio") return fail([{ code: "studio_disabled", message: "Studio is not enabled for this conversation." }]);
  useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "running", detail: "Validating artifact" });
  const parsed = parseStudioArguments(call);
  if (!parsed.ok) {
    const nextFailures = priorFailures + 1;
    studioRepairAttempts.set(repairKey, nextFailures);
    return fail(parsed.issues, nextFailures >= 2);
  }
  const validated = validateStudioArtifact(parsed.value);
  if (!validated.ok) {
    const nextFailures = priorFailures + 1;
    studioRepairAttempts.set(repairKey, nextFailures);
    return fail(validated.issues, nextFailures >= 2);
  }
  studioRepairAttempts.delete(repairKey);
  const revision = useChatStore.getState().commitStudioRevision(context.conversationId, {
    title: parsed.value.title, html: validated.html, css: validated.css, assistantMessageId: context.assistantMessageId,
  });
  if (!revision) return fail([{ code: "commit_failed", message: "The conversation no longer accepts Studio output." }]);
  useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "done", detail: `Rendered revision ${revision.revision}` });
  return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rendered “${revision.title}” as revision ${revision.revision}. The user can see the artifact.`;
}

