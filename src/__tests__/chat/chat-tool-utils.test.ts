import { describe, expect, it } from "vitest";
import {
  stringArg,
  docCreateIntentFromToolCall,
  docUpdateIntentFromToolCall,
  docReadIntentFromToolCall,
  stripPythonCodeFence,
  summarizeCodeSnippet,
  summarizePythonExecutionResult,
  formatPythonExecutionSection,
} from "../../modules/chat/chat-tool-utils";

function makeCall(args: Record<string, unknown> = {}) {
  return { id: "call-1", name: "test", arguments: args };
}

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

  describe("docCreateIntentFromToolCall", () => {
    it("returns intent with valid args", () => {
      const result = docCreateIntentFromToolCall(
        makeCall({ title: "My Doc", documentType: "document", contentMarkdown: "# Hello" }),
      );
      expect(result).toEqual({ type: "doc.create", title: "My Doc", documentType: "document", contentMarkdown: "# Hello" });
    });

    it("returns null when title missing", () => {
      expect(docCreateIntentFromToolCall(makeCall({ documentType: "document", contentMarkdown: "content" }))).toBeNull();
    });

    it("returns null when documentType missing", () => {
      expect(docCreateIntentFromToolCall(makeCall({ title: "Doc", contentMarkdown: "content" }))).toBeNull();
    });

    it("returns null when contentMarkdown missing", () => {
      expect(docCreateIntentFromToolCall(makeCall({ title: "Doc", documentType: "document" }))).toBeNull();
    });
  });

  describe("docUpdateIntentFromToolCall", () => {
    it("returns intent with valid args", () => {
      const result = docUpdateIntentFromToolCall(
        makeCall({ documentId: "doc-1", mode: "replace_all", contentMarkdown: "new content" }),
      );
      expect(result).toEqual({ type: "doc.update", documentId: "doc-1", mode: "replace_all", contentMarkdown: "new content", target: undefined });
    });

    it("includes target when provided", () => {
      const result = docUpdateIntentFromToolCall(
        makeCall({ documentId: "doc-1", mode: "replace_section", contentMarkdown: "new", target: "Section Title" }),
      );
      expect(result?.target).toBe("Section Title");
    });

    it("returns null when documentId missing", () => {
      expect(docUpdateIntentFromToolCall(makeCall({ mode: "replace_all", contentMarkdown: "content" }))).toBeNull();
    });
  });

  describe("docReadIntentFromToolCall", () => {
    it("returns intent with valid doc id", () => {
      expect(docReadIntentFromToolCall(makeCall({ documentId: "doc-1" }))).toEqual({ type: "doc.read", documentId: "doc-1" });
    });

    it("returns null when documentId missing", () => {
      expect(docReadIntentFromToolCall(makeCall({}))).toBeNull();
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

  describe("summarizePythonExecutionResult", () => {
    it("reports timeout", () => {
      expect(summarizePythonExecutionResult({ stdout: "", stderr: "", exitCode: null, timedOut: true, durationMs: 30000 })).toBe("Timed out after 30s");
    });

    it("reports non-zero exit code", () => {
      expect(summarizePythonExecutionResult({ stdout: "", stderr: "error", exitCode: 1, timedOut: false, durationMs: 100 })).toBe("Exited with code 1");
    });

    it("reports stdout and stderr", () => {
      expect(summarizePythonExecutionResult({ stdout: "out", stderr: "err", exitCode: 0, timedOut: false, durationMs: 100 })).toBe("Exited 0 · stdout and stderr captured");
    });

    it("reports stderr only", () => {
      expect(summarizePythonExecutionResult({ stdout: "", stderr: "warning", exitCode: 0, timedOut: false, durationMs: 100 })).toBe("Exited 0 · stderr captured");
    });

    it("reports short stdout", () => {
      expect(summarizePythonExecutionResult({ stdout: "hello", stderr: "", exitCode: 0, timedOut: false, durationMs: 100 })).toBe("Exited 0 · hello");
    });

    it("reports long stdout as captured", () => {
      const longStdout = "x".repeat(200);
      expect(summarizePythonExecutionResult({ stdout: longStdout, stderr: "", exitCode: 0, timedOut: false, durationMs: 100 })).toBe("Exited 0 · output captured");
    });

    it("reports no output", () => {
      expect(summarizePythonExecutionResult({ stdout: "", stderr: "", exitCode: 0, timedOut: false, durationMs: 100 })).toBe("Exited 0 · no output");
    });
  });

  describe("formatPythonExecutionSection", () => {
    it("formats full result", () => {
      const result = formatPythonExecutionSection({
        stdout: "hello",
        stderr: "warning",
        exitCode: 0,
        timedOut: false,
        pythonPath: "/usr/bin/python3",
        durationMs: 150,
        workingDirectory: "/tmp",
      });
      expect(result).toContain("Python: /usr/bin/python3");
      expect(result).toContain("Working directory: /tmp");
      expect(result).toContain("Duration: 150 ms");
      expect(result).toContain("Exit code: 0");
      expect(result).toContain("Stdout:\nhello");
      expect(result).toContain("Stderr:\nwarning");
    });

    it("shows empty labels when no output", () => {
      const result = formatPythonExecutionSection({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        pythonPath: "python",
        durationMs: 0,
        workingDirectory: ".",
      });
      expect(result).toContain("Stdout: (empty)");
      expect(result).toContain("Stderr: (empty)");
    });

    it("marks timed out", () => {
      const result = formatPythonExecutionSection({
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: true,
        pythonPath: "python",
        durationMs: 30000,
        workingDirectory: ".",
      });
      expect(result).toContain("(timed out)");
    });
  });
});
