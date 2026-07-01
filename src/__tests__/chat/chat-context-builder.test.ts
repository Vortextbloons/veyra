import { describe, it, expect } from "vitest";
import { formatToolResultsMessage, buildRoundMessages } from "@/modules/chat/chat-context-builder";
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
