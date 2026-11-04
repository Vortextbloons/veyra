import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chat = { hydrationState: "ready", conversations: [] as Array<Record<string, unknown>> };
  return { chat, list: vi.fn(), remove: vi.fn(), save: vi.fn(), flush: vi.fn(), issue: vi.fn() };
});
vi.mock("@/modules/projects/project-storage", () => ({ listProjects: mocks.list, deleteProject: mocks.remove, createProject: vi.fn(), updateProject: vi.fn() }));
vi.mock("@/stores/chat-store", () => ({ useChatStore: { getState: () => mocks.chat, setState: (change: Partial<typeof mocks.chat>) => Object.assign(mocks.chat, change) } }));
vi.mock("@/lib/conversation-storage", () => ({ saveConversationSnapshot: mocks.save, flushConversationSave: mocks.flush, getConversationStorageIssue: mocks.issue }));
vi.mock("@/modules/memory/memory-lifecycle", () => ({ notifyMemoryDeletion: vi.fn() }));
import { useProjectStore } from "@/modules/projects/project-store";

describe("project replacement migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ hydrationState: "loading", projects: [], activeProjectId: null });
    mocks.chat.hydrationState = "ready";
    mocks.chat.conversations = [{ id: "chat", projectId: "old", agentSession: { id: "pi", projectId: "old", events: [] } }];
    mocks.list.mockResolvedValue([{ id: "old", settings: {} }, { id: "new", settings: { projectSystemVersion: 2 } }]);
    mocks.flush.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.issue.mockReturnValue(null);
  });
  it("unassigns old chats and embedded Pi sessions before deleting legacy records", async () => {
    await useProjectStore.getState().hydrateProjects();
    expect(mocks.chat.conversations[0]).toMatchObject({ projectId: undefined, agentSession: { projectId: undefined } });
    expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual(["new"]);
    expect(mocks.save).toHaveBeenCalled();
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(mocks.remove).toHaveBeenCalledWith("old");
  });
  it("does not delete old records when conversation storage is unavailable", async () => {
    mocks.issue.mockReturnValue({ severity: "error" });
    await useProjectStore.getState().hydrateProjects();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.chat.conversations[0].projectId).toBe("old");
  });
});
