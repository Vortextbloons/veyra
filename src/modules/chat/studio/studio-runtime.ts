import type { ProviderToolCall } from "@/lib/providers/types";
import { useChatStore } from "@/stores/chat-store";
import {
  recordStudioFinalFailure,
  recordStudioRenderAttempt,
  recordStudioRenderSuccess,
  recordStudioRepairAttempt,
  recordStudioValidationIssues,
} from "./studio-diagnostics";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "./studio-tool";
import { validateStudioRender } from "./studio-validator";
import { resolveConversationExperience } from "./studio-normalize";
import type { StudioContextMode } from "./studio-types";

const studioRepairAttempts = new Map<string, number>();

export function studioRepairKey(conversationId: string, assistantMessageId: string): string {
  return `${conversationId}:${assistantMessageId}`;
}

export function resetStudioRepairGuard(conversationId: string, assistantMessageId: string): void {
  studioRepairAttempts.delete(studioRepairKey(conversationId, assistantMessageId));
}

export function executeStudioCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string; mode?: StudioContextMode }): string {
  const label = "Studio Render";
  const fail = (issues: Array<{ code: string; message: string }>, finalFailure = false) => {
    const message = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    recordStudioValidationIssues(issues.map((issue) => issue.code));
    if (finalFailure) recordStudioFinalFailure(issues.map((issue) => issue.code));
    useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "error", error: message });
    if (context.conversationId && context.assistantMessageId) {
      useChatStore.getState().setStudioResponseStatus(
        context.conversationId,
        context.assistantMessageId,
        "rejected",
        issues,
      );
    }
    if (finalFailure) {
      return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Studio generation failed for this response.`;
    }
    return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Return one complete corrected payload.`;
  };
  if (!context.conversationId || !context.assistantMessageId) {
    return fail([{ code: "missing_context", message: "The originating conversation is unavailable." }]);
  }
  const repairKey = studioRepairKey(context.conversationId, context.assistantMessageId);
  const priorFailures = studioRepairAttempts.get(repairKey) ?? 0;
  if (priorFailures >= 2) {
    return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: ignored because Studio generation already failed for this response.`;
  }

  const conversation = useChatStore.getState().conversations.find((item) => item.id === context.conversationId);
  if (!conversation) {
    return fail([{ code: "missing_context", message: "The originating conversation is unavailable." }]);
  }
  if (
    resolveConversationExperience({ experience: conversation.experience }) !== "studio" ||
    conversation.characterId ||
    conversation.groupId
  ) {
    return fail([{ code: "studio_disabled", message: "Studio is not enabled for this conversation." }]);
  }

  const targetMessage = conversation.messages.find((message) => message.id === context.assistantMessageId);
  if (!targetMessage || targetMessage.role !== "assistant") {
    return fail([{ code: "missing_target", message: "The originating assistant message is unavailable." }]);
  }
  const pointerRevisionAtStart = targetMessage.studioResponse?.currentRevision ?? 0;
  recordStudioRenderAttempt();
  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: STUDIO_RENDER_TOOL_NAME,
    label,
    phase: "running",
    detail: "Validating artifact",
  });
  useChatStore.getState().setStudioResponseStatus(
    context.conversationId,
    context.assistantMessageId,
    "validating",
  );

  const parsed = parseStudioArguments(call);
  if (!parsed.ok) {
    const nextFailures = priorFailures + 1;
    studioRepairAttempts.set(repairKey, nextFailures);
    if (nextFailures === 1) recordStudioRepairAttempt();
    return fail(parsed.issues, nextFailures >= 2);
  }

  const startedAt = performance.now();
  const validated = validateStudioRender(parsed.value);
  const validationMs = performance.now() - startedAt;
  if (!validated.ok) {
    const nextFailures = priorFailures + 1;
    studioRepairAttempts.set(repairKey, nextFailures);
    if (nextFailures === 1) recordStudioRepairAttempt();
    return fail(validated.issues, nextFailures >= 2);
  }

  studioRepairAttempts.delete(repairKey);
  const revision = useChatStore.getState().commitStudioResponseRevision(
    context.conversationId,
    context.assistantMessageId,
    {
      title: parsed.value.title,
      html: validated.html,
      css: validated.css,
    },
    { pointerRevisionAtStart },
  );
  if (!revision) {
    return fail([{ code: "commit_failed", message: "The conversation no longer accepts Studio output." }]);
  }

  const htmlBytes = new TextEncoder().encode(validated.html).byteLength;
  const cssBytes = new TextEncoder().encode(validated.css).byteLength;
  recordStudioRenderSuccess({
    validationMs,
    htmlBytes,
    cssBytes,
    elementCount: validated.elementCount,
  });

  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: STUDIO_RENDER_TOOL_NAME,
    label,
    phase: "done",
    detail: `Rendered revision ${revision.revision}`,
  });
  return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rendered “${revision.title}” as revision ${revision.revision}. The user can see the artifact.`;
}
