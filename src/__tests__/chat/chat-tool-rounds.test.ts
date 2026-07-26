import { beforeEach, describe, expect, it, vi } from "vitest";

const executionOrder: string[] = [];

vi.mock("@/modules/chat/chat-tool-utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/chat/chat-tool-utils")>();
  return {
    ...original,
    registerStreamingToolCalls: vi.fn(),
  };
});

vi.mock("@/modules/chat/tools/document-tool", () => ({
  executeDocReadCall: vi.fn(async () => {
    executionOrder.push("read");
    return "read";
  }),
  executeInlineEditCall: vi.fn(async () => {
    executionOrder.push("inline_edit");
    return "inline edit";
  }),
  executeDocMutationCalls: vi.fn(async () => {
    executionOrder.push("create");
    return {
      sections: ["created"],
      streamedChunks: ["created"],
      lastCreatedDocumentId: "doc-created",
    };
  }),
}));

vi.mock("@/modules/chat/studio/studio-runtime", () => ({
  executeStudioCall: vi.fn(() => "studio rendered"),
  executeStudioThemeCall: vi.fn(() => "theme applied"),
}));

import { executeToolRound } from "@/modules/chat/chat-tool-rounds";
import {
  executeDocReadCall,
  executeDocMutationCalls,
  executeInlineEditCall,
} from "@/modules/chat/tools/document-tool";
import { executeStudioThemeCall } from "@/modules/chat/studio/studio-runtime";

describe("executeToolRound document dependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionOrder.length = 0;
  });

  it("creates a document before same-round reads and edits that depend on it", async () => {
    await executeToolRound(
      [
        {
          id: "create-1",
          name: "doc_create",
          arguments: {
            title: "Short Story",
            documentType: "document",
            contentMarkdown: "First draft",
          },
        },
        {
          id: "edit-1",
          name: "inline_edit",
          arguments: {
            documentId: "active",
            mode: "replace_all",
            contentMarkdown: "Revised draft",
          },
        },
        {
          id: "read-1",
          name: "doc_read",
          arguments: { documentId: "Short Story" },
        },
      ],
      {
        webSearchEnabled: false,
        webSearchAvailability: { available: false },
        retryDocMutationWithLLM: vi.fn(async () => []),
        codeExecution: {
          timeoutSecs: 30,
          pythonPath: null,
          workspaceRoot: null,
        },
      },
    );

    expect(executionOrder).toEqual(["create", "inline_edit", "read"]);
    expect(executeInlineEditCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "edit-1" }),
      undefined,
      "doc-created",
    );
    expect(executeDocReadCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "read-1" }),
      "doc-created",
    );
  });

  it("does not create the same document again in a later tool round", async () => {
    const completedDocumentCreations = new Map();
    const context = {
      webSearchEnabled: false,
      webSearchAvailability: { available: false },
      retryDocMutationWithLLM: vi.fn(async () => []),
      codeExecution: {
        timeoutSecs: 30,
        pythonPath: null,
        workspaceRoot: null,
      },
      completedDocumentCreations,
    };
    const call = {
      id: "create-1",
      name: "doc_create",
      arguments: {
        title: "The Last Ember",
        documentType: "document",
        contentMarkdown: "Once upon a time",
      },
    };

    await executeToolRound([call], context);
    const duplicateResult = await executeToolRound(
      [{ ...call, id: "create-2" }],
      context,
    );

    expect(executeDocMutationCalls).toHaveBeenCalledTimes(1);
    expect(duplicateResult.toolResultSections[0]).toContain(
      "skipped the duplicate create request",
    );
    expect(duplicateResult.lastCreatedDocumentId).toBe("doc-created");
  });

  it("routes a compact theme-only call without requiring a Studio render", async () => {
    const result = await executeToolRound(
      [{ id: "theme-1", name: "studio_theme", arguments: { vibe: "hacker terminal" } }],
      {
        conversationId: "conversation-1",
        assistantMessageId: "assistant-1",
        webSearchEnabled: false,
        webSearchAvailability: { available: false },
        retryDocMutationWithLLM: vi.fn(async () => []),
        codeExecution: { timeoutSecs: 30, pythonPath: null, workspaceRoot: null },
      },
    );

    expect(executeStudioThemeCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "theme-1" }),
      { conversationId: "conversation-1", assistantMessageId: "assistant-1" },
    );
    expect(result.toolResultSections).toContain("theme applied");
  });

  it("applies at most one theme across consecutive tool rounds", async () => {
    const studioThemeCallAttempted = { value: false };
    const context = {
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      studioThemeCallAttempted,
      webSearchEnabled: false,
      webSearchAvailability: { available: false },
      retryDocMutationWithLLM: vi.fn(async () => []),
      codeExecution: { timeoutSecs: 30, pythonPath: null, workspaceRoot: null },
    };

    await executeToolRound(
      [{ id: "theme-1", name: "studio_theme", arguments: { vibe: "hacker terminal" } }],
      context,
    );
    const second = await executeToolRound(
      [{ id: "theme-2", name: "studio_theme", arguments: { vibe: "synthwave" } }],
      context,
    );

    expect(executeStudioThemeCall).toHaveBeenCalledTimes(1);
    expect(second.toolResultSections.join("\n")).toContain("already chosen");
  });
});
