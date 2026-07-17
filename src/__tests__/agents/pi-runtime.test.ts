import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

import { runPiAgent } from "@/modules/agents/pi-runtime";

const input = {
  sessionId: "session-1",
  mode: "plan" as const,
  projectPath: "C:\\workspace",
  prompt: "Inspect the project",
  model: "model-1",
};

describe("runPiAgent", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
  });

  it("does not register listeners or invoke the backend for an already-aborted run", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runPiAgent(input, undefined, { signal: controller.signal }),
    ).resolves.toMatchObject({ exitCode: 1, stderr: "Agent run aborted" });

    expect(mocks.listen).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("removes the first listener when the second registration fails", async () => {
    const unlisten = vi.fn();
    mocks.listen
      .mockResolvedValueOnce(unlisten)
      .mockRejectedValueOnce(new Error("event registration failed"));

    await expect(runPiAgent(input)).rejects.toThrow("event registration failed");

    expect(unlisten).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
