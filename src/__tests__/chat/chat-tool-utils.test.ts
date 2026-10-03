import { describe, expect, it } from "vitest";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
} from "../../modules/chat/chat-tool-utils";

describe("chat-tool-utils", () => {
  describe("stringArg", () => {
    it("returns trimmed string value", () => {
      expect(stringArg({ key: "  hello  " }, "key")).toBe("hello");
    });

    it("returns empty string for non-string value", () => {
      expect(stringArg({ key: 123 }, "key")).toBe("");
    });

    it("returns empty string for missing key", () => {
      expect(stringArg({}, "key")).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(stringArg({ key: undefined }, "key")).toBe("");
    });

    it("returns empty string for null", () => {
      expect(stringArg({ key: null }, "key")).toBe("");
    });
  });

  describe("stripPythonCodeFence", () => {
    it("strips triple backtick python fence", () => {
      const code = "```python\nprint('hello')\n```";
      expect(stripPythonCodeFence(code)).toBe("print('hello')");
    });

    it("strips triple backtick py fence", () => {
      const code = "```py\nx = 1\n```";
      expect(stripPythonCodeFence(code)).toBe("x = 1");
    });

    it("strips inline fence", () => {
      const code = "```print('hello')```";
      expect(stripPythonCodeFence(code)).toBe("print('hello')");
    });

    it("returns trimmed code when no fence", () => {
      expect(stripPythonCodeFence("  print('hello')  ")).toBe("print('hello')");
    });

    it("handles fence with no language tag", () => {
      const code = "```\nprint('hello')\n```";
      expect(stripPythonCodeFence(code)).toBe("print('hello')");
    });
  });

  describe("summarizeCodeSnippet", () => {
    it("returns full code when short enough", () => {
      expect(summarizeCodeSnippet("x = 1")).toBe("x = 1");
    });

    it("truncates long code with ellipsis", () => {
      const long = "x".repeat(200);
      const result = summarizeCodeSnippet(long);
      expect(result.length).toBe(120);
      expect(result.endsWith("…")).toBe(true);
    });

    it("collapses whitespace", () => {
      expect(summarizeCodeSnippet("x  =  \n  1")).toBe("x = 1");
    });
  });

});
