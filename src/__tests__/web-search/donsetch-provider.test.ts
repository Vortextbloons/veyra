import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeWebSearch: vi.fn(),
}));

vi.mock("@/modules/web-search/tauri-commands", () => ({
  invokeWebSearch: mocks.invokeWebSearch,
}));

import { DonSeTchProvider } from "@/modules/web-search/providers/DonSeTchProvider";

function provider() {
  return new DonSeTchProvider({ id: "donsetch-default", name: "DonSeTch", maxResults: 5 });
}

describe("DonSeTchProvider", () => {
  beforeEach(() => {
    mocks.invokeWebSearch.mockReset();
  });

  it("maps engine results and strips tracking parameters", async () => {
    mocks.invokeWebSearch.mockResolvedValue({
      query: "rust async",
      result_count: 1,
      engine: "donsetch",
      degraded: false,
      results: [
        {
          id: "abc",
          title: "Rust Async",
          url: "https://example.com/rust?utm_source=x&id=1",
          snippet: "A useful result",
          engine: "donsetch",
          score: 1.2,
          published_at: "2026-10-20",
        },
      ],
    });

    const results = await provider().search({ query: "rust async", intent: "code" });

    expect(mocks.invokeWebSearch).toHaveBeenCalledWith("rust async", 5, "code");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "abc",
      title: "Rust Async",
      url: "https://example.com/rust?id=1",
      snippet: "A useful result",
      providerId: "donsetch-default",
      publishedAt: "2026-10-20",
      rank: 1,
    });
  });

  it("drops duplicates, spam domains, and empty results", async () => {
    mocks.invokeWebSearch.mockResolvedValue({
      query: "q",
      result_count: 3,
      engine: "donsetch",
      degraded: true,
      results: [
        { id: "1", title: "One", url: "https://example.com/page", snippet: "ok", engine: "donsetch", score: 1, published_at: null },
        { id: "2", title: "Duplicate", url: "https://example.com/page", snippet: "ok", engine: "donsetch", score: 0.9, published_at: null },
        { id: "3", title: "Spam", url: "https://spam.xyz/page", snippet: "ok", engine: "donsetch", score: 0.8, published_at: null },
        { id: "4", title: "", url: "https://example.com/empty", snippet: "", engine: "donsetch", score: 0, published_at: null },
      ],
    });

    const instance = provider();
    const results = await instance.search({ query: "q" });

    expect(results).toHaveLength(1);
    expect(instance.isDegraded).toBe(true);
  });
});
