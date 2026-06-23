import { describe, expect, it } from "vitest";
import { dedupeAndRankSearchResults } from "../../modules/web-search/search-ranker";
import type { SearchResult } from "../../modules/web-search/types";

function makeResult(overrides: Partial<SearchResult> & Pick<SearchResult, "id" | "title" | "url" | "providerId">): SearchResult {
  return {
    id: overrides.id,
    title: overrides.title,
    url: overrides.url,
    providerId: overrides.providerId,
    snippet: overrides.snippet ?? "",
    engine: overrides.engine,
    publishedAt: overrides.publishedAt,
    fetchedAt: overrides.fetchedAt,
    score: overrides.score,
    rank: overrides.rank,
    sourceType: overrides.sourceType,
    displayUrl: overrides.displayUrl,
  };
}

describe("dedupeAndRankSearchResults", () => {
  it("dedupes normalized URLs and records multi-provider support", () => {
    const url = "https://example.com/article?utm_source=alpha#section";
    const ranked = dedupeAndRankSearchResults(
      [
        {
          result: makeResult({
            id: "1",
            title: "Example article",
            url,
            providerId: "provider-a",
            snippet: "official docs for the topic",
            rank: 1,
            sourceType: "docs",
          }),
          query: "official docs",
          lane: "primary",
          providerOrder: 0,
        },
        {
          result: makeResult({
            id: "2",
            title: "Example mirror",
            url: "https://example.com/article",
            providerId: "provider-b",
            snippet: "official docs for the topic",
            rank: 2,
            sourceType: "docs",
          }),
          query: "official docs",
          lane: "academic",
          providerOrder: 1,
        },
      ],
      new Map([[url, { url, status: "ok", title: "Example article", content: "text", error_reason: null }]]),
      10,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.rankReason).toContain("2 providers");
    expect(ranked[0]?.queryLane).toBe("primary");
  });

  it("filters low-value hosts when there are more results than the limit", () => {
    const ranked = dedupeAndRankSearchResults(
      [
        makeEntry("https://example.org/a", "Example A", "example-a", 0),
        makeEntry("https://nih.gov/b", "NIH B", "nih-b", 1),
        makeEntry("https://wikipedia.org/c", "Wiki C", "wiki-c", 2),
        makeEntry("https://docs.example.com/d", "Docs D", "docs-d", 3),
        makeEntry("https://github.com/e", "GitHub E", "github-e", 4),
        makeEntry("https://medium.com/f", "Medium F", "medium-f", 5),
      ],
      new Map(),
      5,
    );

    expect(ranked).toHaveLength(5);
    expect(ranked.some((result) => result.url.includes("medium.com"))).toBe(false);
  });
});

function makeEntry(url: string, title: string, id: string, providerOrder: number) {
  return {
    result: makeResult({
      id,
      title,
      url,
      providerId: `provider-${providerOrder}`,
      snippet: `${title} snippet`,
      rank: providerOrder + 1,
    }),
    query: title,
    providerOrder,
  };
}
