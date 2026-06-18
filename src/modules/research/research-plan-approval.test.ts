import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchPlan } from "./research-types";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  getState: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("./research-store", () => ({
  useResearchStore: {
    getState: mocks.getState,
  },
}));

import { waitForPlanApproval } from "./research-plan-approval";

describe("waitForPlanApproval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.listen.mockReset();
    mocks.getState.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitForPlanApproval("run-1", controller.signal)).resolves.toBeNull();
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("resolves with the approved plan when the approval event arrives", async () => {
    let handler: ((event: { payload: unknown }) => Promise<void>) | undefined;
    mocks.listen.mockImplementation(async (_eventName: string, cb: (event: { payload: unknown }) => Promise<void>) => {
      handler = cb;
      return vi.fn();
    });

    const plan: ResearchPlan = {
      id: "plan-1",
      runId: "run-1",
      steps: [],
      userApproved: true,
      userEdited: false,
      createdAt: "2026-06-18T12:00:00.000Z",
    };

    const state = {
      activeRun: null as null | { run: { plan: ResearchPlan } },
    };

    const store = {
      loadRun: vi.fn(async () => {
        state.activeRun = { run: { plan } };
      }),
      activeRunOrNull: vi.fn(() => state.activeRun),
    };
    mocks.getState.mockReturnValue(store);

    const controller = new AbortController();
    const promise = waitForPlanApproval("run-1", controller.signal);

    expect(handler).toBeTypeOf("function");
    await handler?.({ payload: { runId: "run-1" } });

    await expect(promise).resolves.toEqual(plan);
    expect(store.loadRun).toHaveBeenCalledWith("run-1");
  });
});
