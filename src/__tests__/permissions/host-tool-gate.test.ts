import { beforeEach, describe, expect, it, vi } from "vitest";

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
  return { search: vi.fn(), execute: vi.fn(), invokeMcpTool: vi.fn(), resolveMcpTool: vi.fn() };
});
vi.mock("@/lib/code-execution/runner", () => ({ runJavaScript: mocks.execute }));

vi.mock("@/modules/web-search/orchestrator/SearchOrchestrator", () => ({
  runSearch: mocks.search,
  buildSearchContextBlock: () => "evidence",
  resolveSearchContextTokenLimit: () => 1000,
}));

vi.mock("@/modules/extensions/mcp-tool-adapter", () => ({
  buildMcpProviderTools: () => [{ type: "function", function: { name: "mcp__files__write", description: "w", parameters: {} } }],
  invokeMcpTool: mocks.invokeMcpTool,
  mcpCapabilityId: (serverId: string, toolName: string) => `mcp__${serverId}__${toolName}`,
  resolveMcpTool: mocks.resolveMcpTool,
}));

vi.mock("./pi-questions", () => ({ askPiQuestion: vi.fn() }));

import { createPiChatTools } from "@/modules/agents/pi-chat-tools";
import { usePermissionStore } from "@/modules/permissions/permission-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { useConnectivityStore } from "@/stores/connectivity-store";

function toolRequest(name: string, args: Record<string, unknown>) {
  return { title: "veyra_tool", placeholder: JSON.stringify({ id: "call-1", name, arguments: args }) };
}

function bridge(signal = new AbortController().signal) {
  return createPiChatTools({
    sessionId: "session-1",
    scopeId: "session-1",
    webSearchEnabled: true,
    cwd: "C:\\project",
    signal,
    onOutput: vi.fn(),
  });
}

