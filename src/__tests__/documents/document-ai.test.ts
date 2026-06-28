import { describe, it, expect } from "vitest";
import { buildAiMessages } from "@/modules/documents/document-ai";

describe("buildAiMessages", () => {
  const docContent = "# Title\n\nSome document content here.";
  const docTitle = "Test Document";

  it("builds system message with document title", () => {
    const messages = buildAiMessages(docContent, docTitle, "improve", "");
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Test Document");
  });

  it("includes history messages when provided", () => {
    const history = [
      { role: "user" as const, content: "Previous question" },
      { role: "assistant" as const, content: "Previous answer" },
    ];
    const messages = buildAiMessages(docContent, docTitle, "improve", "", undefined, history);
    expect(messages).toHaveLength(4); // system + 2 history + user
    expect(messages[1].content).toBe("Previous question");
    expect(messages[2].content).toBe("Previous answer");
  });

  it("uses action prompt for improve", () => {
    const messages = buildAiMessages(docContent, docTitle, "improve", "");
    const userMsg = messages[messages.length - 1];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toContain("Improve");
    expect(userMsg.content).toContain(docContent);
  });

  it("uses selected text when provided", () => {
    const selected = "Selected portion of text";
    const messages = buildAiMessages(docContent, docTitle, "expand", "", selected);
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).toContain(selected);
    expect(userMsg.content).toContain("Expand");
  });

  it("handles custom action with user prompt", () => {
    const messages = buildAiMessages(docContent, docTitle, "custom", "Make it sound formal");
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).toContain("Make it sound formal");
  });

  it("truncates long documents for summarize", () => {
    const longContent = "word ".repeat(5000);
    const messages = buildAiMessages(longContent, docTitle, "summarize", "");
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).toContain("[Document truncated for length]");
  });

  it("truncates long documents for custom action", () => {
    const longContent = "word ".repeat(5000);
    const messages = buildAiMessages(longContent, docTitle, "custom", "Fix grammar");
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).toContain("[Document truncated for length]");
  });

  it("does not truncate short documents", () => {
    const messages = buildAiMessages(docContent, docTitle, "summarize", "");
    const userMsg = messages[messages.length - 1];
    expect(userMsg.content).not.toContain("[Document truncated for length]");
    expect(userMsg.content).toContain(docContent);
  });
});
