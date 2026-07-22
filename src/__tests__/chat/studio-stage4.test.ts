import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/modules/chat/chat-types";
import { resolveStudioToolAvailability } from "@/modules/chat/chat-provider-options";
import {
  findLatestReadyStudioResponse,
  shouldIncludeStudioArtifactContext,
} from "@/modules/chat/studio/studio-context";
import { resolveConversationExperience } from "@/modules/chat/studio/studio-normalize";

const mocks = vi.hoisted(() => ({
  saveConversationSnapshot: vi.fn(),
  studioModeEnabled: true,
  providerTools: [] as Array<{ function: { name: string } }>,
}));

vi.mock("@/lib/conversation-storage", () => ({
  loadConversationSnapshot: vi.fn(async () => []),
  saveConversationSnapshot: mocks.saveConversationSnapshot,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      studioModeEnabled: mocks.studioModeEnabled,
      enhancedModeEnabled: false,
    }),
  },
}));

vi.mock("@/stores/provider-store", () => ({
  useProviderStore: {
    getState: () => ({
      providers: [],
      selectedProvider: "lmstudio",
    }),
  },
}));

vi.mock("@/stores/connectivity-store", () => ({
  useConnectivityStore: {
    getState: () => ({ effectiveConnectivity: "online" }),
  },
}));

vi.mock("@/modules/documents/document-store", () => ({
  useDocumentStore: {
    getState: () => ({ activeDocumentId: null }),
  },
}));

vi.mock("@/modules/extensions/extensions-store", () => ({
  useExtensionsStore: {
    getState: () => ({
      mcpServers: [],
      featureFlags: {},
      chatDisabledMcpServerIds: {},
      chatEnabledMcpServerIds: {},
    }),
  },
  disabledMcpServersForChat: () => [],
}));

vi.mock("@/lib/tool-registry", () => ({
  buildProviderTools: () => mocks.providerTools,
}));

vi.mock("@/modules/extensions/mcp-tool-adapter", () => ({
  buildMcpProviderTools: () => [],
}));

vi.mock("@/lib/connectivity/feature-capabilities", () => ({
  isFeatureAvailable: () => ({ available: true }),
}));

import { useChatStore } from "@/stores/chat-store";

describe("Studio Stage 4 creation-time experience", () => {
  beforeEach(() => {
    mocks.saveConversationSnapshot.mockClear();
    mocks.studioModeEnabled = true;
    mocks.providerTools = [{ function: { name: "studio_render" } }];
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingBuffer: null,
    });
  });

  it("creates conversations with an explicit experience field", () => {
    const standardId = useChatStore.getState().createConversation();
    const studioId = useChatStore.getState().createConversation(undefined, { experience: "studio" });
    const projectId = useChatStore.getState().createConversation("project-1", { experience: "studio" });

    const conversations = useChatStore.getState().conversations;
    expect(conversations.find((item) => item.id === standardId)?.experience).toBe("standard");
    expect(conversations.find((item) => item.id === studioId)?.experience).toBe("studio");
    expect(conversations.find((item) => item.id === projectId)).toMatchObject({
      experience: "studio",
      projectId: "project-1",
    });
  });

  it("allows experience changes only while the conversation is empty", () => {
    const id = useChatStore.getState().createConversation(undefined, { experience: "standard" });
    expect(useChatStore.getState().setConversationExperience(id, "studio")).toBe(true);
    expect(useChatStore.getState().conversations[0]?.experience).toBe("studio");

    const user: ChatMessage = {
      id: "user-1",
      role: "user",
      content: "Hello",
      timestamp: 1,
    };
    const assistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: 2,
    };
    useChatStore.getState().addMessagePair(id, user, assistant);
    expect(useChatStore.getState().setConversationExperience(id, "standard")).toBe(false);
    expect(useChatStore.getState().conversations[0]?.experience).toBe("studio");
  });

  it("keeps experience immutable after the first message", () => {
    const id = useChatStore.getState().createConversation();
    expect(useChatStore.getState().setConversationExperience(id, "studio")).toBe(true);
    expect(useChatStore.getState().conversations[0]?.experience).toBe("studio");

    const user: ChatMessage = {
      id: "user-1",
      role: "user",
      content: "Lock me",
      timestamp: 1,
    };
    const assistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: 2,
    };
    useChatStore.getState().addMessagePair(id, user, assistant);
    expect(useChatStore.getState().setConversationExperience(id, "standard")).toBe(false);
    expect(resolveConversationExperience(useChatStore.getState().conversations[0]!)).toBe("studio");
  });

  it("reports Studio tools unavailable for character and group chats", () => {
    expect(resolveStudioToolAvailability({
      experience: "studio",
      characterId: "character-1",
    })).toBe(false);
    expect(resolveStudioToolAvailability({
      experience: "studio",
      groupId: "group-1",
    })).toBe(false);
    expect(resolveStudioToolAvailability({
      experience: "studio",
    })).toBe(true);
  });

  it("selects the latest ready message-owned Studio response for context", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "one",
        timestamp: 1,
        studioResponse: {
          id: "response-1",
          title: "First",
          currentRevision: 1,
          latestRevision: 1,
          revisions: [{ revision: 1, title: "First", html: "<main>1</main>", css: "", createdAt: 1 }],
          status: "ready",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "two",
        timestamp: 2,
        studioResponse: {
          id: "response-2",
          title: "Second",
          currentRevision: 1,
          latestRevision: 1,
          revisions: [{ revision: 1, title: "Second", html: "<main>2</main>", css: "", createdAt: 2 }],
          status: "ready",
          createdAt: 2,
          updatedAt: 2,
        },
      },
      {
        id: "assistant-3",
        role: "assistant",
        content: "generating",
        timestamp: 3,
        studioResponse: {
          id: "response-3",
          title: "Pending",
          currentRevision: 1,
          latestRevision: 1,
          revisions: [{ revision: 1, title: "Pending", html: "<main>3</main>", css: "", createdAt: 3 }],
          status: "generating",
          createdAt: 3,
          updatedAt: 3,
        },
      },
    ];

    expect(findLatestReadyStudioResponse(messages)?.id).toBe("response-2");
    expect(shouldIncludeStudioArtifactContext("Can you restyle the dashboard?")).toBe(true);
  });
});