describe("host tool permission gate", () => {
  beforeEach(() => {
    mocks.search.mockReset().mockResolvedValue({});
    mocks.execute.mockReset().mockResolvedValue({ logs: [], result: 2 });
    mocks.invokeMcpTool.mockReset().mockResolvedValue({ ok: true });
    mocks.resolveMcpTool.mockReset();
    useConnectivityStore.setState({ effectiveConnectivity: "online" });
    useSettingsStore.setState({
      artifactsEnabled: false,
      codeExecutionEnabled: true,
      interactiveAnswersEnabled: false,
      permissionMode: "ask",
      protectedToolIds: ["bash"],
    });
    usePermissionStore.setState({ chatPermissionModes: {}, pending: [], history: [] });
    useExtensionsStore.setState({
      mcpServers: [],
      policies: {},
      grants: [],
      featureFlags: { mcp: true, stdio: true, streamableHttp: true },
      chatDisabledMcpServerIds: {},
      chatEnabledMcpServerIds: {},
    });
  });

  it("gates code execution and honors disabling it while approval is pending", async () => {
    useSettingsStore.setState({ protectedToolIds: ["code_execution"] });
    const call = bridge().handle(toolRequest("code_execution", { code: "return 1+1;" }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    expect(mocks.execute).not.toHaveBeenCalled();
    useSettingsStore.setState({ codeExecutionEnabled: false });
    usePermissionStore.getState().acceptOnce(usePermissionStore.getState().pending[0].id);
    await expect(call).resolves.toContain("no longer enabled");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("runs protected JavaScript only after acceptance", async () => {
    useSettingsStore.setState({ protectedToolIds: ["code_execution"] });
    const call = bridge().handle(toolRequest("code_execution", { code: "return 1+1;" }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    expect(mocks.execute).not.toHaveBeenCalled();
    usePermissionStore.getState().acceptOnce(usePermissionStore.getState().pending[0].id);
    await expect(call).resolves.toBe('{"logs":[],"result":2}');
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("lets an unprotected tool run without queueing a request", async () => {
    const result = await bridge().handle(toolRequest("web_search", { query: "x" }));
    expect(result).toBe("evidence");
    expect(usePermissionStore.getState().pending).toHaveLength(0);
    expect(mocks.search).toHaveBeenCalledOnce();
  });

  it("does not run a protected host tool until it is accepted", async () => {
    useSettingsStore.setState({ protectedToolIds: ["web_search"] });
    let settled = false;
    const call = bridge().handle(toolRequest("web_search", { query: "x" }));
    void call.then(() => { settled = true; });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));

    // The tool must not have executed while the card is waiting.
    expect(mocks.search).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    const [card] = usePermissionStore.getState().pending;
    expect(card).toMatchObject({ toolName: "web_search", bridge: "host", cwd: "C:\\project" });

    usePermissionStore.getState().acceptOnce(card.id);
    await expect(call).resolves.toBe("evidence");
    expect(mocks.search).toHaveBeenCalledOnce();
  });

  it("returns denial text and never executes when the user denies", async () => {
    useSettingsStore.setState({ protectedToolIds: ["web_search"] });
    const call = bridge().handle(toolRequest("web_search", { query: "x" }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    usePermissionStore.getState().deny(usePermissionStore.getState().pending[0].id);

    await expect(call).resolves.toContain("Denied by you");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("still requires the existing MCP grant even under Full access", async () => {
    useSettingsStore.setState({ permissionMode: "full", protectedToolIds: ["mcp"] });
    useExtensionsStore.setState({
      mcpServers: [{ id: "files", name: "Files", capabilityFingerprint: "fp", transport: "stdio", executable: "x", arguments: [], enabled: true, projectIds: [] } as never],
      grants: [],
    });
    mocks.resolveMcpTool.mockReturnValue({
      server: { id: "files", name: "Files", capabilityFingerprint: "fp" },
      toolName: "write",
    });

    const result = await bridge().handle(toolRequest("mcp__files__write", { path: "a" }));
    // Full access cleared the permission gate, but the MCP approval is separate
    // and remains authoritative.
    expect(result).toContain("MCP permission required");
    expect(mocks.invokeMcpTool).not.toHaveBeenCalled();
  });

  it("holds an MCP tool at the permission gate before the grant is even checked", async () => {
    useSettingsStore.setState({ permissionMode: "ask", protectedToolIds: ["mcp"] });
    mocks.resolveMcpTool.mockReturnValue({
      server: { id: "files", name: "Files", capabilityFingerprint: "fp" },
      toolName: "write",
    });
    useExtensionsStore.setState({
      mcpServers: [{ id: "files", name: "Files", capabilityFingerprint: "fp", transport: "stdio", executable: "x", arguments: [], enabled: true, projectIds: [] } as never],
      grants: [],
    });

    const call = bridge().handle(toolRequest("mcp__files__write", { path: "a" }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    expect(mocks.invokeMcpTool).not.toHaveBeenCalled();
    usePermissionStore.getState().acceptOnce(usePermissionStore.getState().pending[0].id);
    // Accepted at the permission gate, then rejected by the missing MCP grant.
    await expect(call).resolves.toContain("MCP permission required");
    expect(mocks.invokeMcpTool).not.toHaveBeenCalled();
  });

  it("rejects a tool that was disabled after the request started", async () => {
    useSettingsStore.setState({ protectedToolIds: [] });
    useConnectivityStore.setState({ effectiveConnectivity: "offline" });
    const result = await bridge().handle(toolRequest("web_search", { query: "x" }));
    expect(result).toContain("no longer enabled");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("denies a native permission request whose payload cannot be read", async () => {
    const result = await bridge().handle({
      title: "veyra_permission",
      placeholder: JSON.stringify({ id: "c", name: "bash" }),
    });
    expect(JSON.parse(String(result))).toMatchObject({ outcome: "deny" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("answers a native permission request only after the user decides", async () => {
    const call = bridge().handle({
      title: "veyra_permission",
      placeholder: JSON.stringify({ id: "pi-1", name: "bash", arguments: { command: "rm -rf build" }, cwd: "C:\\project" }),
    });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;
    expect(card).toMatchObject({ toolName: "bash", bridge: "native", cwd: "C:\\project", sessionId: "session-1" });

    usePermissionStore.getState().deny(card.id, "Not in this folder.");
    expect(JSON.parse(String(await call))).toEqual({ outcome: "deny", reason: "Not in this folder." });
  });

  it("allows a native permission request after Accept once", async () => {
    const call = bridge().handle({
      title: "veyra_permission",
      placeholder: JSON.stringify({ id: "pi-2", name: "bash", arguments: { command: "npm test" }, cwd: "C:\\project" }),
    });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    usePermissionStore.getState().acceptOnce(usePermissionStore.getState().pending[0].id);
    expect(JSON.parse(String(await call))).toEqual({ outcome: "allow" });
  });
});
