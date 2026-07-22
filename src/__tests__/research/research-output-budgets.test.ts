import { describe, expect, it } from "vitest";
import {
  extractionOutputTokens,
  reportSectionOutputTokens,
  validationBatchOutputTokens,
} from "../../modules/research/research-output-budgets";

describe("research output budgets", () => {
  it("scales and caps batched source validation", () => {
    expect(validationBatchOutputTokens(1)).toBe(700);
    expect(validationBatchOutputTokens(3)).toBe(2_100);
    expect(validationBatchOutputTokens(20)).toBe(3_500);
  });

  it("uses smaller capped budgets for follow-up extraction", () => {
    expect(extractionOutputTokens(1, false)).toBe(2_400);
    expect(extractionOutputTokens(3, false)).toBe(4_800);
    expect(extractionOutputTokens(10, false)).toBe(6_000);
    expect(extractionOutputTokens(1, true)).toBe(2_000);
    expect(extractionOutputTokens(10, true)).toBe(4_000);
  });

  it("reserves reasoning headroom for report sections", () => {
    expect(reportSectionOutputTokens(300)).toBe(2_000);
    expect(reportSectionOutputTokens(1_000)).toBe(3_000);
    expect(reportSectionOutputTokens(1_500)).toBe(4_500);
    expect(reportSectionOutputTokens(3_000)).toBe(5_000);
  });
});
