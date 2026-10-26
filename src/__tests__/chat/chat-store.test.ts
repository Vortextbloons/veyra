import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";

const mocks = vi.hoisted(() => ({
  saveConversationSnapshot: vi.fn(),
}));

vi.mock("@/lib/conversation-storage", () => ({
  loadConversationSnapshot: vi.fn(async () => []),
  saveConversationSnapshot: mocks.saveConversationSnapshot,
}));

import { useChatStore } from "@/stores/chat-store";

function conversation(messages: ChatMessage[], overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    title: "Conversation",
    messages,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("chat store assistant append", () => {
  beforeEach(() => {
    mocks.saveConversationSnapshot.mockClear();
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingBuffer: null,
    });
  });

  it("appends only the replacement assistant after an edited user message", () => {
    const user: ChatMessage = {
      id: "user-1",
      role: "user",
      content: "Edited prompt",
      timestamp: 1,
    };
    const assistant: ChatMessage = {
      id: "assistant-2",
      role: "assistant",
      content: "",
      timestamp: 2,
    };
    useChatStore.setState({ conversations: [conversation([user])] });

    useChatStore.getState().appendAssistantMessage("conversation-1", assistant);

    const messages = useChatStore.getState().conversations[0]?.messages;
    expect(messages?.map((message) => message.id)).toEqual(["user-1", "assistant-2"]);
    expect(new Set(messages?.map((message) => message.id)).size).toBe(messages?.length);
    expect(useChatStore.getState().streamingBuffer).toMatchObject({
      conversationId: "conversation-1",
      messageId: "assistant-2",
    });
    expect(mocks.saveConversationSnapshot).toHaveBeenCalledOnce();
  });

  it("keeps an existing artifact until a valid regenerated artifact is stored", () => {
    const previousArtifact = {
      id: "old-artifact",
      format: "document" as const,
      title: "Original plan",
      content: "# Original",
      createdAt: 1,
    };
    const nextArtifact = {
      id: "new-artifact",
      format: "document" as const,
      title: "Revised plan",
      content: "# Revised",
      createdAt: 2,
    };
    const previousUser: ChatMessage = { id: "old-user", role: "user", content: "Make a plan", timestamp: 1 };
    const previousAssistant: ChatMessage = {
      id: "old-assistant",
      role: "assistant",
      content: "",
      timestamp: 2,
      artifact: previousArtifact,
    };
    const replacementUser: ChatMessage = { id: "new-user", role: "user", content: "Make a plan", timestamp: 3 };
    const replacementAssistant: ChatMessage = {
      id: "new-assistant",
      role: "assistant",
      content: "",
      timestamp: 4,
      artifactReplacement: { userMessageId: previousUser.id, assistantMessageId: previousAssistant.id },
    };
    useChatStore.setState({ conversations: [conversation([previousUser, previousAssistant, replacementUser, replacementAssistant])] });

    const rejected = useChatStore.getState().setAssistantArtifact("conversation-1", replacementAssistant.id, {
      ...nextArtifact,
      content: "x".repeat(256 * 1024 + 1),
    });
    expect(rejected).toBe(false);
    expect(useChatStore.getState().conversations[0]?.messages[1]?.artifact).toEqual(previousArtifact);

    const saved = useChatStore.getState().setAssistantArtifact("conversation-1", replacementAssistant.id, nextArtifact);
    expect(saved).toBe(true);
    expect(useChatStore.getState().conversations[0]?.messages.map((message) => message.id)).toEqual(["new-user", "new-assistant"]);
    expect(useChatStore.getState().conversations[0]?.messages[1]?.artifact).toEqual(nextArtifact);
  });
});
