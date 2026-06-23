import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MemoryNode } from "../../modules/memory/memory-types";

const mocks = vi.hoisted(() => ({
  listMemoryNodes: vi.fn(),
  updateMemoryNode: vi.fn(),
}));

vi.mock("@/modules/memory/memory-storage", () => ({
  listMemoryNodes: mocks.listMemoryNodes,
  updateMemoryNode: mocks.updateMemoryNode,
}));

import { runMemoryRetentionCleanup } from "../../modules/memory/memory-retention";

function makeNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: "node-1",
    folderId: "default",
    title: "Test",
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
    updatedAt: "2025-01-01T00:00:00.000Z",
    useCount: 0,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("memory-retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMemoryNode.mockResolvedValue(undefined);
  });

  describe("expired node archival", () => {
    it("archives nodes past their expiresAt", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "expired-1", expiresAt: daysAgo(1) }),
        makeNode({ id: "valid-1", expiresAt: daysFromNow(30) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(1);
      expect(mocks.updateMemoryNode).toHaveBeenCalledWith({ id: "expired-1", status: "archived" });
      expect(mocks.updateMemoryNode).not.toHaveBeenCalledWith({ id: "valid-1", status: "archived" });
    });

    it("archives ephemeral nodes older than 7 days", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "old-ephemeral", priority: "ephemeral", createdAt: daysAgo(10) }),
        makeNode({ id: "new-ephemeral", priority: "ephemeral", createdAt: daysAgo(3) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(1);
      expect(mocks.updateMemoryNode).toHaveBeenCalledWith({ id: "old-ephemeral", status: "archived" });
    });

    it("archives temporary_context nodes older than 7 days", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "old-temp", type: "temporary_context", createdAt: daysAgo(10) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(1);
    });

    it("does not archive protected nodes even if expired", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "pinned-expired", isPinned: true, expiresAt: daysAgo(1) }),
        makeNode({ id: "permanent-expired", priority: "permanent", expiresAt: daysAgo(1) }),
        makeNode({ id: "high-importance-expired", importance: 5, expiresAt: daysAgo(1) }),
        makeNode({ id: "explicit-expired", origin: "explicit_user_save", expiresAt: daysAgo(1) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(0);
    });

    it("does not archive already archived nodes", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "already-archived", status: "archived", expiresAt: daysAgo(1) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(0);
    });

    it("does not archive rejected nodes via expiry", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        makeNode({ id: "rejected", status: "rejected", expiresAt: daysAgo(1) }),
      ]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(0);
    });
  });

  describe("overflow cleanup", () => {
    it("archives excess global low-priority nodes beyond 200", async () => {
      const globalNodes = Array.from({ length: 210 }, (_, i) =>
        makeNode({
          id: `global-${i}`,
          scope: "global",
          priority: "low",
          importance: 1,
          createdAt: daysAgo(20),
          useCount: 0,
        }),
      );
      mocks.listMemoryNodes.mockResolvedValue(globalNodes);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedOverflow).toBeGreaterThanOrEqual(10);
    });

    it("archives excess per-project low-priority nodes beyond 100", async () => {
      const projectNodes = Array.from({ length: 110 }, (_, i) =>
        makeNode({
          id: `proj-${i}`,
          scope: "project",
          projectId: "proj-1",
          priority: "low",
          importance: 1,
          createdAt: daysAgo(20),
          useCount: 0,
        }),
      );
      mocks.listMemoryNodes.mockResolvedValue(projectNodes);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedOverflow).toBeGreaterThanOrEqual(10);
    });

    it("archives excess per-conversation low-priority nodes beyond 30", async () => {
      const convNodes = Array.from({ length: 40 }, (_, i) =>
        makeNode({
          id: `conv-${i}`,
          scope: "conversation",
          conversationId: "conv-1",
          priority: "low",
          importance: 1,
          createdAt: daysAgo(20),
          useCount: 0,
        }),
      );
      mocks.listMemoryNodes.mockResolvedValue(convNodes);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedOverflow).toBeGreaterThanOrEqual(10);
    });

    it("does not archive nodes under the cap", async () => {
      const nodes = Array.from({ length: 190 }, (_, i) =>
        makeNode({
          id: `global-${i}`,
          scope: "global",
          priority: "low",
          importance: 1,
          createdAt: daysAgo(20),
        }),
      );
      mocks.listMemoryNodes.mockResolvedValue(nodes);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedOverflow).toBe(0);
    });
  });

  describe("cleanup sort priority", () => {
    it("archives rejected before low-importance active", async () => {
      const nodes = Array.from({ length: 205 }, (_, i) => {
        if (i === 0) {
          return makeNode({ id: "rejected-1", status: "rejected", scope: "global", priority: "low", importance: 1, createdAt: daysAgo(20) });
        }
        return makeNode({ id: `active-${i}`, status: "active", scope: "global", priority: "low", importance: 1, createdAt: daysAgo(20) });
      });
      mocks.listMemoryNodes.mockResolvedValue(nodes);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedOverflow).toBeGreaterThanOrEqual(1);
      expect(mocks.updateMemoryNode).toHaveBeenCalledWith({ id: "rejected-1", status: "archived" });
    });
  });

  describe("empty state", () => {
    it("handles empty node list", async () => {
      mocks.listMemoryNodes.mockResolvedValue([]);

      const result = await runMemoryRetentionCleanup();
      expect(result.archivedExpired).toBe(0);
      expect(result.archivedOverflow).toBe(0);
    });
  });
});
