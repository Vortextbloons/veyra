import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareProviderModel: vi.fn(async () => undefined),
  sendChatRequest: vi.fn(async () => undefined),
}));

vi.mock("@/lib/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers")>();
  return {
    ...actual,
    prepareProviderModel: mocks.prepareProviderModel,
  };
});

vi.mock("@/modules/chat/chat-orchestrator", () => ({
  sendChatRequest: mocks.sendChatRequest,
}));

vi.mock("@/lib/explicit-memory", () => ({
  trySaveExplicitMemory: vi.fn(),
}));

vi.mock("@/lib/post-chat-jobs", () => ({
  handoffAfterUserChat: vi.fn(),
  queuePostChatJobs: vi.fn(),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      conversations: [{
        id: "conversation-1",
        messages: [{ id: "user-1", role: "user", content: "hello", timestamp: 1 }],
      }],
    }),
  },
}));

import { executeChatSend } from "@/modules/chat/chat-actions";

describe("chat provider preparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prepares the selected cloud provider instead of loading its model in LM Studio", async () => {
    const userMessage = { id: "user-1", role: "user" as const, content: "hello", timestamp: 1 };
    await executeChatSend({
      conversationId: "conversation-1",
      userMessage,
      assistantMessage: { id: "assistant-1", role: "assistant", content: "", timestamp: 2 },
      trimmed: "hello",
      selectedProvider: "nvidia-nim",
      selectedModel: "deepseek-ai/deepseek-v4-flash",
      memoryEnabled: false,
      webSearchEnabled: false,
      codeExecutionEnabled: false,
      enhancedMode: false,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onReasoningChunk: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
    });

    expect(mocks.prepareProviderModel).toHaveBeenCalledWith(
      "nvidia-nim",
      "deepseek-ai/deepseek-v4-flash",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.sendChatRequest).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "nvidia-nim", model: "deepseek-ai/deepseek-v4-flash" }),
    );
  });
});
