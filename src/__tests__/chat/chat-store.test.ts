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
});

describe("chat store studio revisions", () => {
  beforeEach(() => {
    mocks.saveConversationSnapshot.mockClear();
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingBuffer: null,
    });
  });

  it("commits, restores, and undoes studio revisions", () => {
    useChatStore.setState({
      conversations: [conversation([], { presentationMode: "studio" })],
    });
    const first = useChatStore.getState().commitStudioRevision("conversation-1", {
      title: "One",
      html: "<main>1</main>",
      css: "",
      assistantMessageId: "assistant-1",
    });
    const second = useChatStore.getState().commitStudioRevision("conversation-1", {
      title: "Two",
      html: "<main>2</main>",
      css: "",
      assistantMessageId: "assistant-2",
    });
    expect(first?.revision).toBe(1);
    expect(second?.revision).toBe(2);

    useChatStore.getState().selectStudioRevision("conversation-1", 1);
    let artifact = useChatStore.getState().conversations[0]?.studioArtifact;
    expect(artifact?.currentRevision).toBe(1);
    expect(artifact?.title).toBe("One");

    expect(useChatStore.getState().undoStudioRevision("conversation-1")).toBe(false);

    useChatStore.getState().selectStudioRevision("conversation-1", 2);
    expect(useChatStore.getState().undoStudioRevision("conversation-1")).toBe(true);
    artifact = useChatStore.getState().conversations[0]?.studioArtifact;
    expect(artifact?.currentRevision).toBe(1);
  });

  it("keeps a restored pointer when a newer revision commits", () => {
    useChatStore.setState({
      conversations: [conversation([], { presentationMode: "studio" })],
    });
    useChatStore.getState().commitStudioRevision("conversation-1", {
      title: "One",
      html: "<main>1</main>",
      css: "",
      assistantMessageId: "assistant-1",
    });
    useChatStore.getState().commitStudioRevision("conversation-1", {
      title: "Two",
      html: "<main>2</main>",
      css: "",
      assistantMessageId: "assistant-2",
    });
    useChatStore.getState().selectStudioRevision("conversation-1", 1);
    useChatStore.getState().commitStudioRevision(
      "conversation-1",
      {
        title: "Three",
        html: "<main>3</main>",
        css: "",
        assistantMessageId: "assistant-3",
      },
      { pointerRevisionAtStart: 2 },
    );
    const artifact = useChatStore.getState().conversations[0]?.studioArtifact;
    expect(artifact?.currentRevision).toBe(1);
    expect(artifact?.latestRevision).toBe(3);
  });

  it("reconciles studio revisions after message deletion", () => {
    const assistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "Done",
      timestamp: 2,
    };
    useChatStore.setState({
      conversations: [conversation([assistant], {
        presentationMode: "studio",
        studioArtifact: {
          id: "artifact-1",
          title: "Board",
          currentRevision: 1,
          latestRevision: 1,
          revisions: [{
            revision: 1,
            title: "Board",
            html: "<main>Board</main>",
            css: "",
            createdAt: 1,
            assistantMessageId: "assistant-1",
          }],
          createdAt: 1,
          updatedAt: 1,
        },
      })],
    });
    useChatStore.getState().deleteMessage("conversation-1", "assistant-1");
    expect(useChatStore.getState().conversations[0]?.studioArtifact).toBeUndefined();
  });

  it("forks studio artifacts with remapped assistant ids", () => {
    const assistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "Done",
      timestamp: 2,
    };
    useChatStore.setState({
      conversations: [conversation([assistant], {
        presentationMode: "studio",
        studioArtifact: {
          id: "artifact-1",
          title: "Board",
          currentRevision: 1,
          latestRevision: 1,
          revisions: [{
            revision: 1,
            title: "Board",
            html: "<main>Board</main>",
            css: "",
            createdAt: 1,
            assistantMessageId: "assistant-1",
          }],
          createdAt: 1,
          updatedAt: 1,
        },
      })],
    });

    const forkedId = useChatStore.getState().forkConversation("conversation-1", "assistant-1");
    const forked = useChatStore.getState().conversations.find((item) => item.id === forkedId);
    expect(forked?.presentationMode).toBe("studio");
    expect(forked?.studioArtifact?.id).not.toBe("artifact-1");
    expect(forked?.studioArtifact?.revisions[0]?.assistantMessageId).toBe(forked?.messages[0]?.id);
  });
});

