import { describe, expect, it } from "vitest";
import { getToolCallUi, toolCallPhaseLabel, isToolCallActive } from "../../lib/tool-call-ui";

describe("tool-call-ui", () => {
  describe("getToolCallUi", () => {
    it("returns metadata for known tools", () => {
      const meta = getToolCallUi("web_search");
      expect(meta.label).toBe("Web Search");
      expect(meta.accent).toBe("cyan");
      expect(meta.icon).toBeDefined();
    });

    it("returns fallback for unknown tool", () => {
      const meta = getToolCallUi("unknown_tool");
      expect(meta.label).toBe("unknown tool");
      expect(meta.accent).toBe("violet");
    });

    it("uses custom fallback label", () => {
      const meta = getToolCallUi("unknown_tool", "Custom Label");
      expect(meta.label).toBe("Custom Label");
    });

    it("returns metadata for all registered tools", () => {
      for (const name of ["web_search", "code_execution", "doc_create", "doc_update", "doc_read", "scratchpad_write", "ask_question"]) {
        const meta = getToolCallUi(name);
        expect(meta.label).toBeTruthy();
        expect(meta.icon).toBeDefined();
      }
    });
  });

  describe("toolCallPhaseLabel", () => {
    it("returns Preparing for pending", () => {
      expect(toolCallPhaseLabel("pending")).toBe("Preparing…");
    });

    it("returns Running for running", () => {
      expect(toolCallPhaseLabel("running")).toBe("Running…");
    });

    it("returns Retrying with count", () => {
      expect(toolCallPhaseLabel("retrying", 1)).toBe("Retrying (1/2)…");
    });

    it("returns Retrying without count", () => {
      expect(toolCallPhaseLabel("retrying")).toBe("Retrying…");
    });

    it("returns Failed for error", () => {
      expect(toolCallPhaseLabel("error")).toBe("Failed");
    });

    it("returns Completed for done", () => {
      expect(toolCallPhaseLabel("done")).toBe("Completed");
    });
  });

  describe("isToolCallActive", () => {
    it("returns true for pending", () => {
      expect(isToolCallActive("pending")).toBe(true);
    });

    it("returns true for running", () => {
      expect(isToolCallActive("running")).toBe(true);
    });

    it("returns true for retrying", () => {
      expect(isToolCallActive("retrying")).toBe(true);
    });

    it("returns false for done", () => {
      expect(isToolCallActive("done")).toBe(false);
    });

    it("returns false for error", () => {
      expect(isToolCallActive("error")).toBe(false);
    });
  });
});
