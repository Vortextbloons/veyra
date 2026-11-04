import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  return { enqueue: vi.fn(), abortBackground: vi.fn(), snapshot: { activeJob: null, queuedJobs: [] as { type: string; conversationId: string }[] }, start: vi.fn().mockResolvedValue("session") };
});
vi.mock("@/lib/ai-scheduler", () => ({ aiScheduler: { getSchedulerSnapshot: () => mocks.snapshot, enqueueAiJob: mocks.enqueue, abortActiveBackgroundJob: mocks.abortBackground } }));
import { useChatSend } from "@/hooks/use-chat-send";
import { useAgentStore } from "@/modules/agents/agent-store";

function sendFromChat() {
  let send: ReturnType<typeof useChatSend>["handleSend"] = () => {};
  function Harness() {
    send = useChatSend({ selectedModel: "model", selectedProvider: "cloud", supportsImages: true, effectiveWebSearchEnabled: true, selectedModelContextSettings: { contextLength: 16384, reservedOutputTokens: 2048 } }).handleSend;
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return send;
}

describe("unified Chat dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.queuedJobs = [];
    useAgentStore.setState({ runtimeAvailable: true, sessions: [], activeSessionId: null, projectPath: "", startSession: mocks.start });
  });
  it("sends through Pi without a project and keeps Veyra web search enabled", async () => {
    sendFromChat()("Answer a question");
    const job = mocks.enqueue.mock.calls[0]?.[0];
    expect(job).toMatchObject({ type: "agent_pi", conversationId: "agent:" });
    await job.run(new AbortController().signal);
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "", prompt: "Answer a question", webSearchEnabled: true }));
    expect(mocks.start.mock.calls[0]?.[0]).not.toHaveProperty("mode");
  });
  it("captures the workspace before a queued message can be redirected", async () => {
    useAgentStore.setState({ activeSessionId: "captured", projectPath: "/first" });
    sendFromChat()("Continue");
    useAgentStore.setState({ activeSessionId: "other", projectPath: "/second" });
    await mocks.enqueue.mock.calls[0]?.[0].run(new AbortController().signal);
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ continueSessionId: "captured", projectPath: "/first" }));
  });
  it("rejects duplicate queued sends and cancelled jobs before starting Pi", async () => {
    mocks.snapshot.queuedJobs = [{ type: "agent_pi", conversationId: "agent:" }];
    sendFromChat()("Duplicate");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    mocks.snapshot.queuedJobs = [];
    sendFromChat()("Cancel this");
    const controller = new AbortController();
    controller.abort();
    await expect(mocks.enqueue.mock.calls[0]?.[0].run(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
