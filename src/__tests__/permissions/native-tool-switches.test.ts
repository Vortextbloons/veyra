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
  return { values };
});

vi.mock("@/modules/permissions/permission-reviewer", () => ({ reviewInvocation: vi.fn() }));

const { useSettingsStore } = await import("@/stores/settings-store");
const {
  enabledNativeTools,
  isNativeToolEnabled,
  TOGGLEABLE_NATIVE_TOOLS,
} = await import("@/modules/permissions/permission-policy");
const {
  enabledNativeToolsForChat,
  isNativeToolEnabledForChat,
  usePermissionStore,
} = await import("@/modules/permissions/permission-store");

function reset() {
  mocks.values.clear();
  usePermissionStore.setState({
    chatPermissionModes: {},
    chatDisabledNativeTools: {},
    pending: [],
    history: [],
  });
  useSettingsStore.setState({
    permissionMode: "ask",
    protectedToolIds: ["bash"],
    disabledNativeToolIds: [],
  });
}

describe("native tool switches", () => {
  beforeEach(reset);

  it("offers bash by default and nothing else as a per-chat switch", () => {
    expect(TOGGLEABLE_NATIVE_TOOLS).toEqual(["bash"]);
    expect(isNativeToolEnabled("bash", { disabled: [], chatDisabled: [] })).toBe(true);
    expect(enabledNativeTools({ disabled: [], chatDisabled: [] })).toEqual([
      "read", "bash", "edit", "write", "grep", "find", "ls",
    ]);
  });

  it("removes a globally disabled tool from what Pi is offered", () => {
    expect(enabledNativeTools({ disabled: ["bash"], chatDisabled: [] }))
      .toEqual(["read", "edit", "write", "grep", "find", "ls"]);
    expect(isNativeToolEnabled("bash", { disabled: ["bash"], chatDisabled: [] })).toBe(false);
  });

  it("removes a chat-disabled tool for that chat only", () => {
    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", false);

    expect(enabledNativeToolsForChat("chat-a")).toEqual(["read", "edit", "write", "grep", "find", "ls"]);
    // Another chat is untouched.
    expect(enabledNativeToolsForChat("chat-b")).toEqual([
      "read", "bash", "edit", "write", "grep", "find", "ls",
    ]);
  });

  it("lets a chat turn bash back on for itself", () => {
    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", false);
    expect(isNativeToolEnabledForChat("chat-a", "bash")).toBe(false);

    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", true);
    expect(isNativeToolEnabledForChat("chat-a", "bash")).toBe(true);
    // Re-enabling clears the entry rather than keeping an empty array.
    expect(usePermissionStore.getState().chatDisabledNativeTools["chat-a"]).toBeUndefined();
  });

  it("keeps a global switch authoritative over a per-chat switch", () => {
    useSettingsStore.setState({ disabledNativeToolIds: ["bash"] });
    // A chat cannot re-enable what the setting turned off.
    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", true);
    expect(isNativeToolEnabledForChat("chat-a", "bash")).toBe(false);
    expect(enabledNativeToolsForChat("chat-a")).not.toContain("bash");
  });

  it("never disables the always-on file tools", () => {
    useSettingsStore.setState({ disabledNativeToolIds: ["read", "edit"] });
    expect(enabledNativeTools({
      disabled: useSettingsStore.getState().disabledNativeToolIds,
      chatDisabled: [],
    })).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls"]);
  });

  it("stays unchanged for tools outside the native set", () => {
    expect(isNativeToolEnabled("web_search", { disabled: ["bash"], chatDisabled: ["bash"] })).toBe(true);
    expect(isNativeToolEnabled("mcp__files__write", { disabled: ["bash"], chatDisabled: [] })).toBe(true);
  });

  it("sets and clears the global default", () => {
    const { setNativeToolEnabled } = useSettingsStore.getState();
    setNativeToolEnabled("bash", false);
    expect(useSettingsStore.getState().disabledNativeToolIds).toEqual(["bash"]);
    // Repeated calls cannot duplicate an entry.
    setNativeToolEnabled("bash", false);
    expect(useSettingsStore.getState().disabledNativeToolIds).toEqual(["bash"]);

    setNativeToolEnabled("bash", true);
    expect(useSettingsStore.getState().disabledNativeToolIds).toEqual([]);
  });

  it("denies a pending bash approval when the chat switches it off", async () => {
    let settled = false;
    const decision = usePermissionStore.getState().authorize({
      sessionId: "chat-a",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "npm test" },
      cwd: "C:\\project",
      bridge: "native",
    });
    void decision.then(() => { settled = true; });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    expect(settled).toBe(false);

    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", false);

    // The waiting call can no longer run, so it is refused rather than left open.
    await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "disabled" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("refuses a new call for a disabled tool in any mode", async () => {
    useSettingsStore.setState({ permissionMode: "full" });
    usePermissionStore.getState().setChatNativeToolEnabled("chat-a", "bash", false);

    await expect(usePermissionStore.getState().authorize({
      sessionId: "chat-a",
      toolCallId: "call-2",
      toolName: "bash",
      args: { command: "npm test" },
      cwd: "C:\\project",
      bridge: "native",
    })).resolves.toMatchObject({ outcome: "deny", source: "disabled" });

    // Full access never overrides an explicit off switch.
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });
});
