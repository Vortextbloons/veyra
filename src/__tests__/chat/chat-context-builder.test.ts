import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildRoundMessages,
  formatToolResultsMessage,
  stripImageAttachments,
} from "@/modules/chat/chat-context-builder";
import type { ChatMessage } from "@/modules/chat/chat-types";
import type { RoundMessagesContext } from "@/modules/chat/chat-context-builder";
import type { LmChatCompleteResult } from "@/lib/lm-studio";
import type { ProviderAdapter, ProviderChatOptions } from "@/lib/providers/types";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return { memoryEnabled: true };
});

vi.mock("@/modules/memory/memory-store", () => ({
  useMemoryStore: {
    getState: () => ({ enabled: mocks.memoryEnabled }),
  },
}));

import { rePromptWithTools } from "@/modules/chat/chat-tool-loop";

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

describe("provider-round memory re-check", () => {
  const memoryBlock = "<veyra_memory_context>\nMEMORY_SNAPSHOT\n</veyra_memory_context>";
  const chain: ChatMessage[] = [
    { id: "1", role: "user", content: "hi", timestamp: 1 },
  ];

  function runRound(): Promise<{ messages: ChatMessage[] }> {
    return new Promise((resolve, reject) => {
      const provider = {
        id: "test",
        name: "Test",
        connectivityRequirement: "local",
        isAvailable: async () => true,
        fetchModels: async () => [],
        sendChat: async (options: ProviderChatOptions) => {
          const result: LmChatCompleteResult = {
            performance: {
              tokensPerSecond: 0,
              timeToFirstToken: 0,
              generationTime: 0,
              totalTime: 0,
              outputTokens: 0,
            },
            toolCalls: [],
          };
          resolve({ messages: options.messages });
          options.onComplete?.(result);
        },
      } as ProviderAdapter;

      void rePromptWithTools({
        provider,
        providerChatBase: () => ({
          model: "test-model",
          onChunk: () => {},
          onError: () => {},
        }),
        chainMessages: chain,
        round: 0,
        accumulatedSearchSources: [],
        accumulatedContextBlocks: [],
        accumulatedContent: "",
        enhancedMode: false,
        model: "test-model",
        modelSupportsImages: true,
        onChunk: () => {},
        onError: () => {},
        finalizeToUser: () => {},
        executeToolRoundLocal: async () => ({
          toolResultSections: [],
          webSearchSources: [],
          webSearchContextBlocks: [],
          streamedChunks: [],
        }),
        roundMessagesContext: {
          resolvedUserPrompt: undefined,
          resolvedReservedOutputTokens: 128,
          resolvedContextLength: 8_192,
          memoryContextBlock: memoryBlock,
        },
      }).catch(reject);
    });
  }

  beforeEach(() => {
    mocks.memoryEnabled = true;
  });

  it("keeps memory when the global switch is on", async () => {
    const { messages: built } = await runRound();
    expect(built.map((message) => message.content).join("\n")).toContain("MEMORY_SNAPSHOT");
  });

  it("drops the snapshot before dispatch when the global switch turned off", async () => {
    mocks.memoryEnabled = false;
    const { messages: built } = await runRound();
    expect(built.map((message) => message.content).join("\n")).not.toContain("MEMORY_SNAPSHOT");
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
