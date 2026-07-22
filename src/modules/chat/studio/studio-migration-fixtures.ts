import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type { StudioArtifact, StudioResponse } from "./studio-types";

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

function revision(
  revisionNumber: number,
  assistantMessageId: string,
  title: string,
  createdAt = revisionNumber,
) {
  return {
    revision: revisionNumber,
    title,
    html: `<main>${title}</main>`,
    css: "main{display:grid}",
    createdAt,
    assistantMessageId,
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

/** Legacy Studio snapshot: presentationMode + conversation artifact only. */
export function legacyStudioConversationFixture(): Conversation {
  const artifact: StudioArtifact = {
    id: "artifact-legacy",
    title: "Two",
    currentRevision: 2,
    latestRevision: 2,
    revisions: [
      revision(1, "assistant-1", "One"),
      revision(2, "assistant-2", "Two"),
    ],
    createdAt: 1,
    updatedAt: 2,
  };
  return baseConversation(
    [
      message("user-1", "user", "Build a board"),
      message("assistant-1", "assistant", "Here is a board"),
      message("user-2", "user", "Make a second view"),
      message("assistant-2", "assistant", "Updated"),
    ],
    {
      presentationMode: "studio",
      studioArtifact: artifact,
    },
  );
}

/** Native experience + message-owned responses; no legacy presentation fields required. */
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
    {
      experience: "studio",
    },
  );
}

/** Mixed snapshot: native experience/response plus leftover legacy artifact. */
export function mixedStudioConversationFixture(): Conversation {
  const native: StudioResponse = {
    id: "response-native-keep",
    title: "Native",
    currentRevision: 2,
    latestRevision: 2,
    revisions: [
      {
        revision: 1,
        title: "Native v1",
        html: "<main>v1</main>",
        css: "",
        createdAt: 1,
      },
      {
        revision: 2,
        title: "Native",
        html: "<main>v2</main>",
        css: "",
        createdAt: 2,
      },
    ],
    status: "ready",
    createdAt: 1,
    updatedAt: 2,
  };
  const artifact: StudioArtifact = {
    id: "artifact-mixed",
    title: "Legacy",
    currentRevision: 1,
    latestRevision: 1,
    revisions: [
      revision(1, "assistant-1", "ShouldNotOverwrite"),
      revision(2, "assistant-2", "LegacySecond"),
    ],
    createdAt: 1,
    updatedAt: 2,
  };
  return baseConversation(
    [
      message("user-1", "user", "First"),
      message("assistant-1", "assistant", "Native wins", { studioResponse: native }),
      message("user-2", "user", "Second"),
      message("assistant-2", "assistant", "Needs migration"),
    ],
    {
      experience: "studio",
      presentationMode: "studio",
      studioArtifact: artifact,
    },
  );
}

/** Malformed revisions, pointers, and statuses mixed with valid data. */
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
    {
      experience: "studio",
      studioArtifact: {
        id: "artifact-malformed",
        title: "Legacy",
        currentRevision: 1,
        latestRevision: 1,
        revisions: [
          revision(1, "assistant-1", "Legacy"),
          { revision: 2, title: "Bad" } as never,
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
}

/** Legacy revisions whose producers are missing; assistant history still exists. */
export function unmatchedProducerStudioConversationFixture(): Conversation {
  return baseConversation(
    [
      message("user-1", "user", "Hello"),
      message("assistant-1", "assistant", "Hi"),
    ],
    {
      presentationMode: "studio",
      studioArtifact: {
        id: "artifact-unmatched",
        title: "Orphan",
        currentRevision: 1,
        latestRevision: 1,
        revisions: [revision(1, "deleted-assistant", "Orphan")],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
}

/** Legacy Studio artifact with no assistant messages. */
export function noAssistantStudioConversationFixture(): Conversation {
  return baseConversation(
    [message("user-1", "user", "Hello")],
    {
      presentationMode: "studio",
      studioArtifact: {
        id: "artifact-no-assistant",
        title: "Orphan",
        currentRevision: 1,
        latestRevision: 1,
        revisions: [revision(1, "assistant-missing", "Orphan")],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
}

/** Standard conversation with no Studio fields. */
export function standardConversationFixture(): Conversation {
  return baseConversation([
    message("user-1", "user", "Hello"),
    message("assistant-1", "assistant", "Hi"),
  ]);
}

/** Native experience standard wins over legacy studio presentation. */
export function mixedExperienceWinsFixture(): Conversation {
  return baseConversation(
    [message("user-1", "user", "Hello"), message("assistant-1", "assistant", "Hi")],
    {
      experience: "standard",
      presentationMode: "studio",
      studioArtifact: {
        id: "artifact-ignored-for-experience",
        title: "Board",
        currentRevision: 1,
        latestRevision: 1,
        revisions: [revision(1, "assistant-1", "Board")],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
}
