import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type { StudioResponse } from "./studio-types";

function message(
  id: string,
  role: ChatMessage["role"],
  content: string,
  extras?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: 1,
    ...extras,
  };
}

function baseConversation(
  messages: ChatMessage[],
  extras?: Partial<Conversation>,
): Conversation {
  return {
    id: "conversation-1",
    title: "Studio chat",
    messages,
    createdAt: 1,
    updatedAt: 1,
    ...extras,
  };
}

/** Native experience + message-owned responses. */
export function nativeStudioConversationFixture(): Conversation {
  const response: StudioResponse = {
    id: "response-native-1",
    title: "Dashboard",
    currentRevision: 1,
    latestRevision: 1,
    revisions: [{
      revision: 1,
      title: "Dashboard",
      html: "<main>Dashboard</main>",
      css: "main{display:grid}",
      createdAt: 1,
    }],
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
  };
  return baseConversation(
    [
      message("user-1", "user", "Show a dashboard"),
      message("assistant-1", "assistant", "Ready", { studioResponse: response }),
    ],
    { experience: "studio" },
  );
}

/** Standard conversation with no Studio fields. */
export function standardConversationFixture(): Conversation {
  return baseConversation([
    message("user-1", "user", "Hello"),
    message("assistant-1", "assistant", "Hi"),
  ]);
}

/** Malformed message-owned response data mixed with valid data. */
export function malformedStudioConversationFixture(): Conversation {
  return baseConversation(
    [
      message("user-1", "user", "Go"),
      message("assistant-1", "assistant", "Ok", {
        studioResponse: {
          id: "response-malformed",
          title: "Broken title",
          currentRevision: 99,
          latestRevision: 2,
          revisions: [
            {
              revision: 1,
              title: "One",
              html: "<main>1</main>",
              css: "",
              createdAt: 1,
            },
            {
              revision: 2,
              title: "Two",
              html: "<main>2</main>",
              css: "",
              createdAt: 2,
            },
            { revision: "bad" } as never,
            null as never,
          ],
          status: "not-a-status" as never,
          error: [{ code: "x", message: "ok" }, { code: 1 } as never],
          createdAt: 1,
          updatedAt: 2,
        },
      }),
    ],
    { experience: "studio" },
  );
}

/** Conversation with multiple independent native responses. */
export function multiResponseStudioConversationFixture(): Conversation {
  const first: StudioResponse = {
    id: "response-first",
    title: "First",
    currentRevision: 1,
    latestRevision: 1,
    revisions: [{
      revision: 1,
      title: "First",
      html: "<main>First</main>",
      css: "",
      createdAt: 1,
    }],
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
  };
  const second: StudioResponse = {
    id: "response-second",
    title: "Second",
    currentRevision: 1,
    latestRevision: 1,
    revisions: [{
      revision: 1,
      title: "Second",
      html: "<main>Second</main>",
      css: "",
      createdAt: 2,
    }],
    status: "ready",
    createdAt: 2,
    updatedAt: 2,
  };
  return baseConversation(
    [
      message("user-1", "user", "First"),
      message("assistant-1", "assistant", "First response", { studioResponse: first }),
      message("user-2", "user", "Second"),
      message("assistant-2", "assistant", "Second response", { studioResponse: second }),
    ],
    { experience: "studio" },
  );
}
