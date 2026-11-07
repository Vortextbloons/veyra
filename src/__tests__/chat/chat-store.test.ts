import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type { AgentSession } from "@/modules/agents/agent-types";

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

function session(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "session-1",
    title: "Session",
    projectPath: "",
    status: "completed",
    startedAt: 1,
    endedAt: 2,
    events: [],
    ...overrides,
  } as AgentSession;
}

describe("chat store conversation index", () => {
  beforeEach(() => {
    mocks.saveConversationSnapshot.mockClear();
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    });
  });

  it("moves a conversation and its mirrored session into a project", () => {
    useChatStore.setState({
      conversations: [conversation([], { agentSession: session() })],
    });

    useChatStore.getState().moveConversation("conversation-1", "project-a");

    const [moved] = useChatStore.getState().conversations;
    expect(moved?.projectId).toBe("project-a");
    expect(moved?.agentSession?.projectId).toBe("project-a");
    expect(mocks.saveConversationSnapshot).toHaveBeenCalledOnce();
  });

  it("drops project scope from every conversation when the project is cleared", () => {
    useChatStore.setState({
      conversations: [
        conversation([], { id: "in-project", projectId: "project-a", agentSession: session({ projectId: "project-a" }) }),
        conversation([], { id: "elsewhere", projectId: "project-b" }),
      ],
    });

    useChatStore.getState().clearProject("project-a");

    const [cleared, untouched] = useChatStore.getState().conversations;
    expect(cleared?.projectId).toBeUndefined();
    expect(cleared?.agentSession?.projectId).toBeUndefined();
    expect(untouched?.projectId).toBe("project-b");
  });

  it("selects the next conversation after a delete and persists the list", () => {
    useChatStore.setState({
      conversations: [conversation([], { id: "first" }), conversation([], { id: "second" })],
      activeConversationId: "first",
    });

    useChatStore.getState().deleteConversation("first");

    expect(useChatStore.getState().conversations.map((item) => item.id)).toEqual(["second"]);
    expect(useChatStore.getState().activeConversationId).toBe("second");
    expect(mocks.saveConversationSnapshot).toHaveBeenCalledOnce();
  });

  it("keeps titles trimmed and bounded", () => {
    useChatStore.setState({ conversations: [conversation([])] });

    useChatStore.getState().renameConversation("conversation-1", "   ");
    expect(useChatStore.getState().conversations[0]?.title).toBe("Conversation");

    useChatStore.getState().renameConversation("conversation-1", `  ${"x".repeat(120)}  `);
    expect(useChatStore.getState().conversations[0]?.title).toHaveLength(80);
  });

  it("updates a document artifact in place and rejects invalid content", () => {
    const document = {
      id: "artifact-1",
      format: "document" as const,
      title: "Original plan",
      content: "# Original",
      createdAt: 1,
    };
    const assistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: 2,
      artifact: document,
    };
    useChatStore.setState({ conversations: [conversation([assistant])] });

    expect(useChatStore.getState().updateAssistantDocument("assistant-1", "Revised plan", "# Revised")).toBe(true);
    expect(useChatStore.getState().conversations[0]?.messages[0]?.artifact).toMatchObject({
      id: "artifact-1",
      title: "Revised plan",
      content: "# Revised",
    });

    expect(useChatStore.getState().updateAssistantDocument("assistant-1", "", "# Empty title")).toBe(false);
  });

  it("ignores document updates for non-document artifacts", () => {
    const html = {
      id: "artifact-2",
      format: "html" as const,
      title: "Chart",
      content: "<p>hi</p>",
      createdAt: 1,
    };
    useChatStore.setState({
      conversations: [conversation([{ id: "assistant-2", role: "assistant", content: "", timestamp: 2, artifact: html }])],
    });

    expect(useChatStore.getState().updateAssistantDocument("assistant-2", "New", "<p>bye</p>")).toBe(false);
    expect(useChatStore.getState().conversations[0]?.messages[0]?.artifact?.title).toBe("Chart");
  });
});
