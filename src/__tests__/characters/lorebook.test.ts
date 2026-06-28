import { describe, expect, it } from "vitest";
import type { CharacterLorebookEntry } from "../../modules/characters/character-types";
import { evaluateLorebook } from "../../modules/characters/lorebook";

function makeEntry(overrides: Partial<CharacterLorebookEntry> = {}): CharacterLorebookEntry {
  return {
    id: "entry-1",
    characterId: "char-1",
    keys: ["magic"],
    content: "Magic lore content",
    constant: false,
    selective: false,
    insertionOrder: 0,
    priority: 3,
    enabled: true,
    matchType: "any",
    caseSensitive: false,
    scope: "character",
    position: "before",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("lorebook", () => {
  describe("evaluateLorebook", () => {
    it("returns empty for undefined entries", () => {
      const result = evaluateLorebook(undefined, [{ role: "user", content: "hello" }], { scanDepth: 5, maxEntries: 10 });
      expect(result.matches).toEqual([]);
      expect(result.budgetExceeded).toBe(false);
    });

    it("returns empty for empty entries", () => {
      const result = evaluateLorebook([], [{ role: "user", content: "hello" }], { scanDepth: 5, maxEntries: 10 });
      expect(result.matches).toEqual([]);
    });

    it("returns empty for empty messages", () => {
      const result = evaluateLorebook([makeEntry()], [], { scanDepth: 5, maxEntries: 10 });
      expect(result.matches).toEqual([]);
    });

    it("matches entry with keyword in user message", () => {
      const entry = makeEntry({ keys: ["magic"] });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "Tell me about magic systems" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].id).toBe("entry-1");
    });

    it("matches entry with keyword in assistant message", () => {
      const entry = makeEntry({ keys: ["dragon"] });
      const result = evaluateLorebook(
        [entry],
        [{ role: "assistant", content: "The dragon sleeps in the cave" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
    });

    it("does not match disabled entries", () => {
      const entry = makeEntry({ keys: ["magic"], enabled: false });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(0);
    });

    it("always matches constant entries", () => {
      const entry = makeEntry({ constant: true, keys: [] });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "anything at all" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
    });

    it("matchType=all requires all keys present", () => {
      const entry = makeEntry({ keys: ["fire", "magic"], matchType: "all" });
      const result1 = evaluateLorebook(
        [entry],
        [{ role: "user", content: "fire magic is powerful" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result1.matches.length).toBe(1);

      const result2 = evaluateLorebook(
        [entry],
        [{ role: "user", content: "only fire here" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result2.matches.length).toBe(0);
    });

    it("matchType=any matches when any key present", () => {
      const entry = makeEntry({ keys: ["fire", "ice"], matchType: "any" });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "ice cold" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
    });

    it("matchType=regex matches pattern", () => {
      const entry = makeEntry({ keys: ["\\bfire\\w*\\b"], matchType: "regex" });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "The firefighter arrived" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
    });

    it("matchType=regex handles invalid regex gracefully", () => {
      const entry = makeEntry({ keys: ["[invalid"], matchType: "regex" });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "test" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(0);
    });

    it("case-insensitive matching by default", () => {
      const entry = makeEntry({ keys: ["MAGIC"], caseSensitive: false });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "tell me about magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(1);
    });

    it("case-sensitive matching when enabled", () => {
      const entry = makeEntry({ keys: ["MAGIC"], caseSensitive: true });
      const result = evaluateLorebook(
        [entry],
        [{ role: "user", content: "tell me about magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(0);
    });

    it("respects probability with deterministic random", () => {
      const entry = makeEntry({ keys: ["magic"], probability: 50 });
      const resultMatch = evaluateLorebook(
        [entry],
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10, random: () => 0.3 },
      );
      expect(resultMatch.matches.length).toBe(1);

      const resultMiss = evaluateLorebook(
        [entry],
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10, random: () => 0.8 },
      );
      expect(resultMiss.matches.length).toBe(0);
    });

    it("respects scanDepth limit", () => {
      const entry = makeEntry({ keys: ["magic"] });
      const messages = [
        { role: "user", content: "magic" },
        { role: "assistant", content: "response" },
        { role: "user", content: "something else" },
      ];
      const result = evaluateLorebook([entry], messages, { scanDepth: 1, maxEntries: 10 });
      expect(result.matches.length).toBe(0);
    });

    it("sorts by priority descending", () => {
      const entries = [
        makeEntry({ id: "low", keys: ["magic"], priority: 1, insertionOrder: 0 }),
        makeEntry({ id: "high", keys: ["magic"], priority: 5, insertionOrder: 1 }),
        makeEntry({ id: "mid", keys: ["magic"], priority: 3, insertionOrder: 2 }),
      ];
      const result = evaluateLorebook(
        entries,
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.map((m) => m.id)).toEqual(["high", "mid", "low"]);
    });

    it("sorts by insertionOrder when priority equal", () => {
      const entries = [
        makeEntry({ id: "second", keys: ["magic"], priority: 3, insertionOrder: 1 }),
        makeEntry({ id: "first", keys: ["magic"], priority: 3, insertionOrder: 0 }),
      ];
      const result = evaluateLorebook(
        entries,
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.map((m) => m.id)).toEqual(["first", "second"]);
    });

    it("caps at maxEntries", () => {
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ id: `e${i}`, keys: ["magic"], priority: 3 as const, insertionOrder: i }),
      );
      const result = evaluateLorebook(
        entries,
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 3 },
      );
      expect(result.matches.length).toBe(3);
      expect(result.budgetExceeded).toBe(true);
    });

    it("does not set budgetExceeded when under cap", () => {
      const entries = [makeEntry({ keys: ["magic"] })];
      const result = evaluateLorebook(
        entries,
        [{ role: "user", content: "magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.budgetExceeded).toBe(false);
    });

    it("ignores system messages", () => {
      const entry = makeEntry({ keys: ["magic"] });
      const result = evaluateLorebook(
        [entry],
        [{ role: "system", content: "You are a helpful assistant with magic" }],
        { scanDepth: 5, maxEntries: 10 },
      );
      expect(result.matches.length).toBe(0);
    });
  });
});
