import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  engine: vi.fn(),
  arxiv: vi.fn(),
  wikipedia: vi.fn(),
  fetch: vi.fn(),
  settings: {
    webSearchSpeedPreset: "normal",
    webSearchFetchEnabled: true,
    webSearchFetchCount: 5,
    webSearchPerPageTimeoutSecs: 8,
    webSearchFetchMaxCharsPerSource: 8000,
    webSearchContextTokenLimit: 4000,
    webSearchMaxResults: 8,
    advancedSearchBundleEnabled: true,
    bundleArxivSearch: true,
    bundleWikipediaSearch: true,
    bundleWaybackFallback: true,
  },
}));

vi.mock("@/stores/settings-store", () => ({ useSettingsStore: { getState: () => mocks.settings } }));
vi.mock("@/stores/connectivity-store", () => ({ useConnectivityStore: { getState: () => ({ effectiveConnectivity: "online" }) } }));
vi.mock("@/modules/projects/project-store", () => ({ useProjectStore: { getState: () => ({ projects: [] }) } }));
vi.mock("@/lib/context", () => ({ estimateTokens: (text: string) => Math.ceil(text.length / 4) }));
vi.mock("@/modules/web-search/providers/DonSeTchProvider", () => ({
  DonSeTchProvider: class { search = mocks.engine; isDegraded = false; },
}));
vi.mock("@/modules/web-search/providers/ArXivProvider", () => ({
  ArXivProvider: class { search = mocks.arxiv; },
}));
vi.mock("@/modules/web-search/providers/WikipediaProvider", () => ({
  WikipediaProvider: class { search = mocks.wikipedia; },
}));
vi.mock("@/modules/web-search/tauri-commands", () => ({ invokeFetchAndExtractPages: mocks.fetch }));

import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";

describe("chat search reading budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.engine.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({
      id: String(index), title: `Source ${index}`, url: `https://example.com/${index}`,
      snippet: "Useful evidence", providerId: "donsetch",
    })));
    mocks.arxiv.mockResolvedValue([]);
    mocks.wikipedia.mockResolvedValue([]);
    mocks.fetch.mockResolvedValue([]);
  });

  it("keeps eight results while reading only three pages with a shorter timeout and no archive recovery", async () => {
    const bundle = await runSearch("latest browser releases", { workflow: "chat", request: { query: "latest browser releases", intent: "news" } });
    expect(bundle.sources).toHaveLength(8);
    expect(mocks.fetch).toHaveBeenCalledWith(
      ["https://example.com/0", "https://example.com/1", "https://example.com/2"],
      3, 4, 8000, { advancedSearchBundleEnabled: true, waybackFallbackEnabled: false },
    );
    expect(mocks.arxiv).not.toHaveBeenCalled();
    expect(mocks.wikipedia).not.toHaveBeenCalled();
  });

  it("uses ArXiv for academic chat searches", async () => {
    await runSearch("transformer papers", { workflow: "chat", request: { query: "transformer papers", intent: "academic" } });
    expect(mocks.arxiv).toHaveBeenCalledOnce();
    expect(mocks.wikipedia).not.toHaveBeenCalled();
  });

  it("uses Wikipedia for background explanations", async () => {
    await runSearch("explain plate tectonics", { workflow: "chat" });
    expect(mocks.wikipedia).toHaveBeenCalledOnce();
    expect(mocks.arxiv).not.toHaveBeenCalled();
  });

  it("preserves research provider and page reading settings", async () => {
    await runSearch("plate tectonics");
    expect(mocks.arxiv).toHaveBeenCalledOnce();
    expect(mocks.wikipedia).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.any(Array), 5, 8, 8000,
      { advancedSearchBundleEnabled: true, waybackFallbackEnabled: true },
    );
    expect(mocks.fetch.mock.calls[0][0]).toHaveLength(5);
  });

  it("honors smaller configured budgets", async () => {
    const previous = { ...mocks.settings };
    try {
      mocks.settings.webSearchFetchCount = 2;
      mocks.settings.webSearchPerPageTimeoutSecs = 2;
      await runSearch("browser releases", { workflow: "chat" });
      expect(mocks.fetch.mock.calls[0][0]).toHaveLength(2);
      expect(mocks.fetch.mock.calls[0][2]).toBe(2);
    } finally {
      Object.assign(mocks.settings, previous);
    }
  });
});
