import { describe, expect, it } from "vitest";
import { rankSearchPassages } from "../../modules/web-search/passage-ranker";

describe("rankSearchPassages", () => {
  it("selects the query-relevant heading-aware passage with offsets", () => {
    const content = [
      "# Introduction",
      "",
      "This long introduction discusses unrelated background material and general history.",
      "",
      "## Retry behavior",
      "",
      "The SDK retries rate limited requests with exponential backoff and respects Retry-After headers.",
    ].join("\n");
    const passages = rankSearchPassages("source-1", content, "SDK retry rate limit", 1);
    expect(passages[0]?.heading).toBe("Retry behavior");
    expect(passages[0]?.text).toContain("Retry-After");
    expect(passages[0]?.startOffset).toBeGreaterThan(0);
  });
});
