import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "@/modules/agents/agent-types";
import { agentSessionPrompt } from "@/modules/agents/agent-session-context";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  return { stop: vi.fn(), run: vi.fn() };
});
vi.mock("@/modules/agents/pi-runtime", () => ({ checkPiAvailable: vi.fn(), runPiAgent: mocks.run, stopPiAgent: mocks.stop }));
import { useAgentStore } from "@/modules/agents/agent-store";

function session(id: string, projectPath: string, status: AgentSession["status"] = "completed"): AgentSession {
  return { id, projectPath, status, runtime: "pi", mode: "plan", prompt: "Inspect", title: id, model: "test", startedAt: 1, events: [
    { id: "prompt", type: "status", title: "Prompt", detail: "Inspect the entry point", at: 1 },
    { id: "answer", type: "output", title: "Pi", detail: "The entry point is main.ts", at: 2 },
  ] };
}

describe("agent project navigation", () => {
  beforeEach(() => {
    mocks.stop.mockClear();
    mocks.run.mockReset();
    mocks.run.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    useAgentStore.setState({ sessions: [session("a", "/project-a", "running"), session("b", "/project-b")], activeSessionId: "a", projectPath: "/project-a", projects: [] });
  });
  it("switches projects without stopping running work and remembers empty projects", () => {
    useAgentStore.getState().setProjectPath("/project-b");
    expect(useAgentStore.getState().activeSessionId).toBe("b");
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(useAgentStore.getState().sessions[0]?.status).toBe("running");
    useAgentStore.getState().setProjectPath("/empty-project");
    expect(useAgentStore.getState().projects).toContain("/empty-project");
    expect(useAgentStore.getState().activeSessionId).toBeNull();
  });
  it("keeps a new session empty when project sessions are refreshed", async () => {
    useAgentStore.getState().newSession();
    await useAgentStore.getState().loadProjectSessions("/project-a");
    expect(useAgentStore.getState().activeSessionId).toBeNull();
  });
  it("restores the session's project and mode when selected", () => {
    useAgentStore.getState().setActiveSessionId("b");
    expect(useAgentStore.getState().projectPath).toBe("/project-b");
    expect(useAgentStore.getState().mode).toBe("plan");
  });
  it("continues the captured session without redirecting project navigation", async () => {
    useAgentStore.getState().setProjectPath("/empty-project");
    const id = await useAgentStore.getState().startSession({ continueSessionId: "b", projectPath: "/project-b", mode: "plan", model: "test", prompt: "Add a test" });
    expect(id).toBe("b");
    expect(mocks.run.mock.calls[0]?.[0].prompt).toContain("The entry point is main.ts");
    expect(useAgentStore.getState().projectPath).toBe("/empty-project");
    expect(useAgentStore.getState().activeSessionId).toBeNull();
  });
  it("keeps command output readable in expandable tool activity", async () => {
    mocks.run.mockImplementation(async (_input, onEvent) => {
      onEvent({ stream: "stdout", sequence: 1, line: JSON.stringify({ type: "tool_execution_end", toolName: "bash", toolCallId: "tool-1", result: { content: [{ type: "text", text: "Test output\n" + "line\n".repeat(5_000) }] } }) });
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    await useAgentStore.getState().startSession({ continueSessionId: "b", projectPath: "/project-b", mode: "plan", model: "test", prompt: "Review" });
    const tool = useAgentStore.getState().sessions.find((item) => item.id === "b")?.events.find((item) => item.type === "tool");
    expect(tool?.detail).toContain("Test output\nline\nline");
    expect(tool?.detail).toContain("[Output truncated]");
    expect(tool?.detail?.length).toBeLessThan(16_100);
  });
});

describe("agent session context", () => {
  it("includes previous decisions and the new task in follow-ups", () => {
    const prompt = agentSessionPrompt(session("a", "/project"), "Add a test");
    expect(prompt).toContain("The entry point is main.ts");
    expect(prompt).toContain("Current task:\nAdd a test");
  });
  it("bounds long histories and leaves new sessions unchanged", () => {
    const previous = session("a", "/project");
    previous.events[1].detail = "x".repeat(100_000);
    expect(agentSessionPrompt(previous, "Next task", 1_000).length).toBeLessThan(1_700);
    expect(agentSessionPrompt(null, "New task")).toBe("New task");
    expect(agentSessionPrompt(previous, "x".repeat(100), 10)).toBe("x".repeat(100));
  });
});
