import { beforeEach, describe, expect, it, vi } from "vitest";

const sources = vi.hoisted(() => ({
  chats: [{ id: "chat" }],
  agents: [{ id: "agent" }],
  projects: [{ id: "project" }],
  readFailed: false,
}));
vi.mock("@/stores/chat-store", () => ({ useChatStore: { getState: () => ({ conversations: sources.chats, hydrateConversations: async () => {} }) } }));
vi.mock("@/modules/agents/agent-store", () => ({ useAgentStore: { getState: () => ({ sessions: sources.agents }) } }));
vi.mock("@/modules/projects/project-store", () => ({ useProjectStore: { getState: () => ({ projects: sources.projects, hydrateProjects: async () => {} }) } }));
vi.mock("@/lib/conversation-storage", () => ({ getConversationStorageIssue: () => sources.readFailed ? { severity: "error" } : null }));

beforeEach(() => {
  sources.chats = [{ id: "chat" }];
  sources.agents = [{ id: "agent" }];
  sources.projects = [{ id: "project" }];
  sources.readFailed = false;
  vi.resetModules();
});

describe("durable memory source validation", () => {
  it("rejects facts for deleted sources and projects after restart even if encrypted cleanup failed", async () => {
    const { prepareMemorySourceValidation, isKnownMemorySource } = await import("./memory-source-policy");
    sources.chats = [];
    sources.projects = [];
    expect(await prepareMemorySourceValidation()).toBe(true);
    expect(isKnownMemorySource({ sourceType: "chat", sourceId: "chat" })).toBe(false);
    expect(isKnownMemorySource({ sourceType: "agent", sourceId: "agent", projectId: "project" })).toBe(false);
    expect(isKnownMemorySource({ sourceType: "chat", sourceId: "manual", projectId: "project" })).toBe(false);
    expect(isKnownMemorySource({ sourceType: "chat", sourceId: "manual" })).toBe(true);
  });

  it("validates live sources and fails closed when source storage cannot be read", async () => {
    const { prepareMemorySourceValidation, isKnownMemorySource } = await import("./memory-source-policy");
    expect(await prepareMemorySourceValidation()).toBe(true);
    expect(isKnownMemorySource({ sourceType: "chat", sourceId: "chat", projectId: "project" })).toBe(true);
    expect(isKnownMemorySource({ sourceType: "agent", sourceId: "agent" })).toBe(true);
    sources.chats = [];
    expect(isKnownMemorySource({ sourceType: "chat", sourceId: "chat" })).toBe(false);
    sources.readFailed = true;
    expect(await prepareMemorySourceValidation()).toBe(false);
  });
});
