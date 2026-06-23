import { describe, expect, it } from "vitest";
import type { MemoryNode } from "../../modules/memory/memory-types";
import { selectVisibleNodes } from "../../modules/memory/memory-store";

function makeNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: "node-1",
    folderId: "default",
    title: "Test node",
    content: "Test content",
    summary: "Test summary",
    type: "preference",
    scope: "global",
    tags: [],
    importance: 3,
    confidence: 0.8,
    priority: "medium",
    sourceMessageIds: [],
    origin: "auto_extracted",
    status: "active",
    isPinned: false,
    userEditable: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
    useCount: 0,
    ...overrides,
  };
}

const allNodes: MemoryNode[] = [
  makeNode({ id: "active-1", status: "active", isPinned: true, importance: 5, priority: "permanent" }),
  makeNode({ id: "active-2", status: "active", isPinned: false, importance: 3, priority: "medium" }),
  makeNode({ id: "review-1", status: "needs_review", isPinned: false, importance: 2, priority: "low" }),
  makeNode({ id: "archived-1", status: "archived", isPinned: false, importance: 1, priority: "ephemeral" }),
  makeNode({ id: "rejected-1", status: "rejected", isPinned: false, importance: 1, priority: "low" }),
  makeNode({ id: "low-1", status: "active", isPinned: false, importance: 1, priority: "low" }),
  makeNode({ id: "ephemeral-1", status: "active", isPinned: false, importance: 3, priority: "ephemeral" }),
  makeNode({ id: "project-1", status: "active", isPinned: false, importance: 4, scope: "project", projectId: "proj-1" }),
  makeNode({ id: "pinned-1", status: "active", isPinned: true, importance: 3, priority: "medium" }),
];

describe("selectVisibleNodes", () => {
  describe("view filters", () => {
    it("all: excludes archived", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "all", "");
      expect(result.every((n) => n.status !== "archived")).toBe(true);
      expect(result.some((n) => n.id === "active-1")).toBe(true);
      expect(result.some((n) => n.id === "review-1")).toBe(true);
      expect(result.some((n) => n.id === "rejected-1")).toBe(true);
    });

    it("inbox: only needs_review", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "inbox", "");
      expect(result.every((n) => n.status === "needs_review")).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("review-1");
    });

    it("pinned: isPinned and not archived/rejected", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "pinned", "");
      expect(result.every((n) => n.isPinned && n.status !== "archived" && n.status !== "rejected")).toBe(true);
      expect(result.some((n) => n.id === "active-1")).toBe(true);
      expect(result.some((n) => n.id === "pinned-1")).toBe(true);
    });

    it("permanent: isPinned or permanent priority or importance >= 5, not archived/rejected", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "permanent", "");
      expect(result.some((n) => n.id === "active-1")).toBe(true); // importance 5
      expect(result.some((n) => n.id === "pinned-1")).toBe(true); // pinned
      expect(result.every((n) => n.status !== "archived" && n.status !== "rejected")).toBe(true);
    });

    it("low_priority: low/ephemeral priority or importance <= 2, not archived/rejected", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "low_priority", "");
      expect(result.some((n) => n.id === "low-1")).toBe(true);
      expect(result.some((n) => n.id === "ephemeral-1")).toBe(true);
      expect(result.some((n) => n.id === "review-1")).toBe(true); // importance 2
      expect(result.every((n) => n.status !== "archived" && n.status !== "rejected")).toBe(true);
    });

    it("archived: only archived", () => {
      const result = selectVisibleNodes({ nodes: allNodes }, "archived", "");
      expect(result.every((n) => n.status === "archived")).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("archived-1");
    });

    it("recent: non-archived, sorted by updatedAt desc, max 30", () => {
      const nodes = Array.from({ length: 35 }, (_, i) =>
        makeNode({ id: `n${i}`, updatedAt: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }),
      );
      const result = selectVisibleNodes({ nodes }, "recent", "");
      expect(result.length).toBe(30);
      expect(result[0].updatedAt >= result[1].updatedAt).toBe(true);
    });
  });

  describe("sort order", () => {
    it("pinned nodes sort first", () => {
      const nodes = [
        makeNode({ id: "unpinned", isPinned: false, importance: 5 }),
        makeNode({ id: "pinned", isPinned: true, importance: 1 }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "");
      expect(result[0].id).toBe("pinned");
    });

    it("higher importance sorts first within same pin status", () => {
      const nodes = [
        makeNode({ id: "low", isPinned: false, importance: 1 }),
        makeNode({ id: "high", isPinned: false, importance: 5 }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "");
      expect(result[0].id).toBe("high");
    });

    it("newer updatedAt sorts first within same importance", () => {
      const nodes = [
        makeNode({ id: "old", isPinned: false, importance: 3, updatedAt: "2025-01-01T00:00:00.000Z" }),
        makeNode({ id: "new", isPinned: false, importance: 3, updatedAt: "2025-06-01T00:00:00.000Z" }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "");
      expect(result[0].id).toBe("new");
    });
  });

  describe("query filtering", () => {
    it("matches title", () => {
      const nodes = [
        makeNode({ id: "n1", title: "Dark mode preference" }),
        makeNode({ id: "n2", title: "Light mode preference" }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "dark");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("n1");
    });

    it("matches content", () => {
      const nodes = [
        makeNode({ id: "n1", title: "Preference", content: "Uses VS Code" }),
        makeNode({ id: "n2", title: "Preference", content: "Uses Vim" }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "vs code");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("n1");
    });

    it("matches tags", () => {
      const nodes = [
        makeNode({ id: "n1", tags: ["rust", "systems"] }),
        makeNode({ id: "n2", tags: ["javascript", "web"] }),
      ];
      const result = selectVisibleNodes({ nodes }, "all", "rust");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("n1");
    });

    it("case-insensitive matching", () => {
      const nodes = [makeNode({ id: "n1", title: "Dark Mode" })];
      const result = selectVisibleNodes({ nodes }, "all", "DARK");
      expect(result.length).toBe(1);
    });

    it("empty query returns all visible", () => {
      const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
      const result = selectVisibleNodes({ nodes }, "all", "");
      expect(result.length).toBe(2);
    });
  });
});
