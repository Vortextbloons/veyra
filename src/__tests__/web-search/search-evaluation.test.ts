import { describe, expect, it } from "vitest";
import { evaluateSearchRanking } from "../../modules/web-search/search-evaluation";
import type { SearchResult } from "../../modules/web-search/types";

function result(url: string): SearchResult {
  return { id: url, title: url, url, providerId: "fixture" };
}

describe("evaluateSearchRanking", () => {
  it("computes repeatable retrieval quality metrics from local labels", () => {
    const metrics = evaluateSearchRanking(
      [result("https://noise.test"), result("https://primary.test/a"), result("https://useful.test/b")],
      {
        relevantUrls: ["https://primary.test/a", "https://useful.test/b"],
        primaryUrls: ["https://primary.test/a"],
      },
    );
    expect(metrics.recallAt20).toBe(1);
    expect(metrics.mrrAt10).toBe(0.5);
    expect(metrics.ndcgAt10).toBeGreaterThan(0.6);
    expect(metrics.primarySourceRate).toBeCloseTo(1 / 3);
    expect(metrics.duplicateRate).toBe(0);
  });
});
