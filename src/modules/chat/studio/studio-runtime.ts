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
import { parseStudioThemeArguments, STUDIO_THEME_TOOL_NAME } from "./studio-theme-tool";
import { deriveStudioTheme } from "./studio-theme";
import { validateStudioRender } from "./studio-validator";
import { resolveConversationExperience } from "./studio-normalize";
import type { StudioContextMode } from "./studio-types";

const studioRepairAttempts = new Map<string, number>();

function setResponseStatus(conversationId: string, assistantMessageId: string, status: "validating" | "rejected", issues?: Array<{ code: string; message: string }>) {
  return useChatStore.getState().setStudioResponseStatus(conversationId, assistantMessageId, status, issues);
}

export function studioRepairKey(conversationId: string, assistantMessageId: string): string {
  return `${conversationId}:${assistantMessageId}`;
}

export function resetStudioRepairGuard(conversationId: string, assistantMessageId: string): void {
  studioRepairAttempts.delete(studioRepairKey(conversationId, assistantMessageId));
}

export function executeStudioCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string; mode?: StudioContextMode }): string {
  const label = "Studio message";
  const fail = (issues: Array<{ code: string; message: string }>, finalFailure = false) => {
    const message = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    recordStudioValidationIssues(issues.map((issue) => issue.code));
    if (finalFailure) recordStudioFinalFailure(issues.map((issue) => issue.code));
    useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "error", error: message });
    if (context.conversationId && context.assistantMessageId) {
      setResponseStatus(context.conversationId, context.assistantMessageId, "rejected", issues);
    }
    return finalFailure
      ? `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. The custom message failed, so continue with a useful conversational answer.`
      : `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Return one complete corrected payload.`;
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
  if (!conversation) return fail([{ code: "missing_context", message: "The originating conversation is unavailable." }]);
  if (resolveConversationExperience(conversation) !== "studio" || conversation.characterId || conversation.groupId) {
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
    detail: "Checking the custom message",
  });
  setResponseStatus(context.conversationId, context.assistantMessageId, "validating");

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
      javascript: validated.javascript,
    },
    { pointerRevisionAtStart },
  );
  if (!revision) return fail([{ code: "commit_failed", message: "The conversation no longer accepts Studio output." }]);

  recordStudioRenderSuccess({
    validationMs,
    htmlBytes: new TextEncoder().encode(validated.html).byteLength,
    cssBytes: new TextEncoder().encode(validated.css).byteLength,
    javascriptBytes: new TextEncoder().encode(validated.javascript ?? "").byteLength,
    elementCount: validated.elementCount,
  });
  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: STUDIO_RENDER_TOOL_NAME,
    label,
    phase: "done",
    detail: `Created ${revision.title}`,
  });
  return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rendered ${revision.title} as revision ${revision.revision}. The user can see the custom message. Continue naturally without restating it.`;
}

export function executeStudioThemeCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string }): string {
  const label = "Studio theme";
  const fail = (code: string, message: string) => {
    useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_THEME_TOOL_NAME, label, phase: "error", error: message });
    return `Tool result for ${STUDIO_THEME_TOOL_NAME}: rejected. ${code}: ${message}. Continue with a useful conversational answer.`;
  };
  if (!context.conversationId || !context.assistantMessageId) {
    return fail("missing_context", "The originating conversation is unavailable.");
  }
  const conversation = useChatStore.getState().conversations.find((item) => item.id === context.conversationId);
  if (!conversation) return fail("missing_context", "The originating conversation is unavailable.");
  if (resolveConversationExperience(conversation) !== "studio" || conversation.characterId || conversation.groupId) {
    return fail("studio_disabled", "Studio is not enabled for this conversation.");
  }
  const target = conversation.messages.find((message) => message.id === context.assistantMessageId);
  if (!target || target.role !== "assistant") {
    return fail("missing_target", "The originating assistant message is unavailable.");
  }
  const parsed = parseStudioThemeArguments(call);
  if (!parsed.ok) return fail(parsed.issues[0]?.code ?? "invalid_theme", parsed.issues[0]?.message ?? "Theme direction is invalid.");

  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: STUDIO_THEME_TOOL_NAME,
    label,
    phase: "running",
    input: parsed.value.vibe,
    detail: "Styling the conversation",
  });
  const theme = deriveStudioTheme(parsed.value);
  const applied = useChatStore.getState().setStudioMessageTheme(context.conversationId, context.assistantMessageId, theme);
  if (!applied) return fail("commit_failed", "The conversation no longer accepts Studio themes.");
  const detail = theme ? `Applied ${theme.name}` : "Restored Veyra theme";
  useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_THEME_TOOL_NAME, label, phase: "done", input: parsed.value.vibe, detail });
  return `Tool result for ${STUDIO_THEME_TOOL_NAME}: ${detail}. This is the final theme choice for this assistant turn; do not call studio_theme again. Continue naturally without describing implementation details.`;
}
