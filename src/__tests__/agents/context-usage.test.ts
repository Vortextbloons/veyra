import { describe, expect, it } from "vitest";
import { contextTokensFromUsage } from "@/modules/agents/context-usage";

describe("context token usage", () => {
  it("keeps cached context in the count as the conversation grows", () => {
    const first = contextTokensFromUsage({ input: 1000, output: 100 });
    const next = contextTokensFromUsage({ input: 200, cacheRead: 1000, cacheWrite: 50, output: 100 });
    expect(first).toBe(1100);
    expect(next).toBe(1350);
  });
  it("allows a real context reduction and ignores invalid counts", () => {
    expect(contextTokensFromUsage({ input: 200, output: 50 })).toBe(250);
    expect(contextTokensFromUsage({ input: NaN, cacheRead: -1, output: Infinity })).toBe(0);
  });
});