describe("chat store message-owned studio responses", () => {
  const assistant = (id: string): ChatMessage => ({
    id,
    role: "assistant",
    content: "",
    timestamp: 1,
  });

  beforeEach(() => {
    mocks.saveConversationSnapshot.mockClear();
    useChatStore.setState({ conversations: [], activeConversationId: null, streamingBuffer: null });
  });

  it("commits only to the named assistant and never writes the legacy artifact", () => {
    useChatStore.setState({
      conversations: [conversation([assistant("assistant-1"), assistant("assistant-2")], { experience: "studio" })],
    });

    const revision = useChatStore.getState().commitStudioResponseRevision(
      "conversation-1",
      "assistant-2",
      { title: "Board", html: "<main>Board</main>", css: "" },
    );
    const stored = useChatStore.getState().conversations[0];

    expect(revision?.revision).toBe(1);
    expect(stored?.messages[0]?.studioResponse).toBeUndefined();
    expect(stored?.messages[1]?.studioResponse).toMatchObject({
      title: "Board",
      currentRevision: 1,
      latestRevision: 1,
      status: "ready",
    });
    expect(stored?.studioArtifact).toBeUndefined();
  });

  it("rejects standard, missing, user, character, and cross-conversation targets", () => {
    const user: ChatMessage = { id: "user-1", role: "user", content: "x", timestamp: 1 };
    useChatStore.setState({
      conversations: [
        conversation([assistant("assistant-standard")], { id: "standard", experience: "standard" }),
        conversation([user], { id: "studio", experience: "studio" }),
        conversation([assistant("assistant-character")], { id: "character", experience: "studio", characterId: "character-1" }),
      ],
    });
    const commit = (conversationId: string, messageId: string) => useChatStore.getState().commitStudioResponseRevision(
      conversationId,
      messageId,
      { title: "No", html: "<main>No</main>", css: "" },
    );

    expect(commit("standard", "assistant-standard")).toBeNull();
    expect(commit("studio", "missing")).toBeNull();
    expect(commit("studio", "user-1")).toBeNull();
    expect(commit("character", "assistant-character")).toBeNull();
    expect(commit("missing-conversation", "assistant-standard")).toBeNull();
    expect(mocks.saveConversationSnapshot).not.toHaveBeenCalled();
  });

  it("keeps independent monotonic histories, retains eight, and preserves a user-selected pointer", () => {
    useChatStore.setState({
      conversations: [conversation([assistant("assistant-1"), assistant("assistant-2")], { experience: "studio" })],
    });
    const commit = (messageId: string, title: string, pointerRevisionAtStart?: number) =>
      useChatStore.getState().commitStudioResponseRevision(
        "conversation-1",
        messageId,
        { title, html: `<main>${title}</main>`, css: "" },
        pointerRevisionAtStart == null ? undefined : { pointerRevisionAtStart },
      );

    commit("assistant-1", "One");
    commit("assistant-2", "Other");
    for (let index = 2; index <= 9; index += 1) commit("assistant-1", `Revision ${index}`);
    expect(useChatStore.getState().selectStudioResponseRevision("conversation-1", "assistant-1", 2)).toBe(true);
    commit("assistant-1", "Revision 10", 9);

    const [first, second] = useChatStore.getState().conversations[0]!.messages;
    expect(first.studioResponse?.latestRevision).toBe(10);
    expect(first.studioResponse?.currentRevision).toBe(2);
    expect(first.studioResponse?.revisions).toHaveLength(8);
    expect(first.studioResponse?.revisions.some((item) => item.revision === 2)).toBe(true);
    expect(second.studioResponse?.latestRevision).toBe(1);
  });

  it("preserves valid source when status becomes rejected", () => {
    useChatStore.setState({
      conversations: [conversation([assistant("assistant-1")], { experience: "studio" })],
    });
    useChatStore.getState().commitStudioResponseRevision(
      "conversation-1",
      "assistant-1",
      { title: "Valid", html: "<main>Valid</main>", css: "" },
    );
    useChatStore.getState().setStudioResponseStatus(
      "conversation-1",
      "assistant-1",
      "rejected",
      [{ code: "unsafe", message: "Rejected" }],
    );

    const response = useChatStore.getState().conversations[0]!.messages[0]!.studioResponse;
    expect(response?.status).toBe("rejected");
    expect(response?.revisions[0]?.html).toBe("<main>Valid</main>");
    expect(response?.error?.[0]?.code).toBe("unsafe");
  });
});
