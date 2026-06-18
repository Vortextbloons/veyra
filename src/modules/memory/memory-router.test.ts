import { describe, expect, it } from "vitest";
import { buildRetrievalQuery, shouldRetrieveMemory } from "./memory-router";

describe("memory-router", () => {
  it("skips retrieval when memory is turned off", () => {
    expect(shouldRetrieveMemory({ query: "remember this", mode: "off" })).toEqual({
      retrieve: false,
      reason: "Memory mode is off",
    });
  });

  it("skips retrieval for greeting-only turns", () => {
    expect(shouldRetrieveMemory({ query: "hello", mode: "safe_auto_save" })).toEqual({
      retrieve: false,
      reason: "Greeting only — skipped retrieval",
    });
  });

  it("retrieves for explicit memory cues even in manual mode", () => {
    expect(shouldRetrieveMemory({ query: "remember that I use Rust", mode: "manual_only" })).toEqual({
      retrieve: true,
      reason: "Memory-related phrasing",
    });
  });

  it("skips simple calculations", () => {
    expect(shouldRetrieveMemory({ query: "12345 + 67890", mode: "safe_auto_save" })).toEqual({
      retrieve: false,
      reason: "Simple calculation — skipped retrieval",
    });
  });

  it("builds a compact retrieval query from recent turns", () => {
    const query = buildRetrievalQuery("latest ask", [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "latest ask" },
    ]);

    expect(query).toBe("first\nsecond\nlatest ask");
  });
});
