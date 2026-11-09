import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  return { search: vi.fn(), execute: vi.fn() };
});
vi.mock("@/lib/code-execution/runner", () => ({ runJavaScript: mocks.execute }));
vi.mock("@/modules/web-search/orchestrator/SearchOrchestrator", () => ({ runSearch: mocks.search, buildSearchContextBlock: () => "Evidence with source links", resolveSearchContextTokenLimit: () => 1000 }));
import { createPiChatTools } from "@/modules/agents/pi-chat-tools";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSettingsStore } from "@/stores/settings-store";

function request(name: string, args: Record<string, unknown>) { return { title: "veyra_tool", placeholder: JSON.stringify({ id: "call", name, arguments: args }) }; }
function bridge(signal = new AbortController().signal) { return createPiChatTools({ sessionId: "session", scopeId: "session", signal, webSearchEnabled: true, onOutput: vi.fn() }); }

describe("Pi host tool routing", () => {
  beforeEach(() => {
    mocks.search.mockReset().mockResolvedValue({});
    mocks.execute.mockReset().mockResolvedValue({ logs: [], result: 42 });
    useConnectivityStore.setState({ effectiveConnectivity: "online" });
    useSettingsStore.setState({ artifactsEnabled: true, interactiveAnswersEnabled: true, codeExecutionEnabled: true });
  });
  it("routes JavaScript offline without a project and rechecks the enable switch", async () => {
    useConnectivityStore.setState({ effectiveConnectivity: "offline" });
    const tools = bridge();
    expect(tools.tools.some((tool) => tool.function.name === "code_execution")).toBe(true);
    expect(await tools.handle(request("code_execution", { code: "return 42;" }))).toBe('{"logs":[],"result":42}');
    expect(mocks.execute).toHaveBeenCalledWith({ code: "return 42;" }, expect.any(AbortSignal));
    useSettingsStore.setState({ codeExecutionEnabled: false });
    expect(await tools.handle(request("code_execution", { code: "return 1;" }))).toContain("no longer enabled");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(bridge().tools.some((tool) => tool.function.name === "code_execution")).toBe(false);
  });
  it("returns Veyra search evidence to Pi and rechecks connectivity before execution", async () => {
    const tools = bridge();
    expect(await tools.handle(request("web_search", { query: "test query" }))).toBe("Evidence with source links");
    expect(mocks.search).toHaveBeenCalledWith("test query", expect.objectContaining({ workflow: "chat" }));
    useConnectivityStore.setState({ effectiveConnectivity: "offline" });
    expect(await tools.handle(request("web_search", { query: "second query" }))).toContain("no longer enabled");
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
  it("rejects unadvertised tools and skips aborted requests", async () => {
    expect(await bridge().handle(request("bash", { command: "echo test" }))).toContain("no longer enabled");
    const controller = new AbortController();
    const tools = bridge(controller.signal);
    controller.abort();
    expect(await tools.handle(request("web_search", { query: "test" }))).toBeUndefined();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("attaches validated rich output and observes settings changes", async () => {
    const onOutput = vi.fn();
    const tools = createPiChatTools({ sessionId: "session", scopeId: "session", signal: new AbortController().signal, webSearchEnabled: false, onOutput });
    expect(await tools.handle(request("create_artifact", { title: "Notes", format: "document", content: "Useful notes" }))).toContain("Output attached");
    expect(onOutput).toHaveBeenCalledWith(expect.objectContaining({ artifact: expect.objectContaining({ content: "Useful notes" }) }));
    useSettingsStore.setState({ artifactsEnabled: false });
    expect(await tools.handle(request("create_artifact", { title: "Notes", format: "document", content: "More" }))).toContain("no longer enabled");
    expect(onOutput).toHaveBeenCalledTimes(1);
  });
});
