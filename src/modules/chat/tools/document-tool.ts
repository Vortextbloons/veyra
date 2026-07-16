import type { ProviderToolCall } from "@/lib/providers/types";
import {
  DOC_CREATE_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  INLINE_EDIT_TOOL_NAME,
} from "@/lib/tool-registry";
import {
  stringArg,
  docCreateIntentFromToolCall,
  docReadIntentFromToolCall,
  docUpdateIntentFromToolCall,
  inlineEditIntentFromToolCall,
  registerStreamingToolCall,
  registerStreamingToolCalls,
} from "@/modules/chat/chat-tool-utils";
import {
  executeDocCreation,
  executeDocRead,
  executeDocUpdate,
  executeInlineEdit,
  resolveDocumentIdReference,
} from "@/modules/documents/document-runtime";
import { useChatStore } from "@/stores/chat-store";

const TOOL_RETRY_LIMIT = 2;

export async function executeDocReadCall(
  call: ProviderToolCall,
  preferredDocumentId?: string,
): Promise<string> {
  const chatStore = useChatStore.getState();
  const label = "Read Document";
  const documentId = stringArg(call.arguments, "documentId");
  registerStreamingToolCall(call, "running", documentId);

  const parsedIntent = docReadIntentFromToolCall(call);
  const intent = parsedIntent
    ? { ...parsedIntent, documentId: resolveDocumentIdReference(parsedIntent.documentId, preferredDocumentId) }
    : null;
  if (!intent) {
    const error = "Invalid doc_read tool arguments.";
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      error,
    });
    return `Tool result for ${DOC_READ_TOOL_NAME}: ${error}`;
  }

  const docResult = await executeDocRead(intent);
  if (!docResult.applied || !docResult.documentContent) {
    const error = docResult.error ?? docResult.sanitizedText;
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      input: documentId,
      error,
    });
    return `Tool result for ${DOC_READ_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}): ${error}`;
  }

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "done",
    input: intent.documentId,
    detail: docResult.sanitizedText,
  });
  return `Tool result for ${DOC_READ_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${docResult.documentContent}`;
}

type DocMutationContext = {
  retryWithLLM: (
    assistantContent: string,
    errorMessage: string,
  ) => Promise<ProviderToolCall[]>;
  conversationId?: string;
  preferredDocumentId?: string;
};

