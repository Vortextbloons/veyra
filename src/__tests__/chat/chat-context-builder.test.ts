import { describe, it, expect } from "vitest";
import {
  buildRoundMessages,
  formatToolResultsMessage,
  stripImageAttachments,
} from "@/modules/chat/chat-context-builder";
import type { ChatMessage } from "@/modules/chat/chat-types";
import type { RoundMessagesContext } from "@/modules/chat/chat-context-builder";

describe("formatToolResultsMessage", () => {
  it("returns fallback for empty sections", () => {
    const result = formatToolResultsMessage([]);
    expect(result).toContain("no usable results");
  });

  it("joins sections with tool-use instructions", () => {
    const result = formatToolResultsMessage(["result A", "result B"]);
    expect(result).toContain("result A");
    expect(result).toContain("result B");
    expect(result).toContain("Use the tool results above");
    expect(result).not.toContain("do not repeat URLs");
  });

  it("adds chat-only citation guidance when web search results are present", () => {
    const result = formatToolResultsMessage([
      'Tool result for web_search({"query":"test"}):\n\n<veyra_web_search>\nresults\n</veyra_web_search>',
    ]);
    expect(result).toContain("do not repeat URLs in prose");
  });
});

describe("buildRoundMessages", () => {
  const baseContext: RoundMessagesContext = {
    memoryPack: null,
    resolvedUserPrompt: undefined,
    resolvedReservedOutputTokens: 1024,
    resolvedContextLength: 8192,
  };

  it("returns the input chain when no web search blocks", () => {
    const chain: ChatMessage[] = [
      { id: "1", role: "user", content: "hi", timestamp: 1 },
      { id: "2", role: "assistant", content: "hello", timestamp: 2 },
    ];
    const result = buildRoundMessages(chain, [], baseContext);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const userMsg = result.find((m) => m.role === "user" && m.content === "hi");
    expect(userMsg).toBeDefined();
  });

  it("includes web search context blocks in output", () => {
    const chain: ChatMessage[] = [
      { id: "1", role: "user", content: "search this", timestamp: 1 },
    ];
    const result = buildRoundMessages(chain, ["Source: http://example.com"], baseContext);
    const allContent = result.map((m) => m.content).join(" ");
    expect(allContent).toContain("Source: http://example.com");
  });
});

describe("stripImageAttachments", () => {
  const textAttachment = {
    id: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    dataUrl: "",
    fileType: "text" as const,
    size: 10,
  };
  const imageAttachment = {
    id: "image",
    name: "image.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,abc",
    fileType: "image" as const,
    size: 20,
  };

  it("preserves the original array when there are no images", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "hi", timestamp: 1, attachments: [textAttachment] },
    ];
    expect(stripImageAttachments(messages)).toBe(messages);
  });

  it("removes images while preserving other attachments", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "hi",
        timestamp: 1,
        attachments: [imageAttachment, textAttachment],
      },
    ];
    expect(stripImageAttachments(messages)[0]?.attachments).toEqual([textAttachment]);
  });
});
