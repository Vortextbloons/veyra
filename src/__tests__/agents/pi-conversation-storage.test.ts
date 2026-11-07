import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "@/modules/agents/agent-types";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  return { save: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/conversation-storage", () => ({ saveConversationSnapshot: mocks.save, loadConversationSnapshot: vi.fn().mockResolvedValue([]) }));
import { useAgentStore } from "@/modules/agents/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { flushPiConversations, initializePiConversations } from "@/modules/agents/pi-conversation-storage";

const session: AgentSession = { id: "pi-session", runtime: "pi", mode: "chat", status: "running", projectPath: "", prompt: "Question", title: "Question", model: "test", startedAt: 1, events: [{ id: "u", type: "status", title: "Prompt", detail: "Question", at: 1 }, { id: "a", type: "output", title: "Pi", detail: "Answer", at: 2 }] };

describe("encrypted Pi conversation history", () => {
  beforeEach(() => { mocks.save.mockClear(); });
  it("restores saved run state and preserves old conversations", () => {
    useChatStore.setState({ hydrationState: "ready", conversations: [{ id: "legacy", title: "Old chat", createdAt: 1, updatedAt: 2, messages: [] }, { id: session.id, title: session.title, createdAt: 1, updatedAt: 2, messages: [], agentSession: { ...session, status: "stopped" } }] });
    useAgentStore.setState({ sessions: [] });
    initializePiConversations();
    expect(useAgentStore.getState().sessions[0]).toMatchObject({ id: session.id, status: "stopped" });
    expect(useChatStore.getState().conversations.map((item) => item.id)).toContain("legacy");
    expect(mocks.save).toHaveBeenCalled();
  });
  it("saves partial output as recoverable stopped work and deletes linked history", () => {
    useAgentStore.setState({ sessions: [session] });
    flushPiConversations();
    const saved = useChatStore.getState().conversations.find((item) => item.id === session.id);
    expect(saved?.agentSession?.status).toBe("stopped");
    expect(saved?.messages.map((message) => message.content)).toEqual(["Question", "Answer"]);
    const raw = localStorage.getItem("veyra-agent-store");
    expect(raw).not.toContain('"events"');
    useAgentStore.setState({ sessions: [] });
    flushPiConversations();
    expect(useChatStore.getState().conversations.some((item) => item.id === session.id)).toBe(false);
    expect(useChatStore.getState().conversations.some((item) => item.id === "legacy")).toBe(true);
  });
  it("persists a moved Pi session with its new project assignment", () => {
    useAgentStore.setState({ sessions: [{ ...session, status: "stopped", projectId: "old" }] });
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((item) => ({ ...item, projectId: "new" })) }));
    flushPiConversations();
    const saved = useChatStore.getState().conversations.find((item) => item.id === session.id);
    expect(saved?.projectId).toBe("new");
    expect(saved?.agentSession?.projectId).toBe("new");
    expect(saved?.messages.map((message) => message.content)).toEqual(["Question", "Answer"]);
  });
  it("throttles live saves but flushes final output immediately", () => {
    vi.useFakeTimers();
    try {
      useAgentStore.setState({ sessions: [session] });
      flushPiConversations();
      mocks.save.mockClear();
      const updated = { ...session, events: [...session.events, { id: "b", type: "output" as const, title: "Pi", detail: "More", at: 3 }] };
      useAgentStore.setState({ sessions: [updated] });
      vi.advanceTimersByTime(1999);
      expect(mocks.save).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(mocks.save).toHaveBeenCalledTimes(1);
      mocks.save.mockClear();
      useAgentStore.setState({ sessions: [{ ...updated, status: "stopped" }] });
      expect(mocks.save).toHaveBeenCalledTimes(1);
      expect(useChatStore.getState().conversations.find((item) => item.id === session.id)?.messages.at(-1)?.content).toContain("More");
      flushPiConversations();
      expect(mocks.save).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

});
