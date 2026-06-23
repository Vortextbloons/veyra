import { describe, expect, it } from "vitest";
import {
  buildRetrievalQuery,
  isManualOnlyOrigin,
  noiseFloorForMode,
  shouldRetrieveMemory,
} from "../../modules/memory/memory-router";

describe("memory-router", () => {
  describe("shouldRetrieveMemory", () => {
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

    it("skips retrieval for various greetings", () => {
      for (const greeting of ["hi", "hey", "thanks", "ok", "bye", "good morning", "thank you"]) {
        const result = shouldRetrieveMemory({ query: greeting, mode: "safe_auto_save" });
        expect(result.retrieve).toBe(false);
      }
    });

    it("retrieves for explicit memory cues even in manual mode", () => {
      expect(shouldRetrieveMemory({ query: "remember that I use Rust", mode: "manual_only" })).toEqual({
        retrieve: true,
        reason: "Memory-related phrasing",
      });
    });

    it("retrieves for various memory cues", () => {
      for (const cue of [
        "what do you know about me",
        "my preference is dark mode",
        "recall our last conversation",
        "you said earlier that",
        "I saved a note about",
      ]) {
        const result = shouldRetrieveMemory({ query: cue, mode: "safe_auto_save" });
        expect(result.retrieve).toBe(true);
      }
    });

    it("skips simple calculations", () => {
      expect(shouldRetrieveMemory({ query: "12345 + 67890", mode: "safe_auto_save" })).toEqual({
        retrieve: false,
        reason: "Simple calculation — skipped retrieval",
      });
    });

    it("skips various trivial math expressions", () => {
      for (const expr of ["100 - 50", "3 * 7", "10 / 2", "2 ^ 8", "100 % 3"]) {
        const result = shouldRetrieveMemory({ query: expr, mode: "safe_auto_save" });
        expect(result.retrieve).toBe(false);
      }
    });

    it("skips short messages without memory cues", () => {
      expect(shouldRetrieveMemory({ query: "hello world", mode: "safe_auto_save" })).toEqual({
        retrieve: false,
        reason: "Short message — skipped retrieval",
      });
    });

    it("retrieves short messages that contain memory cues", () => {
      expect(shouldRetrieveMemory({ query: "remember this", mode: "safe_auto_save" })).toEqual({
        retrieve: true,
        reason: "Memory-related phrasing",
      });
    });

    it("retrieves in manual_only mode for non-cue queries", () => {
      expect(shouldRetrieveMemory({ query: "tell me about the tools I use daily", mode: "manual_only" })).toEqual({
        retrieve: true,
        reason: "Manual mode — pinned and explicit memories only",
      });
    });

    it("retrieves by default for normal queries", () => {
      expect(shouldRetrieveMemory({ query: "how should I structure my codebase", mode: "safe_auto_save" })).toEqual({
        retrieve: true,
        reason: "Default retrieval",
      });
    });

    it("retrieves in review_all mode", () => {
      expect(shouldRetrieveMemory({ query: "what coding tools do I use daily", mode: "review_all" })).toEqual({
        retrieve: true,
        reason: "Default retrieval",
      });
    });

    it("retrieves in aggressive_project_memory mode", () => {
      expect(shouldRetrieveMemory({ query: "what tools do I use for building apps", mode: "aggressive_project_memory" })).toEqual({
        retrieve: true,
        reason: "Default retrieval",
      });
    });

    it("skips empty query", () => {
      expect(shouldRetrieveMemory({ query: "", mode: "safe_auto_save" })).toEqual({
        retrieve: false,
        reason: "Empty message",
      });
    });

    it("skips whitespace-only query", () => {
      expect(shouldRetrieveMemory({ query: "   ", mode: "safe_auto_save" })).toEqual({
        retrieve: false,
        reason: "Empty message",
      });
    });

    it("detects memory cues in context snippet", () => {
      expect(
        shouldRetrieveMemory({
          query: "tell me more",
          mode: "safe_auto_save",
          contextSnippet: "remember that you prefer tabs",
        }),
      ).toEqual({
        retrieve: true,
        reason: "Memory-related phrasing",
      });
    });
  });

  describe("buildRetrievalQuery", () => {
    it("builds a compact retrieval query from recent turns", () => {
      const query = buildRetrievalQuery("latest ask", [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "latest ask" },
      ]);

      expect(query).toBe("first\nsecond\nlatest ask");
    });

    it("does not duplicate the latest message if already last", () => {
      const query = buildRetrievalQuery("hello", [
        { role: "user", content: "hello" },
      ]);
      expect(query).toBe("hello");
    });

    it("appends latest message if not already last", () => {
      const query = buildRetrievalQuery("new question", [
        { role: "user", content: "old question" },
        { role: "assistant", content: "old answer" },
      ]);
      expect(query).toBe("old question\nold answer\nnew question");
    });

    it("handles empty recent turns", () => {
      const query = buildRetrievalQuery("only message", []);
      expect(query).toBe("only message");
    });

    it("truncates each turn to 400 chars", () => {
      const longTurn = "x".repeat(500);
      const query = buildRetrievalQuery("ask", [{ role: "user", content: longTurn }]);
      expect(query.startsWith("x".repeat(400))).toBe(true);
      expect(query.length).toBeLessThan(500);
    });

    it("truncates total query to 2000 chars", () => {
      const turns = Array.from({ length: 20 }, (_, i) => ({
        role: "user" as const,
        content: `turn ${i}: ${"y".repeat(200)}`,
      }));
      const query = buildRetrievalQuery("final", turns);
      expect(query.length).toBeLessThanOrEqual(2000);
    });

    it("skips empty turns", () => {
      const query = buildRetrievalQuery("ask", [
        { role: "user", content: "" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "ask" },
      ]);
      expect(query).toBe("answer\nask");
    });

    it("only includes last 6 turns", () => {
      const turns = Array.from({ length: 10 }, (_, i) => ({
        role: "user" as const,
        content: `turn ${i}`,
      }));
      const query = buildRetrievalQuery("final", turns);
      expect(query).toContain("turn 5");
      expect(query).toContain("turn 9");
      expect(query).toContain("final");
      expect(query).not.toContain("turn 0");
    });
  });

  describe("noiseFloorForMode", () => {
    it("returns 0.03 for aggressive_project_memory", () => {
      expect(noiseFloorForMode("aggressive_project_memory")).toBe(0.03);
    });

    it("returns 0.05 for safe_auto_save", () => {
      expect(noiseFloorForMode("safe_auto_save")).toBe(0.05);
    });

    it("returns 0.05 for review_all", () => {
      expect(noiseFloorForMode("review_all")).toBe(0.05);
    });

    it("returns 0.08 for manual_only", () => {
      expect(noiseFloorForMode("manual_only")).toBe(0.08);
    });

    it("returns 0.05 for off (default)", () => {
      expect(noiseFloorForMode("off")).toBe(0.05);
    });
  });

  describe("isManualOnlyOrigin", () => {
    it("returns true for pinned nodes", () => {
      expect(isManualOnlyOrigin({ origin: "auto_extracted", isPinned: true, priority: "low" })).toBe(true);
    });

    it("returns true for permanent priority", () => {
      expect(isManualOnlyOrigin({ origin: "auto_extracted", isPinned: false, priority: "permanent" })).toBe(true);
    });

    it("returns true for explicit_user_save origin", () => {
      expect(isManualOnlyOrigin({ origin: "explicit_user_save", isPinned: false, priority: "medium" })).toBe(true);
    });

    it("returns true for manual_user_edit origin", () => {
      expect(isManualOnlyOrigin({ origin: "manual_user_edit", isPinned: false, priority: "medium" })).toBe(true);
    });

    it("returns true for profile_setup origin", () => {
      expect(isManualOnlyOrigin({ origin: "profile_setup", isPinned: false, priority: "medium" })).toBe(true);
    });

    it("returns false for auto_extracted with no other flags", () => {
      expect(isManualOnlyOrigin({ origin: "auto_extracted", isPinned: false, priority: "medium" })).toBe(false);
    });

    it("returns false for imported origin", () => {
      expect(isManualOnlyOrigin({ origin: "imported", isPinned: false, priority: "medium" })).toBe(false);
    });
  });
});
