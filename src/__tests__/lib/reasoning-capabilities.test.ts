import { describe, expect, it } from "vitest";
import {
  effectiveReasoningLevel,
  fallbackModelReasoning,
  normalizeReasoningLevels,
  reasoningModelKey,
} from "@/lib/reasoning-capabilities";

describe("reasoning capability helpers", () => {
  it("keeps supported levels and normalizes them into Pi's canonical order", () => {
    expect(normalizeReasoningLevels(["high", "off", "medium"])).toEqual([
      "off",
      "medium",
      "high",
    ]);
    expect(normalizeReasoningLevels(["bogus", "low"])).toEqual(["low"]);
    expect(normalizeReasoningLevels(undefined)).toEqual([]);
  });

  it("clamps upward first, then downward, matching Pi", () => {
    expect(effectiveReasoningLevel("low", ["off", "medium", "high"])).toBe("medium");
    expect(effectiveReasoningLevel("max", ["off", "low"])).toBe("low");
    expect(effectiveReasoningLevel("off", ["low", "high"])).toBe("low");
    expect(effectiveReasoningLevel("high", ["off", "low", "medium", "high"])).toBe("high");
  });

  it("falls back to off when the model advertises no levels", () => {
    expect(effectiveReasoningLevel("medium", [])).toBe("off");
    expect(effectiveReasoningLevel("medium", null as unknown as [])).toBe("off");
  });

  it("uses the same model key for equivalent endpoint spellings", () => {
    expect(reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1/")).toBe(
      reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1"),
    );
    expect(reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1")).not.toBe(
      reasoningModelKey("openai", "gpt-5", "https://other.example.com/v1"),
    );
  });

  it("offers basic off/low/high levels when Pi cannot be read", () => {
    const fallback = fallbackModelReasoning();
    expect(fallback.known).toBe(false);
    expect(fallback.levels).toEqual(["off", "low", "high"]);
    expect(fallback.control).toBe("effort");
  });
});
