import { describe, expect, it } from "vitest";
import { normalizeAttachment, inferSupportsImages, isBinaryDocument, formatFileSize } from "../../lib/message-attachments";

describe("message-attachments", () => {
  describe("normalizeAttachment", () => {
    it("fills missing fileType for image mime", () => {
      const result = normalizeAttachment({ id: "1", name: "img.jpg", mimeType: "image/jpeg", dataUrl: "data:..." });
      expect(result.fileType).toBe("image");
    });

    it("fills missing fileType for text mime", () => {
      const result = normalizeAttachment({ id: "1", name: "doc.txt", mimeType: "text/plain", dataUrl: "" });
      expect(result.fileType).toBe("text");
    });

    it("fills missing size with 0", () => {
      const result = normalizeAttachment({ id: "1", name: "doc.txt", mimeType: "text/plain", dataUrl: "" });
      expect(result.size).toBe(0);
    });

    it("preserves existing fileType", () => {
      const result = normalizeAttachment({ id: "1", name: "doc.txt", mimeType: "text/plain", dataUrl: "", fileType: "text" });
      expect(result.fileType).toBe("text");
    });
  });

  describe("inferSupportsImages", () => {
    it("detects vision models", () => {
      expect(inferSupportsImages("llava-1.6")).toBe(true);
      expect(inferSupportsImages("gemma-3-it")).toBe(true);
      expect(inferSupportsImages("qwen2.5-vl-7b")).toBe(true);
      expect(inferSupportsImages("llama-3.2-vision")).toBe(true);
      expect(inferSupportsImages("phi-4-multimodal")).toBe(true);
    });

    it("rejects non-vision models", () => {
      expect(inferSupportsImages("llama-3.1-8b")).toBe(false);
      expect(inferSupportsImages("mistral-7b")).toBe(false);
      expect(inferSupportsImages("codellama-13b")).toBe(false);
    });

    it("case insensitive", () => {
      expect(inferSupportsImages("LLAVA-1.6")).toBe(true);
    });
  });

  describe("isBinaryDocument", () => {
    it("recognizes pdf", () => {
      expect(isBinaryDocument("application/pdf")).toBe(true);
    });

    it("recognizes docx", () => {
      expect(isBinaryDocument("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    });

    it("rejects text types", () => {
      expect(isBinaryDocument("text/plain")).toBe(false);
      expect(isBinaryDocument("application/json")).toBe(false);
    });
  });

  describe("formatFileSize", () => {
    it("formats bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatFileSize(1500)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    });
  });
});
