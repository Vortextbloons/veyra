import type { ProviderToolCall } from "@/lib/providers/types";
import { useChatStore } from "@/stores/chat-store";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "./studio-tool";
import { validateStudioArtifact } from "./studio-validator";

export function executeStudioCall(call: ProviderToolCall, context: { conversationId?: string; assistantMessageId?: string }): string {
  const label = "Studio Render";
  const fail = (issues: Array<{ code: string; message: string }>) => {
    const message = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "error", error: message });
    return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rejected. ${message}. Return one complete corrected payload.`;
  };
  if (!context.conversationId || !context.assistantMessageId) return fail([{ code: "missing_context", message: "The originating conversation is unavailable." }]);
  const conversation = useChatStore.getState().conversations.find((item) => item.id === context.conversationId);
  if (conversation?.presentationMode !== "studio") return fail([{ code: "studio_disabled", message: "Studio is not enabled for this conversation." }]);
  useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "running", detail: "Validating artifact" });
  const parsed = parseStudioArguments(call);
  if (!parsed.ok) return fail(parsed.issues);
  const validated = validateStudioArtifact(parsed.value);
  if (!validated.ok) return fail(validated.issues);
  const revision = useChatStore.getState().commitStudioRevision(context.conversationId, {
    title: parsed.value.title, html: validated.html, css: validated.css, assistantMessageId: context.assistantMessageId,
  });
  if (!revision) return fail([{ code: "commit_failed", message: "The conversation no longer accepts Studio output." }]);
  useChatStore.getState().setStreamingToolState({ id: call.id, name: STUDIO_RENDER_TOOL_NAME, label, phase: "done", detail: `Rendered revision ${revision.revision}` });
  return `Tool result for ${STUDIO_RENDER_TOOL_NAME}: rendered “${revision.title}” as revision ${revision.revision}. The user can see the artifact.`;
}

