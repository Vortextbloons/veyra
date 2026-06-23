import { describe, expect, it } from "vitest";
import {
  getErrorMessage,
  pickResearchAiOutputText,
  safeJsonParse,
  normalizeClaimStatus,
} from "../../modules/research/research-json-utils";

describe("research-json-utils", () => {
  it("parses fenced JSON embedded in prose", () => {
    const parsed = safeJsonParse<{ name: string }>('Before text\n```json\n{"name":"Veyra"}\n```\nAfter text');

    expect(parsed).toEqual({ name: "Veyra" });
  });

  it("prefers reasoning when content is plain text and reasoning is JSON-like", () => {
    expect(
      pickResearchAiOutputText("plain answer", "{\"steps\":[{\"title\":\"Plan\"}]}")
    ).toBe('{"steps":[{"title":"Plan"}]}');
  });

  it("normalizes unknown claim statuses to unverified", () => {
    expect(normalizeClaimStatus("unexpected")).toBe("unverified");
    expect(normalizeClaimStatus("verified")).toBe("verified");
  });

  it("formats non-error values into a readable message", () => {
    expect(getErrorMessage({ message: "boom" })).toBe("boom");
  });
});
