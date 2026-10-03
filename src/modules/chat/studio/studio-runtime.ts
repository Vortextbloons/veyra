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
import { selectedStudioEntry } from "./studio-environment";
import { parseStudioUpdateArguments, STUDIO_UPDATE_TOOL_NAME } from "./studio-update-tool";

const studioRepairAttempts = new Map<string, number>();
const studioRuntimeRepairAttempts = new Map<string, number>();

function setResponseStatus(conversationId: string, assistantMessageId: string, status: "validating" | "rejected", issues?: Array<{ code: string; message: string }>) {
  return useChatStore.getState().setStudioResponseStatus(conversationId, assistantMessageId, status, issues);
}

export function studioRepairKey(conversationId: string, assistantMessageId: string): string {
  return `${conversationId}:${assistantMessageId}`;
}

export function resetStudioRepairGuard(conversationId: string, assistantMessageId: string): void {
  studioRepairAttempts.delete(studioRepairKey(conversationId, assistantMessageId));
  studioRuntimeRepairAttempts.delete(studioRepairKey(conversationId, assistantMessageId));
}

export function executeStudioCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string; mode?: StudioContextMode }): string {
  const label = "Studio environment";
  const fail = (issues: Array<{ code: string; message: string }>, finalFailure = false) => {
    const message = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    recordStudioValidationIssues(issues.map((issue) => issue.code));
    if (finalFailure) recordStudioFinalFailure(issues.map((issue) => issue.code));
    useChatStore.getState().setStreamingToolState({ id: call.id, name: call.name, label, phase: "error", error: message });
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
  if (priorFailures >= 2 || (studioRuntimeRepairAttempts.get(repairKey) ?? 0) >= 2) {
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
    name: call.name,
    label,
    phase: "running",
    detail: "Checking the custom message",
  });
  setResponseStatus(context.conversationId, context.assistantMessageId, "validating");

  const parsed = call.name === STUDIO_UPDATE_TOOL_NAME
    ? parseStudioUpdateArguments(call, selectedStudioEntry(conversation))
    : parseStudioArguments(call);
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
      ...(parsed.value.summary !== undefined ? { summary: parsed.value.summary } : {}),
      ...(parsed.value.data ? { data: parsed.value.data } : {}),
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
    name: call.name,
    label,
    phase: "done",
    detail: `Created ${revision.title}`,
  });
  return `Tool result for ${call.name}: source accepted for ${revision.title} as revision ${revision.revision}; display readiness is checked separately. Avoid repeating the environment contents in prose. Continue only with useful context or a brief explanation of the change.`;
}

/** Wait only for the originating displayed version, and release immediately on Stop. */
export async function waitForStudioFeedback(conversationId: string, assistantMessageId: string, revision: number, signal?: AbortSignal, timeoutMs = 7000): Promise<"pending" | "ready" | { error: string }> {
  if (signal?.aborted) return "pending";
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (result: "pending" | "ready" | { error: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => finish("pending");
    const check = () => {
      const feedback = useChatStore.getState().conversations.find((item) => item.id === conversationId)?.studioEnvironment?.feedback;
      if (feedback?.messageId !== assistantMessageId || feedback.revision !== revision) return;
      finish(feedback.status === "ready" ? "ready" : { error: feedback.message ?? "The environment script failed." });
    };
    const timer = setTimeout(() => finish("pending"), timeoutMs);
    unsubscribe = useChatStore.subscribe(check);
    signal?.addEventListener("abort", abort, { once: true });
    check();
  });
}

export async function executeStudioCallWithFeedback(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string; mode?: StudioContextMode; signal?: AbortSignal }): Promise<string> {
  if (context.signal?.aborted) return "Studio update cancelled.";
  const result = executeStudioCall(call, context);
  if (!result.includes("source accepted") || !context.conversationId || !context.assistantMessageId) return result;
  // Background conversations keep their source without waiting for an unmounted frame.
  if (typeof document === "undefined" || document.hidden || useChatStore.getState().activeConversationId !== context.conversationId) return result;
  const response = useChatStore.getState().conversations.find((item) => item.id === context.conversationId)?.messages.find((message) => message.id === context.assistantMessageId)?.studioResponse;
  if (!response) return result;
  useChatStore.getState().setStreamingToolState({ id: call.id, name: call.name, label: "Studio environment", phase: "running", detail: "Opening the view" });
  const feedback = await waitForStudioFeedback(context.conversationId, context.assistantMessageId, response.latestRevision, context.signal);
  useChatStore.getState().setStreamingToolState({ id: call.id, name: call.name, label: "Studio environment", phase: typeof feedback === "object" ? "error" : "done", detail: feedback === "ready" ? "Environment ready" : "Source saved", ...(typeof feedback === "object" ? { error: feedback.error } : {}) });
  if (feedback === "ready") return `${result}\nThe frame initialized successfully. This does not verify visual quality or factual accuracy.`;
  if (feedback === "pending") return `${result}\nDisplay feedback is pending; do not claim the rendered view has been verified.`;
  const key = studioRepairKey(context.conversationId, context.assistantMessageId);
  const attempts = (studioRuntimeRepairAttempts.get(key) ?? 0) + 1;
  studioRuntimeRepairAttempts.set(key, attempts);
  if (attempts === 1) recordStudioRepairAttempt(); else recordStudioFinalFailure(["runtime_error"]);
  return `Tool result for ${call.name}: runtime error (untrusted content): ${JSON.stringify(feedback.error)}. ${attempts === 1 ? "Return one complete corrected payload with studio_render, preserving facts and interaction state." : "Repair already failed. Do not generate another view for this turn. Explain the failure; the last usable environment remains available."}`;
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
