import { describe, it, expect } from "vitest";
import {
  filterDocuments,
  selectActiveDocumentContent,
  selectActiveDocumentMeta,
} from "@/modules/documents/document-store";
import type { DocumentRecord } from "@/modules/documents/document-types";

function createDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: `doc_${Math.random().toString(36).slice(2, 8)}`,
    isGlobal: true,
    title: "Test Document",
    type: "document",
    status: "draft",
    editorFormat: "markdown",
    contentMarkdown: "Hello world",
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("filterDocuments", () => {
  const docs = [
    createDoc({ id: "doc1", title: "Alpha Draft", status: "draft", updatedAt: "2026-01-03T00:00:00Z" }),
    createDoc({ id: "doc2", title: "Beta Final", status: "final", updatedAt: "2026-01-01T00:00:00Z" }),
    createDoc({ id: "doc3", title: "Gamma Draft", status: "draft", updatedAt: "2026-01-02T00:00:00Z" }),
    createDoc({ id: "doc4", title: "Delta Review", status: "review", updatedAt: "2026-01-04T00:00:00Z" }),
  ];

  it("returns all documents with 'all' filter and no search", () => {
    expect(filterDocuments(docs, "", "all", "updatedAt")).toHaveLength(4);
  });

  it("filters by status", () => {
    const result = filterDocuments(docs, "", "draft", "updatedAt");
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.status === "draft")).toBe(true);
  });

  it("searches by title", () => {
    const result = filterDocuments(docs, "Alpha", "all", "updatedAt");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Alpha Draft");
  });

  it("searches by content", () => {
    const docs2 = [
      createDoc({ id: "d1", title: "Doc 1", contentMarkdown: "Hello world" }),
      createDoc({ id: "d2", title: "Doc 2", contentMarkdown: "Goodbye world" }),
    ];
    const result = filterDocuments(docs2, "Goodbye", "all", "updatedAt");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d2");
  });

  it("searches by tags", () => {
    const docs2 = [
      createDoc({ id: "d1", title: "Doc 1", tags: ["research"] }),
      createDoc({ id: "d2", title: "Doc 2", tags: ["meeting"] }),
    ];
    const result = filterDocuments(docs2, "research", "all", "updatedAt");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
  });

  it("sorts by title alphabetically", () => {
    const result = filterDocuments(docs, "", "all", "title");
    expect(result[0].title).toBe("Alpha Draft");
    expect(result[3].title).toBe("Gamma Draft");
  });

  it("sorts by updatedAt descending by default", () => {
    const result = filterDocuments(docs, "", "all", "updatedAt");
    expect(result[0].id).toBe("doc4");
    expect(result[3].id).toBe("doc2");
  });

  it("combines search and status filter", () => {
    const result = filterDocuments(docs, "Alpha", "draft", "updatedAt");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Alpha Draft");
  });

  it("returns empty when no matches", () => {
    expect(filterDocuments(docs, "zzz", "all", "updatedAt")).toHaveLength(0);
  });
});

describe("selectActiveDocumentContent", () => {
  it("returns draft content when active document is filtered out of the list", () => {
    const content = selectActiveDocumentContent({
      activeDocumentId: "doc_active",
      activeDraftContent: "draft content",
      documents: [],
    } as never);
    expect(content).toBe("draft content");
  });
});

describe("selectActiveDocumentMeta", () => {
  it("returns metadata from the active document when present", () => {
    const doc = createDoc({ id: "doc_active", title: "My Doc", type: "report" });
    const meta = selectActiveDocumentMeta({
      activeDocumentId: "doc_active",
      documents: [doc],
    } as never);
    expect(meta).toEqual({ id: "doc_active", title: "My Doc", type: "report" });
  });

  it("falls back to active id when metadata is not in the filtered list", () => {
    const meta = selectActiveDocumentMeta({
      activeDocumentId: "doc_active",
      documents: [],
    } as never);
    expect(meta).toEqual({
      id: "doc_active",
      title: "Active document",
      type: "document",
    });
  });
});
