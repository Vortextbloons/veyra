import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDocumentIdReference } from "@/modules/documents/document-runtime";
import { useDocumentStore } from "@/modules/documents/document-store";
import type { DocumentRecord } from "@/modules/documents/document-types";

function makeDocument(id: string, title: string): DocumentRecord {
  return {
    id,
    title,
    isGlobal: true,
    type: "document",
    status: "draft",
    editorFormat: "markdown",
    contentMarkdown: "Content",
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("resolveDocumentIdReference", () => {
  const originalState = useDocumentStore.getState();

  beforeEach(() => {
    useDocumentStore.setState({
      documents: [makeDocument("doc-story", "Short Story")],
      activeDocumentId: "doc-story",
    });
  });

  afterEach(() => {
    useDocumentStore.setState(originalState, true);
  });

  it("resolves the model's active placeholder to the preferred created document", () => {
    expect(resolveDocumentIdReference("active", "doc-created")).toBe("doc-created");
  });

  it("resolves an exact document title when the model uses the title as the id", () => {
    expect(resolveDocumentIdReference("short story")).toBe("doc-story");
  });

  it("leaves unknown references unchanged so storage can report the real error", () => {
    expect(resolveDocumentIdReference("missing-doc")).toBe("missing-doc");
  });
});
