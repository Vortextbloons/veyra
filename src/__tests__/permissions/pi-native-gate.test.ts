import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- The Pi extension is plain ESM shipped as a Rust include.
import registerExtension from "../../../src-tauri/src/agents/chat-tools.mjs";

type ToolCallEvent = {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  parentToolCallId?: string;
};

type Handler = (event: ToolCallEvent, ctx: Record<string, unknown>) => Promise<unknown>;

function load(options: { tools?: unknown[] } = {}) {
  const handlers: Handler[] = [];
  const registered: unknown[] = [];
  process.env.VEYRA_CHAT_TOOLS = JSON.stringify(options.tools ?? []);
  registerExtension({
    registerTool: (tool: unknown) => registered.push(tool),
    on: (name: string, handler: Handler) => {
      if (name === "tool_call") handlers.push(handler);
      return () => {};
    },
  });
  return { handlers, registered };
}

function bashEvent(command: string, overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return { type: "tool_call", toolName: "bash", toolCallId: "pi-1", input: { command }, ...overrides };
}

describe("Pi native tool gate extension", () => {
  it("asks the host before running bash and blocks when the answer is not a decision", async () => {
    const { handlers } = load();
    expect(handlers).toHaveLength(1);

    for (const answer of [undefined, "", "not json", '{"outcome":"maybe"}', "[]"]) {
      const ui = { input: vi.fn().mockResolvedValue(answer) };
      const result = await handlers[0](bashEvent("rm -rf build"), { ui, cwd: "C:\\project", signal: undefined });
      expect(result).toMatchObject({ block: true });
      expect(ui.input).toHaveBeenCalledOnce();
    }
  });

  it("passes only the tool name, arguments, and cwd to the host", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn().mockResolvedValue('{"outcome":"allow"}') };
    await handlers[0](bashEvent("npm test", { input: { command: "npm test", timeout: 30 } }), { ui, cwd: "C:\\project", signal: undefined });

    const [title, placeholder] = ui.input.mock.calls[0] as [string, string];
    expect(title).toBe("veyra_permission");
    expect(JSON.parse(placeholder)).toEqual({
      id: "pi-1",
      name: "bash",
      arguments: { command: "npm test", timeout: 30 },
      cwd: "C:\\project",
      parentToolCallId: undefined,
    });
  });

  it("runs only when the host allows", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn().mockResolvedValue('{"outcome":"allow"}') };
    await expect(handlers[0](bashEvent("npm test"), { ui, cwd: "/p", signal: undefined }))
      .resolves.toBeUndefined();
  });

  it("blocks with the user's reason when denied", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn().mockResolvedValue('{"outcome":"deny","reason":"Not this folder."}') };
    const result = await handlers[0](bashEvent("npm test"), { ui, cwd: "/p", signal: undefined }) as { block: boolean; reason: string };
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Not this folder.");
    // Denial must read as feedback the assistant can act on, not a crash.
    expect(result.reason).toContain("did not run");
  });

  it("blocks fail-closed when the host channel throws", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn().mockRejectedValue(new Error("channel closed")) };
    const result = await handlers[0](bashEvent("npm test"), { ui, cwd: "/p", signal: undefined }) as { block: boolean; reason: string };
    expect(result.block).toBe(true);
    expect(result.reason).toContain("was not run");
  });

  it("blocks when the run is already aborted", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    const result = await handlers[0](bashEvent("npm test"), { ui, cwd: "/p", signal: controller.signal }) as { block: boolean };
    expect(result.block).toBe(true);
    expect(ui.input).not.toHaveBeenCalled();
  });

  it("gates nested native calls and ignores non-native tools", async () => {
    const { handlers } = load();
    const ui = { input: vi.fn().mockResolvedValue('{"outcome":"deny","reason":"no"}') };

    await handlers[0](bashEvent("npm test", { toolCallId: "parent/1", parentToolCallId: "parent" }), { ui, cwd: "/p", signal: undefined });
    expect(ui.input).toHaveBeenCalledOnce();

    ui.input.mockClear();
    await expect(handlers[0]({ type: "tool_call", toolName: "web_search", toolCallId: "c", input: {} }, { ui, cwd: "/p", signal: undefined }))
      .resolves.toBeUndefined();
    expect(ui.input).not.toHaveBeenCalled();
  });

  it("still registers Veyra host tools", () => {
    const { registered } = load({
      tools: [{
        function: {
          name: "web_search",
          description: "Search.",
          parameters: { type: "object", properties: {} },
        },
      }],
    });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ name: "web_search", label: "web_search" });
  });

  it("keeps host tool calls on their own request title", async () => {
    const { registered } = load({
      tools: [{
        function: { name: "web_search", description: "Search.", parameters: { type: "object", properties: {} } },
      }],
    });
    const tool = registered[0] as { execute: (id: string, args: unknown, signal: AbortSignal, update: unknown, ctx: unknown) => Promise<unknown> };
    const ui = { input: vi.fn().mockResolvedValue("evidence") };
    const result = await tool.execute("t-1", { query: "x" }, new AbortController().signal, undefined, { ui }) as { content: Array<{ text: string }> };

    // The permission channel and the host-tool channel must stay distinct,
    // otherwise a host call would be answered by the permission gate.
    expect(ui.input.mock.calls[0][0]).toBe("veyra_tool");
    expect(JSON.parse(ui.input.mock.calls[0][1])).toEqual({ id: "t-1", name: "web_search", arguments: { query: "x" } });
    expect(result.content[0].text).toBe("evidence");
  });
});


describe("Pi system prompt replacement", () => {
  it("omits inherited workspace context when no project is attached", async () => {
    vi.stubEnv("VEYRA_REPLACE_SYSTEM_PROMPT", "0");
    vi.stubEnv("VEYRA_NO_PROJECT", "1");
    vi.stubEnv("VEYRA_SYSTEM_PROMPT", "User instructions.");
    vi.stubEnv("VEYRA_CHAT_TOOLS", "[]");
    try {
      const handlers = new Map<string, () => Promise<unknown>>();
      registerExtension({ registerTool: vi.fn(), on: (name: string, handler: () => Promise<unknown>) => handlers.set(name, handler) });
      const result = await handlers.get("before_agent_start")?.();
      expect(result).toEqual({ systemPrompt: expect.stringContaining("No project is attached.") });
      expect(result).toEqual({ systemPrompt: expect.stringContaining("User instructions.") });
    } finally { vi.unstubAllEnvs(); }
  });
  it.each(["Only my instructions.", ""])("overrides the assembled prompt exactly: %j", async (prompt) => {
    vi.stubEnv("VEYRA_REPLACE_SYSTEM_PROMPT", "1");
    vi.stubEnv("VEYRA_SYSTEM_PROMPT", prompt);
    vi.stubEnv("VEYRA_CHAT_TOOLS", "[]");
    try {
      const handlers = new Map<string, () => Promise<unknown>>();
      registerExtension({registerTool: vi.fn(), on: (name: string, handler: () => Promise<unknown>) => handlers.set(name, handler)});
      const handler = handlers.get("before_agent_start");
      expect(handler).toBeDefined();
      expect(await handler?.()).toEqual({systemPrompt: prompt});
      expect(handlers.has("tool_call")).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("leaves normal prompt assembly intact", () => {
    vi.stubEnv("VEYRA_REPLACE_SYSTEM_PROMPT", "0");
    vi.stubEnv("VEYRA_CHAT_TOOLS", "[]");
    try {
      const on = vi.fn();
      registerExtension({registerTool: vi.fn(), on});
      expect(on.mock.calls.some(([name]) => name === "before_agent_start")).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
});
