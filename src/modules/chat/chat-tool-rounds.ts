import type { ProviderToolCall } from "@/lib/providers/types";
import type { WebSearchSource } from "@/modules/chat/chat-types";
import {
  WEB_SEARCH_TOOL_NAME,
  DOC_READ_TOOL_NAME,
  CODE_EXEC_TOOL_NAME,
  DOC_CREATE_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  SCRATCHPAD_TOOL_NAME,
  ASK_QUESTION_TOOL_NAME,
  INLINE_EDIT_TOOL_NAME,
  STUDIO_RENDER_TOOL_NAME,
} from "@/lib/tool-registry";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
  registerStreamingToolCalls,
} from "@/modules/chat/chat-tool-utils";
import { useChatStore } from "@/stores/chat-store";
import { executeWebSearchCall } from "@/modules/chat/tools/web-search-tool";
import { executeDocReadCall, executeDocMutationCalls, executeInlineEditCall } from "@/modules/chat/tools/document-tool";
import {
  executeCodeExecutionCall,
  type CodeExecutionSettings,
} from "@/modules/chat/tools/code-execution-tool";
import { executeScratchpadCall } from "@/modules/chat/tools/scratchpad-tool";
import { executeAskQuestionCall } from "@/modules/chat/tools/ask-question-tool";
import { disabledMcpServersForChat, findCapabilityGrant, isMcpEnabledForChat, useExtensionsStore } from "@/modules/extensions/extensions-store";
import { invokeMcpTool, mcpCapabilityId, resolveMcpTool } from "@/modules/extensions/mcp-tool-adapter";
import { executeStudioCall } from "@/modules/chat/studio/studio-runtime";

export type ToolRoundResult = {
  toolResultSections: string[];
  webSearchSources: WebSearchSource[];
  webSearchContextBlocks: string[];
  streamedChunks: string[];
  lastCreatedDocumentId?: string;
};

type ToolRoundContext = {
  signal?: AbortSignal;
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  webSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
  retryDocMutationWithLLM: (
    assistantContent: string,
    errorMessage: string,
  ) => Promise<ProviderToolCall[]>;
  docMutationConversationId?: string;
  codeExecution: CodeExecutionSettings;
  preferredDocumentId?: string;
  completedDocumentCreations?: Map<string, { documentId: string; title: string }>;
};

function documentCreationKey(call: ProviderToolCall): string {
  return JSON.stringify({
    title: stringArg(call.arguments, "title"),
    documentType: stringArg(call.arguments, "documentType"),
    contentMarkdown: stringArg(call.arguments, "contentMarkdown"),
  });
}

