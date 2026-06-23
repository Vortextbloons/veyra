import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatMessage } from "@/modules/chat/chat-types";

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(),
  createMemoryNode: vi.fn(),
  searchMemory: vi.fn(),
  vectorSearchMemory: vi.fn(),
  getProviderAdapter: vi.fn(),
  useMemoryStore: vi.fn(),
  useSettingsStore: vi.fn(),
  setMemoryProcessed: vi.fn(),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      conversations: [],
      setMemoryProcessed: mocks.setMemoryProcessed,
    })),
  },
}));

vi.mock("@/modules/memory/memory-store", () => ({
  useMemoryStore: {
    getState: mocks.useMemoryStore,
  },
}));

vi.mock("@/modules/memory/memory-storage", () => ({
  createMemoryNode: mocks.createMemoryNode,
  searchMemory: mocks.searchMemory,
  vectorSearchMemory: mocks.vectorSearchMemory,
}));

vi.mock("@/lib/providers", () => ({
  getProviderAdapter: mocks.getProviderAdapter,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: mocks.useSettingsStore,
  },
}));

vi.mock("@/lib/prompts", () => ({
  buildMemoryExtractionUserMessage: vi.fn((opts: { title: string; transcript: string }) => `Title: ${opts.title}\n\n${opts.transcript}`),
  MEMORY_EXTRACTION_SYSTEM: "You are a memory extraction system.",
}));

import { shouldExtractMemoryBatch, runMemoryExtractionBatch } from "../../modules/memory/memory-extraction";
import { useChatStore } from "@/stores/chat-store";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: "Hello, this is a test message with enough content",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    title: "Test conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    memoryLastProcessedMessageCount: 0,
    ...overrides,
  };
}

