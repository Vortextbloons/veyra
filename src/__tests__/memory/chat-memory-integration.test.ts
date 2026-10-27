import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/modules/chat/chat-types";

const mocks = vi.hoisted(() => ({
  state: {
    conversations: [] as Array<Record<string, unknown>>,
  },
  retrieveMemoryContext: vi.fn(),
  queueMemoryExtraction: vi.fn(),
  prepareProviderModel: vi.fn(async () => undefined),
  sendChatRequest: vi.fn(),
  handoffAfterUserChat: vi.fn(async () => undefined),
  queuePostChatJobs: vi.fn(),
}));

vi.mock("@/modules/memory/memory-service", () => ({
  retrieveMemoryContext: mocks.retrieveMemoryContext,
  queueMemoryExtraction: mocks.queueMemoryExtraction,
}));

vi.mock("@/modules/chat/chat-orchestrator", () => ({
  sendChatRequest: mocks.sendChatRequest,
}));

vi.mock("@/lib/post-chat-jobs", () => ({
  handoffAfterUserChat: mocks.handoffAfterUserChat,
  queuePostChatJobs: mocks.queuePostChatJobs,
}));

vi.mock("@/lib/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers")>();
  return {
    ...actual,
    prepareProviderModel: mocks.prepareProviderModel,
  };
});

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      conversations: mocks.state.conversations,
    }),
  },
}));

import { executeChatSend } from "@/modules/chat/chat-actions";

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  content: "hello",
  timestamp: 1,
};

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "",
  timestamp: 2,
  modelId: "test-model",
};

function seedConversation(
  content = "Answer",
  reasoning = "private chain of thought",
  projectId?: string,
): void {
  mocks.state.conversations = [
    {
      id: "conversation-1",
      projectId,
      messages: [
        userMessage,
        {
          ...assistantMessage,
          content,
          reasoning,
        },
      ],
    },
  ];
}

function sendParams(signal = new AbortController().signal) {
  return {
    conversationId: "conversation-1",
    userMessage,
    assistantMessage,
    trimmed: "hello",
    selectedProvider: "lm-studio",
    selectedModel: "test-model",
    webSearchEnabled: false,
    codeExecutionEnabled: false,
    enhancedMode: false,
    projectId: "project-1",
    signal,
    onChunk: vi.fn(),
    onReasoningChunk: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
  };
}

describe("chat memory integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedConversation();
    mocks.retrieveMemoryContext.mockResolvedValue({
      block: "User prefers concise answers.",
      memoryIds: ["memory-1"],
    });
    mocks.sendChatRequest.mockImplementation(async (request: { onComplete: () => void }) => {
      request.onComplete();
    });
  });

  it("retrieves once before generation and injects a bounded reference block", async () => {
    await executeChatSend(sendParams());

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledTimes(1);
    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "hello",
        projectId: "project-1",
        signal: expect.any(AbortSignal),
      }),
    );

    const request = mocks.sendChatRequest.mock.calls[0]?.[0];
    expect(request.memoryContextBlock).toContain("<veyra_memory_reference>");
    expect(request.memoryContextBlock).toContain("User prefers concise answers.");
  });

  it("queues extraction after success with stable turn and project scope", async () => {
    await executeChatSend(sendParams());

    expect(mocks.queueMemoryExtraction).toHaveBeenCalledTimes(1);
    expect(mocks.queueMemoryExtraction).toHaveBeenCalledWith({
      sourceType: "chat",
      sourceId: "conversation-1",
      turnId: "user-1",
      userText: "hello",
      assistantText: "Answer",
      projectId: "project-1",
      model: "test-model",
      providerId: "lm-studio",
    });
    expect(mocks.queueMemoryExtraction.mock.calls[0]?.[0].assistantText).not.toContain(
      "private chain of thought",
    );
  });

  it("keeps the last successful turn scope when navigation changes later", async () => {
    const params = sendParams();
    await executeChatSend(params);
    params.projectId = "other-project";

    expect(mocks.queueMemoryExtraction.mock.calls[0]?.[0].projectId).toBe("project-1");
  });

  it("falls back to the conversation project and still generates when retrieval fails", async () => {
    seedConversation("Answer", "reasoning", "conversation-project");
    mocks.retrieveMemoryContext.mockRejectedValue(new Error("locked"));
    const params = { ...sendParams(), projectId: undefined };

    await executeChatSend(params);

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "conversation-project" }),
    );
    expect(mocks.sendChatRequest.mock.calls[0]?.[0].memoryContextBlock).toBeUndefined();
    expect(mocks.queueMemoryExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "conversation-project" }),
    );
  });

  it("does not extract memories after an error", async () => {
    mocks.sendChatRequest.mockImplementation(async (request: { onError: (error: string) => void }) => {
      request.onError("provider failed");
    });

    await executeChatSend(sendParams());

    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });

  it("stops before generation when the turn is cancelled during retrieval", async () => {
    const controller = new AbortController();
    mocks.retrieveMemoryContext.mockImplementation(async () => {
      controller.abort();
      return { block: "late memory", memoryIds: [] };
    });

    await executeChatSend(sendParams(controller.signal));

    expect(mocks.sendChatRequest).not.toHaveBeenCalled();
    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });

  it("does not persist an assistant turn that has only reasoning", async () => {
    seedConversation("", "private chain of thought");

    await executeChatSend(sendParams());

    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });
});
