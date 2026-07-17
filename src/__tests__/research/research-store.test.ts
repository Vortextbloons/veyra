import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getResearchRun: vi.fn(),
}));

vi.mock("@/modules/research/research-storage", () => ({
  createResearchRun: vi.fn(),
  getResearchRun: mocks.getResearchRun,
  updateResearchRun: vi.fn(),
  listResearchRuns: vi.fn(),
  deleteResearchRun: vi.fn(),
  createResearchStep: vi.fn(),
  updateResearchStep: vi.fn(),
  createResearchSource: vi.fn(),
  updateResearchSource: vi.fn(),
  createResearchEvidence: vi.fn(),
  createResearchClaim: vi.fn(),
  updateResearchClaim: vi.fn(),
  createResearchContradiction: vi.fn(),
  createResearchReport: vi.fn(),
  updateResearchReport: vi.fn(),
}));

import { useResearchStore } from "@/modules/research/research-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("research store loading", () => {
  beforeEach(() => {
    mocks.getResearchRun.mockReset();
    useResearchStore.setState({
      activeRunId: null,
      activeRun: null,
      isLoading: false,
      error: null,
    });
  });

  it("ignores an older run response that arrives after the selection changed", async () => {
    const runA = deferred<never>();
    const runB = deferred<never>();
    mocks.getResearchRun
      .mockReturnValueOnce(runA.promise)
      .mockReturnValueOnce(runB.promise);

    useResearchStore.getState().setActiveRunId("run-a");
    const loadA = useResearchStore.getState().loadRun("run-a");
    useResearchStore.getState().setActiveRunId("run-b");
    const loadB = useResearchStore.getState().loadRun("run-b");

    runB.resolve({ run: { id: "run-b" } } as never);
    await loadB;
    runA.resolve({ run: { id: "run-a" } } as never);
    await loadA;

    expect(useResearchStore.getState().activeRunId).toBe("run-b");
    expect(useResearchStore.getState().activeRun?.run.id).toBe("run-b");
    expect(useResearchStore.getState().isLoading).toBe(false);
  });
});
