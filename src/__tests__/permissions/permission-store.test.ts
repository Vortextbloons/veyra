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
  return { reviewInvocation: vi.fn() };
});

vi.mock("@/modules/permissions/permission-reviewer", () => ({
  reviewInvocation: mocks.reviewInvocation,
}));

import { useSettingsStore } from "@/stores/settings-store";
import { usePermissionStore, resolvePermissionMode } from "@/modules/permissions/permission-store";
import type { PermissionInvocation } from "@/modules/permissions/permission-types";

function invocation(overrides: Partial<PermissionInvocation> = {}): PermissionInvocation {
  return {
    sessionId: "session-1",
    toolCallId: "call-1",
    toolName: "bash",
    args: { command: "npm test" },
    cwd: "C:\\project",
    bridge: "native",
    ...overrides,
  };
}

function resetStores() {
  usePermissionStore.setState({ chatPermissionModes: {}, pending: [], history: [] });
  useSettingsStore.setState({ permissionMode: "ask", protectedToolIds: ["bash"] });
}

describe("permission lifecycle", () => {
  beforeEach(() => {
    resetStores();
    mocks.reviewInvocation.mockReset();
  });

  it("waits for a decision and runs only after Accept once", async () => {
    const decision = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));

    const [card] = usePermissionStore.getState().pending;
    expect(card).toMatchObject({ toolName: "bash", state: "awaiting-user", cwd: "C:\\project" });

    usePermissionStore.getState().acceptOnce(card.id);
    await expect(decision).resolves.toMatchObject({ outcome: "allow", source: "user" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
    expect(usePermissionStore.getState().history[0]).toMatchObject({ toolName: "bash", outcome: "allow" });
  });

  it("denies and never runs when the user denies", async () => {
    const decision = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;

    usePermissionStore.getState().deny(card.id);
    await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "user" });
    expect(usePermissionStore.getState().history[0]).toMatchObject({ outcome: "deny", toolName: "bash" });
  });

  it("does not reuse one approval for a second call", async () => {
    const first = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;
    usePermissionStore.getState().acceptOnce(card.id);
    await expect(first).resolves.toMatchObject({ outcome: "allow" });

    // Same command, different Pi tool call id: a new decision is required.
    let settled = false;
    const second = usePermissionStore.getState().authorize(invocation({ toolCallId: "call-2" }));
    void second.then(() => { settled = true; });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    expect(settled).toBe(false);
    expect(usePermissionStore.getState().pending[0].toolCallId).toBe("call-2");
  });

  it("binds the approval to the exact arguments and cwd", async () => {
    const decision = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;

    // Mutating the pending record cannot smuggle a different command through:
    // the fingerprint captured at request time no longer matches, so the call
    // is denied rather than executed.
    usePermissionStore.setState((state) => ({
      pending: state.pending.map((item) =>
        item.id === card.id ? { ...item, args: { command: "rm -rf ." } } : item),
    }));
    usePermissionStore.getState().acceptOnce(card.id);

    await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "stale" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("denies everything pending when the session is cancelled", async () => {
    const first = usePermissionStore.getState().authorize(invocation({ toolCallId: "a" }));
    const second = usePermissionStore.getState().authorize(invocation({ toolCallId: "b", args: { command: "ls" } }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(2));

    usePermissionStore.getState().cancelSession("session-1");
    await expect(first).resolves.toMatchObject({ outcome: "deny", source: "cancelled" });
    await expect(second).resolves.toMatchObject({ outcome: "deny", source: "cancelled" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("denies an aborted call and clears its card", async () => {
    const controller = new AbortController();
    const decision = usePermissionStore.getState().authorize(invocation(), controller.signal);
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));

    controller.abort();
    await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "cancelled" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("does not queue anything for an already-aborted call", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(usePermissionStore.getState().authorize(invocation(), controller.signal))
      .resolves.toMatchObject({ outcome: "deny", source: "cancelled" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("ignores a stale approval for a call that was already settled", async () => {
    const decision = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;

    usePermissionStore.getState().deny(card.id);
    await expect(decision).resolves.toMatchObject({ outcome: "deny" });

    // Second click on the removed card must be inert.
    usePermissionStore.getState().acceptOnce(card.id);
    expect(usePermissionStore.getState().history).toHaveLength(1);
    expect(usePermissionStore.getState().history[0].outcome).toBe("deny");
  });

  it("runs immediately in Full access without asking", async () => {
    useSettingsStore.setState({ permissionMode: "full" });
    const decision = await usePermissionStore.getState().authorize(invocation());
    expect(decision).toMatchObject({ outcome: "allow", source: "full-access" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
    expect(mocks.reviewInvocation).not.toHaveBeenCalled();
  });

  it("still requires a decision for unprotected tools but never queues one", async () => {
    const decision = await usePermissionStore.getState().authorize(invocation({ toolName: "read", args: { path: "a.ts" } }));
    expect(decision).toMatchObject({ outcome: "allow", source: "unprotected" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
    // Unprotected calls are not written to local history.
    expect(usePermissionStore.getState().history).toHaveLength(0);
  });

  it("never runs a tool that is not protected even in Full access with a bad mode", async () => {
    useSettingsStore.setState({ permissionMode: "ask", protectedToolIds: [] });
    const decision = await usePermissionStore.getState().authorize(invocation());
    expect(decision).toMatchObject({ outcome: "allow", source: "unprotected" });
  });

  it("approves waiting calls when the chat switches to Full access", async () => {
    const decision = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));

    usePermissionStore.getState().setChatPermissionMode("session-1", "full");
    await expect(decision).resolves.toMatchObject({ outcome: "allow", source: "full-access" });
    expect(usePermissionStore.getState().pending).toHaveLength(0);
  });

  it("keeps a per-chat override separate from the default", () => {
    useSettingsStore.setState({ permissionMode: "ask" });
    expect(resolvePermissionMode("session-1")).toBe("ask");
    expect(resolvePermissionMode("session-2")).toBe("ask");
    usePermissionStore.getState().setChatPermissionMode("session-1", "full");
    expect(resolvePermissionMode("session-1")).toBe("full");
    expect(resolvePermissionMode("session-2")).toBe("ask");
    usePermissionStore.getState().setChatPermissionMode("session-1", null);
    expect(resolvePermissionMode("session-1")).toBe("ask");
  });

  it("handles several concurrent calls independently", async () => {
    const first = usePermissionStore.getState().authorize(invocation({ toolCallId: "a", args: { command: "ls" } }));
    const second = usePermissionStore.getState().authorize(invocation({ toolCallId: "b", args: { command: "pwd" } }));
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(2));

    const [cardA, cardB] = usePermissionStore.getState().pending;
    usePermissionStore.getState().deny(cardA.id);
    usePermissionStore.getState().acceptOnce(cardB.id);

    await expect(first).resolves.toMatchObject({ outcome: "deny", source: "user" });
    await expect(second).resolves.toMatchObject({ outcome: "allow", source: "user" });
  });

  it("denies a duplicate request for the same invocation instead of double-resolving", async () => {
    const first = usePermissionStore.getState().authorize(invocation());
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const second = usePermissionStore.getState().authorize(invocation());

    await expect(first).resolves.toMatchObject({ outcome: "deny", source: "duplicate" });
    await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
    const [card] = usePermissionStore.getState().pending;
    usePermissionStore.getState().acceptOnce(card.id);
    await expect(second).resolves.toMatchObject({ outcome: "allow", source: "user" });
  });
  describe("Auto mode", () => {
    beforeEach(() => {
      useSettingsStore.setState({ permissionMode: "auto" });
    });

    it("runs when the reviewer allows", async () => {
      mocks.reviewInvocation.mockResolvedValue({ outcome: "allow", reason: "Reads the test output.", reviewerLabel: "Reviewer" });
      const decision = await usePermissionStore.getState().authorize(invocation());
      expect(decision).toMatchObject({ outcome: "allow", source: "reviewer" });
      expect(usePermissionStore.getState().pending).toHaveLength(0);
    });

    it("holds a denied call for manual acceptance and never auto-runs it", async () => {
      mocks.reviewInvocation.mockResolvedValue({ outcome: "deny", reason: "Deletes files.", reviewerLabel: "OpenAI · reviewer" });
      const decision = usePermissionStore.getState().authorize(invocation());
      await vi.waitFor(() => expect(usePermissionStore.getState().pending[0]?.state).toBe("awaiting-user"));

      const [card] = usePermissionStore.getState().pending;
      expect(card.review).toMatchObject({ outcome: "deny", reason: "Deletes files." });
      expect(card.needsManualReview).toBe(true);

      let settled = false;
      void decision.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);

      // The user may accept this exact invocation once by hand.
      usePermissionStore.getState().acceptOnce(card.id);
      await expect(decision).resolves.toMatchObject({ outcome: "allow", source: "user" });
    });

    it("shows manual approval when the reviewer is unavailable, and never runs on its own", async () => {
      mocks.reviewInvocation.mockResolvedValue({ outcome: "unavailable", reason: "Reviewer offline.", reviewerLabel: "Reviewer" });
      const decision = usePermissionStore.getState().authorize(invocation());
      await vi.waitFor(() => expect(usePermissionStore.getState().pending[0]?.state).toBe("awaiting-user"));

      const [card] = usePermissionStore.getState().pending;
      expect(card.needsManualReview).toBe(true);
      expect(card.note).toContain("Reviewer offline.");

      usePermissionStore.getState().deny(card.id);
      await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "user" });
    });

    it("keeps Auto pending until manual acceptance when no reviewer is configured", async () => {
      mocks.reviewInvocation.mockResolvedValue({ outcome: "unavailable", reason: "No reviewer model is selected.", reviewerLabel: "Reviewer" });
      const decision = usePermissionStore.getState().authorize(invocation());
      await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
      expect(usePermissionStore.getState().pending[0].state).toBe("awaiting-user");
      usePermissionStore.getState().acceptOnce(usePermissionStore.getState().pending[0].id);
      await expect(decision).resolves.toMatchObject({ outcome: "allow", source: "user" });
    });

    it("falls back to a manual decision if Auto is switched off while reviewing", async () => {
      let releaseReview: (value: { outcome: "allow"; reason: string; reviewerLabel: string }) => void = () => {};
      mocks.reviewInvocation.mockReturnValue(new Promise((resolve) => { releaseReview = resolve; }));

      const decision = usePermissionStore.getState().authorize(invocation());
      await vi.waitFor(() => expect(usePermissionStore.getState().pending[0]?.state).toBe("reviewing"));

      usePermissionStore.getState().setChatPermissionMode("session-1", "ask");
      releaseReview({ outcome: "allow", reason: "Looks fine.", reviewerLabel: "Reviewer" });

      await vi.waitFor(() => expect(usePermissionStore.getState().pending[0]?.state).toBe("awaiting-user"));
      let settled = false;
      void decision.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(usePermissionStore.getState().pending[0].note).toContain("Auto is off");
    });

    it("ignores a late reviewer answer after the call was cancelled", async () => {
      let releaseReview: (value: { outcome: "allow"; reason: string; reviewerLabel: string }) => void = () => {};
      mocks.reviewInvocation.mockReturnValue(new Promise((resolve) => { releaseReview = resolve; }));

      const decision = usePermissionStore.getState().authorize(invocation());
      await vi.waitFor(() => expect(usePermissionStore.getState().pending).toHaveLength(1));
      usePermissionStore.getState().cancelSession("session-1");
      releaseReview({ outcome: "allow", reason: "Looks fine.", reviewerLabel: "Reviewer" });

      await expect(decision).resolves.toMatchObject({ outcome: "deny", source: "cancelled" });
      await Promise.resolve();
      expect(usePermissionStore.getState().pending).toHaveLength(0);
    });
  });
});