describe("memory-extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSettingsStore.mockReturnValue({
      vectorSearchEnabled: false,
      vectorSearchEndpointUrl: "",
      vectorSearchModel: "",
      vectorDuplicateThreshold: 0.92,
    });
    mocks.useMemoryStore.mockReturnValue({ hydrateMemory: vi.fn() });
    mocks.createMemoryNode.mockResolvedValue(undefined);
    mocks.searchMemory.mockResolvedValue([]);
  });

  describe("shouldExtractMemoryBatch", () => {
    it("returns false for non-existent conversation", () => {
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("nonexistent")).toBe(false);
    });

    it("returns false when fewer than 2 new messages", () => {
      const conv = makeConversation({
        messages: [makeMessage(), makeMessage()],
        memoryLastProcessedMessageCount: 1,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("conv-1")).toBe(false);
    });

    it("returns true when >= 4 new messages", () => {
      const messages = Array.from({ length: 6 }, () => makeMessage());
      const conv = makeConversation({
        messages,
        memoryLastProcessedMessageCount: 0,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("conv-1")).toBe(true);
    });

    it("returns true when >= 2 new user exchanges", () => {
      const messages = [
        makeMessage({ role: "user" }),
        makeMessage({ role: "assistant" }),
        makeMessage({ role: "user" }),
        makeMessage({ role: "assistant" }),
      ];
      const conv = makeConversation({
        messages,
        memoryLastProcessedMessageCount: 0,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("conv-1")).toBe(true);
    });

    it("returns true when pending since >= 90 seconds", () => {
      const messages = [makeMessage(), makeMessage(), makeMessage()];
      const conv = makeConversation({
        messages,
        memoryLastProcessedMessageCount: 0,
        memoryPendingSince: Date.now() - 100_000,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("conv-1")).toBe(true);
    });

    it("returns false when pending since < 90 seconds", () => {
      const messages = [
        makeMessage({ role: "user" }),
        makeMessage({ role: "assistant" }),
        makeMessage({ role: "assistant" }),
      ];
      const conv = makeConversation({
        messages,
        memoryLastProcessedMessageCount: 0,
        memoryPendingSince: Date.now() - 50_000,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });
      expect(shouldExtractMemoryBatch("conv-1")).toBe(false);
    });
  });

  describe("runMemoryExtractionBatch", () => {
    it("returns early for non-existent conversation", async () => {
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      const result = await runMemoryExtractionBatch({
        conversationId: "nonexistent",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(result).toBeUndefined();
    });

    it("returns early when fewer than 2 messages", async () => {
      const conv = makeConversation({
        messages: [makeMessage()],
        memoryLastProcessedMessageCount: 0,
      });
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      const result = await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(result).toBeUndefined();
    });

    it("returns early when signal is aborted", async () => {
      const messages = Array.from({ length: 4 }, () => makeMessage());
      const conv = makeConversation({ messages, memoryLastProcessedMessageCount: 0 });
      const controller = new AbortController();
      controller.abort();

      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      const result = await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
        signal: controller.signal,
      });

      expect(result).toBeUndefined();
    });

    it("creates memory nodes from valid candidates", async () => {
      const messages = Array.from({ length: 6 }, (_, i) =>
        makeMessage({ role: i % 2 === 0 ? "user" : "assistant" }),
      );
      const conv = makeConversation({ messages, memoryLastProcessedMessageCount: 0 });

      const mockAdapter = {
        sendChat: vi.fn().mockImplementation((opts: { onComplete: (result: unknown) => void }) => {
          opts.onComplete({
            performance: {},
            toolCalls: [],
          });
          return Promise.resolve();
        }),
      };
      mocks.getProviderAdapter.mockReturnValue(mockAdapter);

      // Mock the streaming to produce JSON output
      mockAdapter.sendChat.mockImplementation((opts: {
        onChunk: (chunk: string) => void;
        onComplete: (result: unknown) => void;
      }) => {
        const json = JSON.stringify({
          memory_candidates: [
            {
              title: "User likes dark mode",
              content: "User prefers dark mode in all applications",
              summary: "Dark mode preference",
              type: "preference",
              scope: "global",
              priority: "high",
              importance: 4,
              confidence: 0.9,
              tags: ["ui"],
              retention: "keep",
            },
          ],
        });
        opts.onChunk(json);
        opts.onComplete({ performance: {}, toolCalls: [] });
        return Promise.resolve();
      });

      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      const result = await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(mocks.createMemoryNode).toHaveBeenCalled();
      expect(result?.output).toContain("1 memory extracted");
    });

    it("skips candidates with empty title or content", async () => {
      const messages = Array.from({ length: 6 }, (_, i) =>
        makeMessage({ role: i % 2 === 0 ? "user" : "assistant" }),
      );
      const conv = makeConversation({ messages, memoryLastProcessedMessageCount: 0 });

      const mockAdapter = {
        sendChat: vi.fn().mockImplementation((opts: {
          onChunk: (chunk: string) => void;
          onComplete: (result: unknown) => void;
        }) => {
          const json = JSON.stringify({
            memory_candidates: [
              { title: "", content: "some content", summary: "test" },
              { title: "Valid", content: "", summary: "test" },
              { title: "Valid", content: "Valid content", summary: "test", retention: "drop" },
            ],
          });
          opts.onChunk(json);
          opts.onComplete({ performance: {}, toolCalls: [] });
          return Promise.resolve();
        }),
      };
      mocks.getProviderAdapter.mockReturnValue(mockAdapter);

      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(mocks.createMemoryNode).not.toHaveBeenCalled();
    });

    it("returns no new memories when no candidates", async () => {
      const messages = Array.from({ length: 6 }, (_, i) =>
        makeMessage({ role: i % 2 === 0 ? "user" : "assistant" }),
      );
      const conv = makeConversation({ messages, memoryLastProcessedMessageCount: 0 });

      const mockAdapter = {
        sendChat: vi.fn().mockImplementation((opts: {
          onChunk: (chunk: string) => void;
          onComplete: (result: unknown) => void;
        }) => {
          opts.onChunk(JSON.stringify({ memory_candidates: [] }));
          opts.onComplete({ performance: {}, toolCalls: [] });
          return Promise.resolve();
        }),
      };
      mocks.getProviderAdapter.mockReturnValue(mockAdapter);

      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      const result = await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(result?.output).toContain("No new memories");
    });

    it("limits candidates to 8", async () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeMessage({ role: i % 2 === 0 ? "user" : "assistant" }),
      );
      const conv = makeConversation({ messages, memoryLastProcessedMessageCount: 0 });

      const candidates = Array.from({ length: 12 }, (_, i) => ({
        title: `Memory ${i}`,
        content: `Content for memory ${i} with enough text`,
        summary: `Summary ${i}`,
        type: "preference",
        scope: "global",
        importance: 3,
        confidence: 0.8,
        retention: "keep",
      }));

      const mockAdapter = {
        sendChat: vi.fn().mockImplementation((opts: {
          onChunk: (chunk: string) => void;
          onComplete: (result: unknown) => void;
        }) => {
          opts.onChunk(JSON.stringify({ memory_candidates: candidates }));
          opts.onComplete({ performance: {}, toolCalls: [] });
          return Promise.resolve();
        }),
      };
      mocks.getProviderAdapter.mockReturnValue(mockAdapter);

      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        conversations: [conv],
        setMemoryProcessed: mocks.setMemoryProcessed,
      });

      await runMemoryExtractionBatch({
        conversationId: "conv-1",
        providerId: "lm-studio",
        model: "test-model",
      });

      expect(mocks.createMemoryNode).toHaveBeenCalledTimes(8);
    });
  });
});
