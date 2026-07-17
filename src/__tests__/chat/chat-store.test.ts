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

function conversation(messages: ChatMessage[]): Conversation {
  return {
    id: "conversation-1",
    title: "Conversation",
    messages,
    createdAt: 1,
    updatedAt: 1,
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
});
