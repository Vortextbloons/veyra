import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResearchEvidence, ResearchSource, ResearchStep } from "@/modules/research/research-types";

const callResearchAiMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/research/research-ai", () => ({
  callResearchAi: callResearchAiMock,
}));

import { extractPhase } from "@/modules/research/research-extract-phase";
import type { ResearchRuntimeContext } from "@/modules/research/research-runtime-context";

function createSource(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "source-1",
    url: "https://example.com/a",
    title: "Source A",
    snippet: "",
    fullText: "A".repeat(200),
    sourceType: "web",
    status: "read",
    ...overrides,
  } as unknown as ResearchSource;
}

function createEvidence(sourceId: string): ResearchEvidence {
  return {
    id: `ev-${sourceId}`,
    runId: "run-1",
    sourceId,
    type: "fact",
    content: "persisted evidence",
    context: "",
    confidence: 0.9,
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
  };
}

type CtxOptions = {
  sources: ResearchSource[];
  evidenceList: ResearchEvidence[];
  resumeFromPhase?: string;
};

function createContext({ sources, evidenceList, resumeFromPhase }: CtxOptions) {
  const runAiStep = vi.fn(
    async (
      _type: string,
      _title: string,
      _detail: string | undefined,
      aiCall: () => Promise<{ value: string }>,
    ) => aiCall(),
  );
  const ctx = {
    run: { id: "run-1", question: "What is the answer?" },
    config: { perSourceRead: true, minSourceQuality: 0, extractBatchSize: 4 },
    signal: { aborted: false },
    store: {
      createEvidence: vi.fn(async (input: Record<string, unknown>) => ({
        id: `ev-${Math.random().toString(36).slice(2, 8)}`,
        runId: "run-1",
        type: "fact",
        context: "",
        confidence: 0.9,
        tags: [],
        createdAt: "2026-01-01T00:00:00Z",
        ...input,
      })),
      createClaim: vi.fn(),
    },
    onEvent: vi.fn(),
    sources,
    evidenceList,
    claims: [],
    contradictions: [],
    getSourceChunks: (source: ResearchSource) => [source.fullText || source.snippet || ""],
    checkAbort: vi.fn(),
    updateRunStatus: vi.fn(async () => undefined),
    createStep: vi.fn(async (): Promise<ResearchStep> => ({
      id: "step-1",
      runId: "run-1",
      type: "extract",
      title: "Deep evidence extraction",
      status: "running",
      createdAt: "2026-01-01T00:00:00Z",
    })),
    completeStep: vi.fn(async () => undefined),
    failStep: vi.fn(async () => undefined),
    runAiStep,
    researchAiOptions: vi.fn(() => ({})),
    _resumeFromPhase: resumeFromPhase,
  } as unknown as ResearchRuntimeContext & { runAiStep: typeof runAiStep; createStep: ReturnType<typeof vi.fn>; completeStep: ReturnType<typeof vi.fn> };
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  callResearchAiMock.mockResolvedValue({
    value: '{"evidence":[{"type":"fact","content":"A fresh piece of evidence content","confidence":0.9,"significance":"medium"}]}',
  });
});

describe("extractPhase resume behavior", () => {
  it("extracts only sources without persisted evidence when resuming from extract", async () => {
    const sourceA = createSource({ id: "source-1", title: "Source A" });
    const sourceB = createSource({ id: "source-2", title: "Source B" });
    const evidenceList = [createEvidence("source-1")];
    const ctx = createContext({ sources: [sourceA, sourceB], evidenceList, resumeFromPhase: "extract" });

    await extractPhase(ctx, "extract");

    expect(ctx.createStep).toHaveBeenCalled();
    // Only the pending source should have been extracted.
    const prompts = ctx.runAiStep.mock.calls.map((call) => call[2] ?? "");
    const batchPrompts = callResearchAiMock.mock.calls.map(
      (call) =>
        (call[0] as unknown as Array<{ role: string; content: string }>).find(
          (m) => m.role === "user",
        )?.content ?? "",
    );
    const allPromptText = prompts.join("\n") + batchPrompts.join("\n");
    expect(allPromptText).toContain("Source B");
    expect(allPromptText).not.toContain("Source A");
  });

  it("skips extraction entirely when resuming from extract with every source already extracted", async () => {
    const sourceA = createSource({ id: "source-1" });
    const sourceB = createSource({ id: "source-2" });
    const ctx = createContext({
      sources: [sourceA, sourceB],
      evidenceList: [createEvidence("source-1"), createEvidence("source-2")],
      resumeFromPhase: "extract",
    });

    await extractPhase(ctx, "extract");

    expect(ctx.createStep).not.toHaveBeenCalled();
    expect(callResearchAiMock).not.toHaveBeenCalled();
  });

  it("runs full extraction on a fresh run", async () => {
    const sourceA = createSource({ id: "source-1", title: "Source A" });
    const sourceB = createSource({ id: "source-2", title: "Source B" });
    const evidenceList: ResearchEvidence[] = [];
    const ctx = createContext({ sources: [sourceA, sourceB], evidenceList });

    await extractPhase(ctx, undefined);

    expect(ctx.createStep).toHaveBeenCalled();
    expect(callResearchAiMock).toHaveBeenCalled();
    expect(evidenceList.length).toBeGreaterThan(0);
  });

  it("does not re-run extraction when resuming from a phase after extract", async () => {
    const sourceA = createSource({ id: "source-1" });
    const sourceB = createSource({ id: "source-2" });
    const ctx = createContext({
      sources: [sourceA, sourceB],
      evidenceList: [createEvidence("source-1")],
      resumeFromPhase: "verify",
    });

    await extractPhase(ctx, "verify");

    expect(ctx.createStep).not.toHaveBeenCalled();
    expect(callResearchAiMock).not.toHaveBeenCalled();
  });
});