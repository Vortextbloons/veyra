import { describe, it, expect } from "vitest";
import { filterAttachments } from "@/hooks/use-chat-attachments";
import type { MessageAttachment } from "@/lib/message-attachments";

function img(id: string): MessageAttachment {
  return { id, name: `${id}.png`, mimeType: "image/png", dataUrl: "", fileType: "image", size: 100 };
}
function file(id: string): MessageAttachment {
  return { id, name: `${id}.txt`, mimeType: "text/plain", dataUrl: "", fileType: "text", size: 100 };
}

describe("filterAttachments", () => {
  it("returns all attachments when no images", () => {
    const attachments = [file("a"), file("b")];
    const result = filterAttachments(attachments, true, "hello");
    expect(result.effectiveAttachments).toEqual(attachments);
    expect(result.blocked).toBe(false);
  });

  it("returns all attachments when model supports images", () => {
    const attachments = [img("a"), file("b")];
    const result = filterAttachments(attachments, true, "hello");
    expect(result.effectiveAttachments).toEqual(attachments);
    expect(result.blocked).toBe(false);
  });

  it("strips images on non-vision model with text", () => {
    const attachments = [img("a"), file("b")];
    const result = filterAttachments(attachments, false, "hello");
    expect(result.effectiveAttachments).toEqual([file("b")]);
    expect(result.blocked).toBe(false);
  });

  it("strips images on non-vision model with only images and no text", () => {
    const attachments = [img("a")];
    const result = filterAttachments(attachments, false, "");
    expect(result.effectiveAttachments).toEqual([]);
    expect(result.blocked).toBe(true);
  });

  it("returns empty when undefined attachments", () => {
    const result = filterAttachments(undefined, true, "hello");
    expect(result.effectiveAttachments).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("blocks when only images on non-vision model with empty text", () => {
    const attachments = [img("a"), img("b")];
    const result = filterAttachments(attachments, false, "");
    expect(result.effectiveAttachments).toEqual([]);
    expect(result.blocked).toBe(true);
  });
});
