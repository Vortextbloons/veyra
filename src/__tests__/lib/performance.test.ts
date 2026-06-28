import { describe, expect, it } from "vitest";
import { buildMessagePerformance, formatDuration, formatTokensPerSecond } from "../../lib/performance";

describe("performance", () => {
  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      expect(formatDuration(0.5)).toBe("500ms");
    });

    it("formats seconds with 2 decimals under 10s", () => {
      expect(formatDuration(3.456)).toBe("3.46s");
    });

    it("formats seconds with 1 decimal over 10s", () => {
      expect(formatDuration(12.345)).toBe("12.3s");
    });
  });

  describe("formatTokensPerSecond", () => {
    it("formats high tps as integer", () => {
      expect(formatTokensPerSecond(150)).toBe("150 tok/s");
    });

    it("formats medium tps with 1 decimal", () => {
      expect(formatTokensPerSecond(45.6)).toBe("45.6 tok/s");
    });

    it("formats low tps with 2 decimals", () => {
      expect(formatTokensPerSecond(3.45)).toBe("3.45 tok/s");
    });
  });

  describe("buildMessagePerformance", () => {
    it("computes basic performance from timing", () => {
      const result = buildMessagePerformance({
        content: "hello world",
        startedAt: 1000,
        completedAt: 2000,
      });
      expect(result.totalTime).toBe(1);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.tokensPerSecond).toBeGreaterThan(0);
    });

    it("uses server stats when available", () => {
      const result = buildMessagePerformance({
        content: "test",
        startedAt: 0,
        completedAt: 1000,
        stats: {
          input_tokens: 100,
          total_output_tokens: 50,
          tokens_per_second: 25,
          time_to_first_token_seconds: 0.1,
        },
      });
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.tokensPerSecond).toBe(25);
      expect(result.timeToFirstToken).toBe(0.1);
      expect(result.totalTokens).toBe(150);
    });

    it("computes timeToFirstToken from firstTokenAt", () => {
      const result = buildMessagePerformance({
        content: "test",
        startedAt: 1000,
        completedAt: 2000,
        firstTokenAt: 1100,
      });
      expect(result.timeToFirstToken).toBeCloseTo(0.1, 2);
    });

    it("handles zero totalTime", () => {
      const result = buildMessagePerformance({
        content: "test",
        startedAt: 1000,
        completedAt: 1000,
      });
      expect(result.totalTime).toBe(0);
    });
  });
});
