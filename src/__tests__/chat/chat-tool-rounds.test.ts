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

import { executeToolRound } from "@/modules/chat/chat-tool-rounds";
import {
  executeDocReadCall,
  executeInlineEditCall,
} from "@/modules/chat/tools/document-tool";

describe("executeToolRound document dependencies", () => {
  beforeEach(() => {
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
});
