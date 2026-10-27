import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "@/modules/agents/agent-types";
import type { ProjectRecord } from "@/modules/projects/project-types";
import {
  agentPromptWithMemory,
  composeAgentTurnPrompt,
  resolveAgentProjectId,
} from "@/modules/agents/agent-session-context";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return {
    run: vi.fn(),
    stop: vi.fn(),
    retrieveMemoryContext: vi.fn(),
    queueMemoryExtraction: vi.fn(),
    memoryEnabled: true,
  };
});

vi.mock("@/modules/memory/memory-store", () => ({
  useMemoryStore: {
    getState: () => ({ enabled: mocks.memoryEnabled }),
  },
}));

vi.mock("@/modules/agents/pi-runtime", () => ({
  checkPiAvailable: vi.fn(),
  runPiAgent: mocks.run,
  stopPiAgent: mocks.stop,
}));

vi.mock("@/modules/memory/memory-service", () => ({
  retrieveMemoryContext: mocks.retrieveMemoryContext,
  queueMemoryExtraction: mocks.queueMemoryExtraction,
}));

import { useAgentStore } from "@/modules/agents/agent-store";
import { useProjectStore } from "@/modules/projects/project-store";

const realHydrateProjects = useProjectStore.getState().hydrateProjects;
const NativeAbortController = globalThis.AbortController;