export async function executeToolRound(
  toolCalls: ProviderToolCall[],
  ctx: ToolRoundContext,
): Promise<ToolRoundResult> {
  const webSearchCalls = toolCalls.filter((call) => call.name === WEB_SEARCH_TOOL_NAME);
  const codeExecutionCalls = toolCalls.filter((call) => call.name === CODE_EXEC_TOOL_NAME);
  const scratchpadCalls = toolCalls.filter((call) => call.name === SCRATCHPAD_TOOL_NAME);
  const askQuestionCalls = toolCalls.filter((call) => call.name === ASK_QUESTION_TOOL_NAME);
  const documentCalls = toolCalls.filter((call) =>
    [DOC_READ_TOOL_NAME, INLINE_EDIT_TOOL_NAME, DOC_CREATE_TOOL_NAME, DOC_UPDATE_TOOL_NAME].includes(call.name),
  );
  const mcpCalls = toolCalls.filter((call) => call.name.startsWith("mcp_"));
  const studioCalls = toolCalls.filter((call) => call.name === STUDIO_RENDER_TOOL_NAME);

  registerStreamingToolCalls(toolCalls, "running", (call) => {
    if (call.name === WEB_SEARCH_TOOL_NAME) return stringArg(call.arguments, "query");
    if (call.name === CODE_EXEC_TOOL_NAME) {
      return summarizeCodeSnippet(stripPythonCodeFence(stringArg(call.arguments, "code")));
    }
    if (call.name === INLINE_EDIT_TOOL_NAME) return stringArg(call.arguments, "documentId");
    return stringArg(call.arguments, "title") || stringArg(call.arguments, "documentId");
  });

  const toolResultSections: string[] = [];
  const webSearchSources: WebSearchSource[] = [];
  const webSearchContextBlocks: string[] = [];
  const streamedChunks: string[] = [];

  for (const call of studioCalls.slice(0, -1)) {
    useChatStore.getState().setStreamingToolState({ id: call.id, name: call.name, label: "Studio Render", phase: "done", detail: "Skipped duplicate render" });
    toolResultSections.push(`Tool result for ${STUDIO_RENDER_TOOL_NAME}: skipped because only the last Studio call in a batch is committed.`);
  }
  const studioCall = studioCalls.at(-1);
  if (studioCall) toolResultSections.push(executeStudioCall(studioCall, { conversationId: ctx.conversationId, assistantMessageId: ctx.assistantMessageId }));

  const webResults = await Promise.all(
    webSearchCalls.map(async (call) => {
      try {
        return await executeWebSearchCall(call, 0, {
          signal: ctx.signal,
          projectId: ctx.projectId,
          webSearchEnabled: ctx.webSearchEnabled,
          webSearchAvailability: ctx.webSearchAvailability,
        });
      } catch (error) {
        const chatStore = useChatStore.getState();
        const query = stringArg(call.arguments, "query");
        const message = error instanceof Error ? error.message : String(error);
        useChatStore.getState().upsertStreamingWebSearchRound({
          id: call.id,
          query: query || "Web search",
          phase: "error",
          sources: [],
          error: message,
        });
        chatStore.setStreamingToolState({
          id: call.id,
          name: WEB_SEARCH_TOOL_NAME,
          label: "Web Search",
          phase: "error",
          input: query,
          error: message,
        });
        return {
          section: `Tool result for ${WEB_SEARCH_TOOL_NAME}: ${message}`,
          sources: [] as WebSearchSource[],
          contextBlock: "",
          query: query || "Web search",
        };
      }
    }),
  );

  for (const result of webResults) {
    toolResultSections.push(result.section);
    webSearchSources.push(...result.sources);
    if (result.contextBlock) webSearchContextBlocks.push(result.contextBlock);
  }

  let preferredDocumentId = ctx.preferredDocumentId;
  for (const call of documentCalls) {
    if (call.name === DOC_READ_TOOL_NAME) {
      toolResultSections.push(await executeDocReadCall(call, preferredDocumentId));
      continue;
    }
    if (call.name === INLINE_EDIT_TOOL_NAME) {
      toolResultSections.push(
        await executeInlineEditCall(call, ctx.docMutationConversationId, preferredDocumentId),
      );
      continue;
    }

    if (call.name === DOC_CREATE_TOOL_NAME) {
      const creationKey = documentCreationKey(call);
      const completedCreation = ctx.completedDocumentCreations?.get(creationKey);
      if (completedCreation) {
        toolResultSections.push(
          `Tool result for ${DOC_CREATE_TOOL_NAME}(${JSON.stringify({ title: completedCreation.title })}):\n\nDocument "${completedCreation.title}" was already created in this tool run; skipped the duplicate create request.\nDocument id: ${completedCreation.documentId}`,
        );
        preferredDocumentId = completedCreation.documentId;
        continue;
      }
    }

    const mutationResult = await executeDocMutationCalls([call], {
      retryWithLLM: ctx.retryDocMutationWithLLM,
      conversationId: ctx.docMutationConversationId,
      preferredDocumentId,
    });
    toolResultSections.push(...mutationResult.sections);
    streamedChunks.push(...mutationResult.streamedChunks);
    preferredDocumentId = mutationResult.lastCreatedDocumentId ?? preferredDocumentId;
    if (
      call.name === DOC_CREATE_TOOL_NAME &&
      mutationResult.lastCreatedDocumentId &&
      ctx.completedDocumentCreations
    ) {
      ctx.completedDocumentCreations.set(documentCreationKey(call), {
        documentId: mutationResult.lastCreatedDocumentId,
        title: stringArg(call.arguments, "title"),
      });
    }
  }

  for (const call of codeExecutionCalls) {
    toolResultSections.push(await executeCodeExecutionCall(call, ctx.codeExecution));
  }

  for (const call of scratchpadCalls) {
    toolResultSections.push(
      executeScratchpadCall(call, ctx.conversationId ?? "", ctx.assistantMessageId ?? ""),
    );
  }

  for (const call of askQuestionCalls) {
    const result = await executeAskQuestionCall(call);
    toolResultSections.push(result);
  }

  for (const call of mcpCalls) {
    const extensionState = useExtensionsStore.getState();
    const resolved = resolveMcpTool(extensionState.mcpServers, call.name);
    if (!resolved) { completeMcpTool(call, "error", "MCP capability is unavailable."); toolResultSections.push(`Tool result for ${call.name}: MCP capability is unavailable.`); continue; }
    const provenance = `${resolved.server.name} · ${resolved.toolName}`;
    useChatStore.getState().setStreamingToolState({ id: call.id, name: call.name, label: `MCP · ${resolved.toolName}`, phase: "running", input: provenance });
    if (!isMcpEnabledForChat(resolved.server, disabledMcpServersForChat(extensionState.mcpServers, ctx.conversationId ? extensionState.chatDisabledMcpServerIds[ctx.conversationId] : undefined), ctx.conversationId ? extensionState.chatEnabledMcpServerIds[ctx.conversationId] : undefined) || resolved.server.health !== "ready" || (ctx.projectId && resolved.server.projectIds.length > 0 && !resolved.server.projectIds.includes(ctx.projectId))) {
      const message = "This MCP capability is disabled, disconnected, or unavailable in the active project.";
      completeMcpTool(call, "error", message); toolResultSections.push(`Tool result for ${call.name}: ${message}`); continue;
    }
    if (!extensionState.featureFlags.mcp || (resolved.server.transport === "stdio" ? !extensionState.featureFlags.stdio : !extensionState.featureFlags.streamableHttp)) { completeMcpTool(call, "error", "This MCP transport is disabled by Veyra's safety controls."); toolResultSections.push(`Tool result for ${call.name}: This MCP transport is disabled by Veyra's safety controls.`); continue; }
    const capabilityId = mcpCapabilityId(resolved.server.id, resolved.toolName);
    const destructive = /\b(delete|destroy|drop|remove|terminate|reset|wipe)\b/i.test(resolved.toolName);
    if (destructive) { completeMcpTool(call, "error", "Destructive action: a fresh one-time approval is required."); toolResultSections.push(`Tool result for ${call.name}: This destructive action requires a fresh one-time approval and cannot use a saved grant.`); continue; }
    const grant = findCapabilityGrant(useExtensionsStore.getState().grants, { serverId: resolved.server.id, capabilityId, projectId: ctx.projectId, chatId: ctx.conversationId, capabilityFingerprint: resolved.server.capabilityFingerprint });
    if (!grant) {
      const message = `Permission is required before Veyra can call ${resolved.server.name}.${resolved.toolName}.`;
      completeMcpTool(call, "error", message, undefined, {
        serverId: resolved.server.id,
        toolName: resolved.toolName,
        projectId: ctx.projectId,
        chatId: ctx.conversationId,
        capabilityFingerprint: resolved.server.capabilityFingerprint,
      });
      toolResultSections.push(`Tool result for ${call.name}: ${message}`);
      continue;
    }
    if (grant.usesRemaining !== undefined) useExtensionsStore.getState().consumeGrant(grant.id);
    try { const result = formatMcpResult(await invokeMcpTool(resolved.server, resolved.toolName, call.arguments)); completeMcpTool(call, "done", "Completed through Veyra MCP host.", result); toolResultSections.push(`Tool result for ${call.name}:\n${result}`); } catch (error) { const message = error instanceof Error ? error.message : String(error); completeMcpTool(call, "error", message); toolResultSections.push(`Tool result for ${call.name}: ${message}`); }
  }

  return {
    toolResultSections,
    webSearchSources,
    webSearchContextBlocks,
    streamedChunks,
    lastCreatedDocumentId: preferredDocumentId,
  };
}

function formatMcpResult(value: unknown): string {
  const serialized = JSON.stringify(value);
  // MCP servers are untrusted and can return arbitrarily large text. Keep enough
  // context for the model without letting one response crowd out the conversation.
  return serialized.length <= 60_000 ? serialized : `${serialized.slice(0, 60_000)}\n[Output truncated by Veyra: 60 KB limit]`;
}

function completeMcpTool(
  call: ProviderToolCall,
  phase: "done" | "error",
  detail: string,
  result?: string,
  mcpApproval?: import("@/modules/chat/chat-types").ToolCallState["mcpApproval"],
): void {
  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: call.name,
    label: call.name,
    phase,
    detail: phase === "done" ? detail : undefined,
    error: phase === "error" ? detail : undefined,
    result,
    mcpApproval,
  });
}