export async function executeDocMutationCalls(
  mutationCalls: ProviderToolCall[],
  ctx: DocMutationContext,
): Promise<{ sections: string[]; streamedChunks: string[]; lastCreatedDocumentId?: string }> {
  const chatStore = useChatStore.getState();
  const sections: string[] = [];
  const streamedChunks: string[] = [];
  let lastCreatedDocumentId: string | undefined;
  let callsToProcess = mutationCalls.filter(
    (call) => call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
  );

  registerStreamingToolCalls(callsToProcess, "running", (call) =>
    stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId"),
  );

  for (let attempt = 0; attempt <= TOOL_RETRY_LIMIT; attempt += 1) {
    const failed: string[] = [];
    sections.length = 0;
    streamedChunks.length = 0;

    for (const call of callsToProcess) {
      const label =
        call.name === DOC_CREATE_TOOL_NAME ? "Create Document" : "Update Document";
      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: attempt > 0 ? "retrying" : "running",
        attempts: attempt > 0 ? attempt : undefined,
        input: stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId"),
      });

      if (call.name === DOC_CREATE_TOOL_NAME) {
        const intent = docCreateIntentFromToolCall(call);
        if (!intent) {
          const error = "Invalid doc_create tool arguments.";
          failed.push(error);
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "error",
            error,
          });
          sections.push(`Tool result for ${DOC_CREATE_TOOL_NAME}: ${error}`);
          continue;
        }
        const docResult = await executeDocCreation(intent, ctx.conversationId);
        if (!docResult.applied) {
          const error = docResult.error ?? docResult.sanitizedText;
          failed.push(error);
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "error",
            error,
          });
          sections.push(`Tool result for ${DOC_CREATE_TOOL_NAME}: ${error}`);
          continue;
        }
        chatStore.setStreamingToolState({
          id: call.id,
          name: call.name,
          label,
          phase: "done",
          detail: docResult.sanitizedText,
          input: intent.title,
        });
        sections.push(
          `Tool result for ${DOC_CREATE_TOOL_NAME}(${JSON.stringify({ title: intent.title })}):\n\n${docResult.sanitizedText}${docResult.documentId ? `\nDocument id: ${docResult.documentId}` : ""}`,
        );
        lastCreatedDocumentId = docResult.documentId ?? lastCreatedDocumentId;
        streamedChunks.push(docResult.sanitizedText);
      } else {
        const parsedIntent = docUpdateIntentFromToolCall(call);
        const intent = parsedIntent
          ? {
              ...parsedIntent,
              documentId: resolveDocumentIdReference(
                parsedIntent.documentId,
                ctx.preferredDocumentId ?? lastCreatedDocumentId,
              ),
            }
          : null;
        if (!intent) {
          const error = "Invalid doc_update tool arguments.";
          failed.push(error);
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "error",
            error,
          });
          sections.push(`Tool result for ${DOC_UPDATE_TOOL_NAME}: ${error}`);
          continue;
        }
        const docResult = await executeDocUpdate(intent, ctx.conversationId);
        if (!docResult.applied) {
          const error = docResult.error ?? docResult.sanitizedText;
          failed.push(error);
          chatStore.setStreamingToolState({
            id: call.id,
            name: call.name,
            label,
            phase: "error",
            error,
          });
          sections.push(`Tool result for ${DOC_UPDATE_TOOL_NAME}: ${error}`);
          continue;
        }
        chatStore.setStreamingToolState({
          id: call.id,
          name: call.name,
          label,
          phase: "done",
          detail: docResult.sanitizedText,
          input: intent.documentId,
        });
        sections.push(
          `Tool result for ${DOC_UPDATE_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${docResult.sanitizedText}`,
        );
        streamedChunks.push(docResult.sanitizedText);
      }
    }

    if (failed.length === 0 || attempt >= TOOL_RETRY_LIMIT) break;

    const retryToolCalls = await ctx.retryWithLLM(
      "",
      failed.join("; "),
    );
    const nextCalls = retryToolCalls.filter(
      (call) =>
        call.name === DOC_CREATE_TOOL_NAME || call.name === DOC_UPDATE_TOOL_NAME,
    );
    if (nextCalls.length === 0) break;
    callsToProcess = nextCalls;
  }

  return { sections, streamedChunks, lastCreatedDocumentId };
}

export async function executeInlineEditCall(
  call: ProviderToolCall,
  conversationId?: string,
  preferredDocumentId?: string,
): Promise<string> {
  const chatStore = useChatStore.getState();
  const label = "Inline Edit";
  const documentId = stringArg(call.arguments, "documentId");
  registerStreamingToolCall(call, "running", documentId);

  const parsedIntent = inlineEditIntentFromToolCall(call);
  const intent = parsedIntent
    ? { ...parsedIntent, documentId: resolveDocumentIdReference(parsedIntent.documentId, preferredDocumentId) }
    : null;
  if (!intent) {
    const error = "Invalid inline_edit tool arguments.";
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      error,
    });
    return `Tool result for ${INLINE_EDIT_TOOL_NAME}: ${error}`;
  }

  const result = await executeInlineEdit(intent, conversationId);
  if (!result.applied) {
    const error = result.error ?? result.sanitizedText;
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      input: documentId,
      error,
    });
    return `Tool result for ${INLINE_EDIT_TOOL_NAME}: ${error}`;
  }

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "done",
    input: intent.documentId,
    detail: result.sanitizedText,
  });

  return `Tool result for ${INLINE_EDIT_TOOL_NAME}(${JSON.stringify({ documentId: intent.documentId })}):\n\n${result.sanitizedText}`;
}