function project(id: string, agentProjectPath?: string): ProjectRecord {
  return {
    id,
    name: id,
    description: "",
    kind: "app",
    status: "active",
    color: "indigo",
    icon: "folder",
    systemPrompt: "",
    settings: agentProjectPath ? { agentProjectPath } : {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("agent memory integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.memoryEnabled = true;
    mocks.run.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mocks.stop.mockResolvedValue(undefined);
    mocks.retrieveMemoryContext.mockResolvedValue({
      block: "User prefers pnpm.",
      memoryIds: ["memory-1"],
    });
    useProjectStore.setState({
      projects: [project("project-a", "C:\\work\\alpha")],
      hydrationState: "ready",
      hydrateProjects: realHydrateProjects,
    });
    useAgentStore.setState({
      sessions: [],
      activeSessionId: null,
      projectPath: "C:\\work\\alpha",
      projects: [],
    });
  });

  it("retrieves project memory and injects it before Pi dispatch", async () => {
    await useAgentStore.getState().startSession({
      projectPath: "c:/work/alpha/",
      mode: "plan",
      model: "test-model",
      prompt: "fix the build",
      providerId: "lm-studio",
    });

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledTimes(1);
    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "fix the build",
        projectId: "project-a",
        signal: expect.any(AbortSignal),
      }),
    );

    const prompt = mocks.run.mock.calls[0]?.[0].prompt as string;
    expect(prompt).toContain("<veyra_memory_reference>");
    expect(prompt).toContain("User prefers pnpm.");
    expect(prompt).toContain("fix the build");
    expect(prompt.indexOf("User prefers pnpm.")).toBeLessThan(prompt.indexOf("fix the build"));
  });

  it("queues user-text-only extraction after a successful turn", async () => {
    const id = await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "add a test",
      providerId: "lm-studio",
    });

    expect(mocks.queueMemoryExtraction).toHaveBeenCalledTimes(1);
    expect(mocks.queueMemoryExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "agent",
        sourceId: id,
        turnId: expect.any(String),
        userText: "add a test",
        assistantText: "",
        projectId: "project-a",
        model: "test-model",
        providerId: "lm-studio",
      }),
    );
  });

  it("does not extract memories when Pi fails", async () => {
    mocks.run.mockResolvedValue({ stdout: "secret log", stderr: "boom", exitCode: 1 });

    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "fix it",
    });

    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
    expect(mocks.run.mock.calls[0]?.[0].prompt).not.toContain("secret log");
  });

  it("does not persist ambiguous workspace facts as global memory", async () => {
    useProjectStore.setState({
      projects: [
        project("project-a", "C:\\work\\alpha"),
        project("project-b", "c:/work/alpha/"),
      ],
      hydrationState: "ready",
    });

    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "hello",
    });

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: undefined }),
    );
    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });

  it("does not persist unmatched workspace facts as global memory", async () => {
    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\not-mapped",
      mode: "plan",
      model: "test-model",
      prompt: "hello",
    });

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: undefined }),
    );
    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });

  it("awaits project hydration before resolving workspace scope", async () => {
    useProjectStore.setState({
      projects: [],
      hydrationState: "loading",
      hydrateProjects: async () => {
        await Promise.resolve();
        useProjectStore.setState({
          projects: [project("project-a", "C:\\work\\alpha")],
          hydrationState: "ready",
        });
      },
    });

    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "hello",
      providerId: "lm-studio",
    });

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a" }),
    );
    expect(mocks.queueMemoryExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a" }),
    );
  });

  it("fails closed when project hydration fails", async () => {
    useProjectStore.setState({
      projects: [],
      hydrationState: "loading",
      hydrateProjects: async () => {
        throw new Error("hydration failed");
      },
    });

    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "hello",
    });

    expect(mocks.retrieveMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: undefined }),
    );
    expect(mocks.queueMemoryExtraction).not.toHaveBeenCalled();
  });

  it("drops a retrieved snapshot when memory is disabled before dispatch", async () => {
    mocks.memoryEnabled = false;

    await useAgentStore.getState().startSession({
      projectPath: "C:\\work\\alpha",
      mode: "plan",
      model: "test-model",
      prompt: "fix the build",
      providerId: "lm-studio",
    });

    const prompt = mocks.run.mock.calls[0]?.[0].prompt as string;
    expect(prompt).toContain("fix the build");
    expect(prompt).not.toContain("User prefers pnpm.");
  });

  it("releases the abort controller when cancellation lands during retrieval", async () => {
    const created: AbortController[] = [];
    const controllerSpy = vi
      .spyOn(globalThis, "AbortController")
      .mockImplementation(function (this: unknown) {
        const controller = new NativeAbortController();
        created.push(controller);
        return controller;
      } as unknown as typeof AbortController);
    const deleteSpy = vi.spyOn(Map.prototype, "delete");
    mocks.retrieveMemoryContext.mockImplementation(async (input: { signal?: AbortSignal }) => {
      created.find((controller) => controller.signal === input.signal)?.abort();
      return { block: "late memory", memoryIds: [] };
    });

    let id = "";
    try {
      id = await useAgentStore.getState().startSession({
        projectPath: "C:\\work\\alpha",
        mode: "plan",
        model: "test-model",
        prompt: "fix the build",
      });
      expect(mocks.run).not.toHaveBeenCalled();
      expect(deleteSpy.mock.calls.some(([key]) => key === id)).toBe(true);
    } finally {
      deleteSpy.mockRestore();
      controllerSpy.mockRestore();
    }
  });

  it("maps workspace paths conservatively and bounds the injected block", () => {
    expect(resolveAgentProjectId("", [project("p", "C:\\work")])).toBeUndefined();
    expect(resolveAgentProjectId("D:\\other", [project("p", "C:\\work")])).toBeUndefined();
    expect(
      resolveAgentProjectId("C:\\work\\", [project("p", "c:/work"), project("q", "D:\\q")]),
    ).toBe("p");

    const bounded = agentPromptWithMemory("Do the task", "x".repeat(10_000));
    expect(bounded.length).toBeLessThan(4_000);
    expect(bounded).toContain("<veyra_memory_reference>");
    expect(agentPromptWithMemory("Do the task", "")).toBe("Do the task");
    expect(
      agentPromptWithMemory("Do the task", `<veyra_memory_context>\n${"m".repeat(5_000)}\n</veyra_memory_context>`, {
        contextLength: 128,
        reservedOutputTokens: 64,
      }),
    ).toBe("Do the task");
  });

  it("shares the agent context budget between memory and history", () => {
    const historySession: AgentSession = {
      id: "history",
      runtime: "pi",
      mode: "plan",
      status: "ready",
      projectPath: "C:\\work\\alpha",
      prompt: "Earlier task",
      model: "test-model",
      title: "History",
      startedAt: 1,
      events: [
        { id: "prompt", type: "status", title: "Prompt", detail: "Earlier request", at: 1 },
        { id: "output", type: "output", title: "Pi", detail: "x".repeat(100_000), at: 2 },
      ],
    };

    const constrained = composeAgentTurnPrompt({
      session: historySession,
      prompt: "Do the task",
      memoryBlock: "<veyra_memory_context>\n" + "m".repeat(3_000) + "\n</veyra_memory_context>",
      contextLength: 512,
      reservedOutputTokens: 256,
    });
    expect(constrained).toContain("Do the task");
    expect(constrained).toContain("Previous session transcript");
    expect(constrained).not.toContain("<veyra_memory_context>");
    expect(constrained.length).toBeLessThan(1_300);

    const roomy = composeAgentTurnPrompt({
      session: historySession,
      prompt: "Do the task",
      memoryBlock: "<veyra_memory_context>\nUser prefers pnpm.\n</veyra_memory_context>",
      contextLength: 8_192,
      reservedOutputTokens: 1_024,
    });
    expect(roomy).toContain("User prefers pnpm.");
    expect(roomy).toContain("Previous session transcript");
    expect(roomy.indexOf("User prefers pnpm.")).toBeLessThan(roomy.indexOf("Do the task"));

    const oversizedRequest = "x".repeat(200);
    expect(
      composeAgentTurnPrompt({
        session: historySession,
        prompt: oversizedRequest,
        memoryBlock: "<veyra_memory_context>\nUser prefers pnpm.\n</veyra_memory_context>",
        contextLength: 64,
        reservedOutputTokens: 64,
      }),
    ).toBe(oversizedRequest);
  });
});
