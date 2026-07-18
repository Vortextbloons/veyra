import { describe, expect, it } from "vitest";
import { resolveSearchRouting } from "../../modules/web-search/search-routing";
import type { SearxCapabilities } from "../../modules/web-search/types";

const capabilities: SearxCapabilities = {
  engines: [
    { name: "GitHub", shortcut: "gh", categories: ["it"], enabled: true },
    { name: "StackOverflow", shortcut: "so", categories: ["it"], enabled: false },
    { name: "arXiv", shortcut: "arx", categories: ["science"], enabled: true },
  ],
  categories: ["general", "news", "science", "it"],
  locales: ["en-US"],
  safeSearch: 0,
  fetchedAt: Date.now(),
};

describe("resolveSearchRouting", () => {
  it("routes code searches only to runtime-supported capabilities", () => {
    expect(resolveSearchRouting({ query: "typescript sdk error", intent: "code" }, capabilities)).toEqual({
      intent: "code",
      categories: "it",
      engines: "GitHub",
      timeRange: undefined,
    });
  });

  it("adds a freshness window for inferred news intent", () => {
    const route = resolveSearchRouting({ query: "latest space launch news" }, capabilities);
    expect(route.intent).toBe("news");
    expect(route.categories).toBe("news");
    expect(route.timeRange).toBe("week");
  });
});
