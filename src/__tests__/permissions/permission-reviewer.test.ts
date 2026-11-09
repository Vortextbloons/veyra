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
  return { sendChat: vi.fn() };
});

vi.mock("@/lib/providers", () => ({
  getProviderAdapter: (id: string) =>
    id === "lm-studio" || id === "openai"
      ? {
          id,
          name: id === "openai" ? "OpenAI" : "LM Studio",
          connectivityRequirement: id === "openai" ? "internet" : "local",
          sendChat: mocks.sendChat,
        }
      : undefined,
}));

vi.mock("@/stores/connectivity-store", () => ({
  useConnectivityStore: { getState: () => ({ effectiveConnectivity: "online" }) },
}));

vi.mock("@/stores/provider-store", () => ({
  useProviderStore: { getState: () => ({ selectedProvider: "lm-studio", selectedModel: "chat-model" }) },
}));

import { useSettingsStore } from "@/stores/settings-store";
import {
  REVIEW_POLICY,
  buildReviewPayload,
  parseReviewDecision,
  reviewInvocation,
  reviewerAvailabilityError,
  resolveReviewer,
} from "@/modules/permissions/permission-reviewer";
import type { PermissionInvocation } from "@/modules/permissions/permission-types";

const invocation: PermissionInvocation = {
  sessionId: "session-1",
  toolCallId: "call-1",
  toolName: "bash",
  args: { command: "rm -rf build", timeout: 30 },
  cwd: "C:\\project",
  bridge: "native",
};

function configureReviewer(providerId = "lm-studio", modelId = "review-model") {
  useSettingsStore.setState({ autoReviewProviderId: providerId, autoReviewModelId: modelId });
}

describe("Auto reviewer", () => {
  beforeEach(() => {
    mocks.sendChat.mockReset();
    useSettingsStore.setState({ autoReviewProviderId: "", autoReviewModelId: "" });
  });

  it("sends only policy, tool, exact arguments, and execution metadata", () => {
    const payload = JSON.parse(buildReviewPayload(invocation)) as Record<string, unknown>;
    expect(payload).toEqual({
      tool: "bash",
      execution: { cwd: "C:\\project", shell: "bash" },
      arguments: { command: "rm -rf build", timeout: 30 },
    });
    // Nothing else may ride along: no history, messages, reasoning, or files.
    expect(Object.keys(payload).sort()).toEqual(["arguments", "execution", "tool"]);
  });

  it("has no message history in the review request", async () => {
    configureReviewer();
    mocks.sendChat.mockImplementation(async (options: { onChunk: (chunk: string) => void; onComplete: () => void }) => {
      options.onChunk('{"decision":"deny","reason":"Deletes a build directory."}');
      options.onComplete();
    });

    await reviewInvocation(invocation);

    expect(mocks.sendChat).toHaveBeenCalledTimes(1);
    const options = mocks.sendChat.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      tools?: unknown[];
      toolChoice?: string;
      temperature?: number;
      signal?: AbortSignal;
    };
    expect(options.messages).toHaveLength(2);
    expect(options.messages[0]).toMatchObject({ role: "system", content: REVIEW_POLICY });
    expect(options.messages[1].role).toBe("user");
    expect(JSON.parse(options.messages[1].content)).toEqual({
      tool: "bash",
      execution: { cwd: "C:\\project", shell: "bash" },
      arguments: { command: "rm -rf build", timeout: 30 },
    });
    // The reviewer cannot act.
    expect(options.tools).toEqual([]);
    expect(options.toolChoice).toBe("none");
    expect(options.temperature).toBe(0);
  });

  it("returns the structured decision and reason", async () => {
    configureReviewer("openai");
    mocks.sendChat.mockImplementation(async (options: { onChunk: (chunk: string) => void; onComplete: () => void }) => {
      options.onChunk('```json\n{"decision":"allow","reason":"Runs the test suite in the project folder."}\n```');
      options.onComplete();
    });
    const summary = await reviewInvocation(invocation);
    expect(summary).toMatchObject({ outcome: "allow", reason: "Runs the test suite in the project folder." });
    expect(summary.reviewerLabel).toContain("OpenAI");
  });

  it("treats unparsable reviewer output as unavailable, never as approval", async () => {
    configureReviewer();
    for (const output of [
      "",
      "sure, go ahead",
      '{"decision":"maybe","reason":"unsure"}',
      '{"decision":"allow"}',
      '{"decision":"allow","reason":42}',
      "not json at all",
    ]) {
      mocks.sendChat.mockResolvedValue(undefined);
      mocks.sendChat.mockImplementation(async (options: { onChunk: (chunk: string) => void; onComplete: () => void }) => {
        if (output) options.onChunk(output);
        options.onComplete();
      });
      const summary = await reviewInvocation(invocation);
      expect(summary.outcome).toBe("unavailable");
    }
  });

  it("treats provider errors and a missing reviewer as unavailable", async () => {
    configureReviewer();
    mocks.sendChat.mockImplementation(async (options: { onError: (error: string) => void }) => {
      options.onError("Provider refused the request.");
    });
    expect((await reviewInvocation(invocation)).outcome).toBe("unavailable");

    mocks.sendChat.mockReset();
    useSettingsStore.setState({ autoReviewProviderId: "", autoReviewModelId: "" });
    const noReviewer = await reviewInvocation(invocation);
    expect(noReviewer.outcome).toBe("unavailable");
    expect(mocks.sendChat).not.toHaveBeenCalled();
  });

  it("does not call an unknown provider", async () => {
    useSettingsStore.setState({ autoReviewProviderId: "removed-provider", autoReviewModelId: "m" });
    const summary = await reviewInvocation(invocation);
    expect(summary.outcome).toBe("unavailable");
    expect(mocks.sendChat).not.toHaveBeenCalled();
  });

  it("resolves the configured reviewer and explains what is missing", () => {
    expect(resolveReviewer()).toBeNull();
    expect(reviewerAvailabilityError(null)).toContain("needs your decision");

    configureReviewer("lm-studio", "review-model");
    expect(resolveReviewer()).toEqual({ providerId: "lm-studio", modelId: "review-model" });
    expect(reviewerAvailabilityError(resolveReviewer())).toBeNull();

    configureReviewer("gone", "m");
    expect(reviewerAvailabilityError(resolveReviewer())).toContain("needs your decision");
  });

  it("parses a decision only when both fields are usable", () => {
    expect(parseReviewDecision('{"decision":"deny","reason":"Reads a secret."}'))
      .toEqual({ decision: "deny", reason: "Reads a secret." });
    expect(parseReviewDecision('{"decision":"deny","reason":"   "}')).toBeNull();
    expect(parseReviewDecision("[]")).toBeNull();
  });
});
