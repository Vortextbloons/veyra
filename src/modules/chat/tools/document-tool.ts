import type { ProviderToolCall } from "@/lib/providers/types";
import {
  DOC_CREATE_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
} from "@/lib/tool-registry";
import {
  stringArg,
  docCreateIntentFromToolCall,
  docReadIntentFromToolCall,
  docUpdateIntentFromToolCall,
  registerStreamingToolCall,
  registerStreamingToolCalls,
} from "@/modules/chat/chat-tool-utils";
import {
  executeDocCreation,
  executeDocRead,
  executeDocUpdate,
} from "@/modules/documents/document-runtime";
import { useChatStore } from "@/stores/chat-store";

const TOOL_RETRY_LIMIT = 2;

export async function executeDocReadCall(call: ProviderToolCall): Promise<string> {
  const chatStore = useChatStore.getState();
  const label = "Read Document";
  const documentId = stringArg(call.arguments, "documentId");
  registerStreamingToolCall(call, "running", documentId);

  const intent = docReadIntentFromToolCall(call);
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
};

export async function executeDocMutationCalls(
  mutationCalls: ProviderToolCall[],
  ctx: DocMutationContext,
): Promise<{ sections: string[]; streamedChunks: string[] }> {
  const chatStore = useChatStore.getState();
  const sections: string[] = [];
  const streamedChunks: string[] = [];
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
          `Tool result for ${DOC_CREATE_TOOL_NAME}(${JSON.stringify({ title: intent.title })}):\n\n${docResult.sanitizedText}`,
        );
        streamedChunks.push(docResult.sanitizedText);
      } else {
        const intent = docUpdateIntentFromToolCall(call);
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

  return { sections, streamedChunks };
}
