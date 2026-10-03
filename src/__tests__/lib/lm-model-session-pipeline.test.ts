import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchLoadedLmStudioModelInstancesDirect: vi.fn(),
  loadLmStudioModelDirect: vi.fn(),
  unloadLmStudioModelDirect: vi.fn(),
  prepareProviderModel: vi.fn(),
}));

vi.mock("@/lib/lm-studio", () => ({
  fetchLoadedLmStudioModelInstancesDirect: mocks.fetchLoadedLmStudioModelInstancesDirect,
  loadLmStudioModelDirect: mocks.loadLmStudioModelDirect,
  unloadLmStudioModelDirect: mocks.unloadLmStudioModelDirect,
}));

vi.mock("@/lib/providers", () => ({
  prepareProviderModel: mocks.prepareProviderModel,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      getModelSettings: () => ({ contextLength: 4096 }),
    }),
  },
}));

import { runPostChatModelPipeline } from "@/lib/lm-model-session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchLoadedLmStudioModelInstancesDirect.mockResolvedValue([]);
  mocks.loadLmStudioModelDirect.mockResolvedValue({ success: true, message: "ok" });
  mocks.unloadLmStudioModelDirect.mockResolvedValue({ success: true, message: "ok" });
  mocks.prepareProviderModel.mockResolvedValue(undefined);
});

describe("runPostChatModelPipeline provider routing", () => {
  it("prepares background models through the cloud provider and never touches LM Studio", async () => {
    const runTitle = vi.fn(async () => "Cloud title");

    const result = await runPostChatModelPipeline({
      chatModel: "gpt-x",
      titleModel: "gpt-mini",
      summaryModel: "gpt-mini",
      providerId: "openai-cloud",
      willTitle: true,
      willSummarize: false,
      signal: undefined,
      runTitle,
      runSummary: vi.fn(async () => undefined),
    });

    expect(runTitle).toHaveBeenCalledOnce();
    expect(mocks.prepareProviderModel).toHaveBeenCalledWith(
      "openai-cloud",
      "gpt-mini",
      { signal: undefined },
    );
    // The final "restore chat model" step also follows the provider.
    expect(mocks.prepareProviderModel).toHaveBeenCalledWith(
      "openai-cloud",
      "gpt-x",
      { signal: undefined },
    );
    expect(mocks.fetchLoadedLmStudioModelInstancesDirect).not.toHaveBeenCalled();
    expect(mocks.loadLmStudioModelDirect).not.toHaveBeenCalled();
    expect(result).toEqual({ prompt: undefined, output: "Title: Cloud title" });
  });

  it("falls back to LM Studio preparation when no provider identity is given", async () => {
    await runPostChatModelPipeline({
      chatModel: "local-model",
      titleModel: "local-model",
      summaryModel: "local-model",
      willTitle: true,
      willSummarize: false,
      runTitle: vi.fn(async () => "Local title"),
      runSummary: vi.fn(async () => undefined),
    });

    expect(mocks.prepareProviderModel).not.toHaveBeenCalled();
    expect(mocks.loadLmStudioModelDirect).toHaveBeenCalled();
  });
});