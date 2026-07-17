import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listMemoryNodes: vi.fn(),
  searchMemory: vi.fn(),
  vectorSearchMemory: vi.fn(),
  updateMemoryNode: vi.fn(),
  buildMemoryContextBlock: vi.fn((s: string) => `<veyra_memory>\n${s}\n</veyra_memory>`),
  estimateTokens: vi.fn((s: string) => Math.ceil(s.length / 4)),
  useSettingsStore: vi.fn(),
}));

vi.mock("@/modules/memory/memory-storage", () => ({
  listMemoryNodes: mocks.listMemoryNodes,
  searchMemory: mocks.searchMemory,
  vectorSearchMemory: mocks.vectorSearchMemory,
  updateMemoryNode: mocks.updateMemoryNode,
}));

vi.mock("@/lib/prompts", () => ({
  buildMemoryContextBlock: mocks.buildMemoryContextBlock,
}));

vi.mock("@/lib/context", () => ({
  estimateTokens: mocks.estimateTokens,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: mocks.useSettingsStore,
  },
}));

import { buildMemoryPackWithInfo } from "../../modules/memory/memory-retrieval";

function mockSettings(overrides: Record<string, unknown> = {}) {
  mocks.useSettingsStore.mockReturnValue({
    vectorSearchEnabled: false,
    vectorSearchEndpointUrl: "",
    vectorSearchModel: "",
    vectorWeight: 0.5,
    bm25Weight: 0.4,
    metaWeight: 0.1,
    vectorDuplicateThreshold: 0.92,
    ...overrides,
  });
}

describe("memory-retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings();
    mocks.listMemoryNodes.mockResolvedValue([]);
    mocks.searchMemory.mockResolvedValue([]);
  });

  describe("early exits", () => {
    it("returns disabled when enabled=false", async () => {
      const result = await buildMemoryPackWithInfo({
        enabled: false,
        mode: "safe_auto_save",
        query: "test",
        budget: 4000,
      });
      expect(result.info.status).toBe("disabled");
      expect(result.pack).toBeNull();
    });

    it("returns disabled when mode is off", async () => {
      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "off",
        query: "test",
        budget: 4000,
      });
      expect(result.info.status).toBe("disabled");
    });

    it("returns empty for empty query", async () => {
      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "",
        budget: 4000,
      });
      expect(result.info.status).toBe("empty");
    });

    it("returns empty for zero budget", async () => {
      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "test",
        budget: 0,
      });
      expect(result.info.status).toBe("empty");
    });

    it("returns empty for whitespace-only query", async () => {
      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "   ",
        budget: 4000,
      });
      expect(result.info.status).toBe("empty");
    });
  });

  describe("pack construction", () => {
    it("returns used status when memories found", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        {
          id: "n1",
          folderId: "default",
          title: "User prefers dark mode",
          content: "User prefers dark mode in all applications",
          summary: "Dark mode preference",
          type: "preference" as const,
          scope: "global" as const,
          tags: ["ui", "dark-mode"],
          importance: 4,
          confidence: 0.9,
          priority: "high" as const,
          sourceMessageIds: [],
          origin: "explicit_user_save" as const,
          status: "active" as const,
          isPinned: true,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-06-01T00:00:00.000Z",
          useCount: 5,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "what are my preferences",
        budget: 4000,
      });

      expect(result.info.status).toBe("used");
      expect(result.pack).not.toBeNull();
      expect(result.pack?.sourceNodeIds).toContain("n1");
    });

    it("returns empty when no candidates match", async () => {
      mocks.listMemoryNodes.mockResolvedValue([]);
      mocks.searchMemory.mockResolvedValue([]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "tell me about quantum physics",
        budget: 4000,
      });

      expect(result.info.status).toBe("empty");
    });

    it("returns empty when all candidates below noise floor", async () => {
      mocks.searchMemory.mockResolvedValue([
        {
          id: "n1",
          folderId: "default",
          title: "xyz",
          content: "completely unrelated content",
          summary: "unrelated",
          type: "idea" as const,
          scope: "global" as const,
          tags: [],
          importance: 1,
          confidence: 0.1,
          priority: "ephemeral" as const,
          sourceMessageIds: [],
          origin: "auto_extracted" as const,
          status: "active" as const,
          isPinned: false,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          useCount: 0,
          relevanceScore: 0.01,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "quantum physics theory",
        budget: 4000,
      });

      expect(result.info.status).toBe("empty");
    });
  });

  describe("node filtering", () => {
    it("excludes archived nodes", async () => {
      mocks.searchMemory.mockResolvedValue([
        {
          id: "archived-1",
          folderId: "default",
          title: "Archived memory",
          content: "This is archived",
          summary: "Archived",
          type: "summary" as const,
          scope: "global" as const,
          tags: [],
          importance: 3,
          confidence: 0.7,
          priority: "medium" as const,
          sourceMessageIds: [],
          origin: "auto_extracted" as const,
          status: "archived" as const,
          isPinned: false,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          useCount: 0,
          relevanceScore: 0.8,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "archived memory",
        budget: 4000,
      });

      expect(result.info.status).toBe("empty");
    });

    it("excludes rejected nodes", async () => {
      mocks.searchMemory.mockResolvedValue([
        {
          id: "rejected-1",
          folderId: "default",
          title: "Rejected memory",
          content: "This was rejected",
          summary: "Rejected",
          type: "summary" as const,
          scope: "global" as const,
          tags: [],
          importance: 3,
          confidence: 0.7,
          priority: "medium" as const,
          sourceMessageIds: [],
          origin: "auto_extracted" as const,
          status: "rejected" as const,
          isPinned: false,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          useCount: 0,
          relevanceScore: 0.8,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "rejected memory",
        budget: 4000,
      });

      expect(result.info.status).toBe("empty");
    });

    it("needs_review nodes excluded in safe_auto_save but allowed in review_all", async () => {
      const reviewNode = {
        id: "review-1",
        folderId: "default",
        title: "Needs review memory",
        content: "This needs review",
        summary: "Needs review",
        type: "preference" as const,
        scope: "global" as const,
        tags: [],
        importance: 3,
        confidence: 0.7,
        priority: "medium" as const,
        sourceMessageIds: [],
        origin: "auto_extracted" as const,
        status: "needs_review" as const,
        isPinned: false,
        userEditable: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
        useCount: 0,
        relevanceScore: 0.8,
      };

      mocks.searchMemory.mockResolvedValue([reviewNode]);

      const safeResult = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "needs review memory",
        budget: 4000,
      });
      expect(safeResult.info.status).toBe("empty");

      const reviewResult = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "review_all",
        query: "needs review memory",
        budget: 4000,
      });
      expect(reviewResult.info.status).toBe("used");
    });

    it("manual_only excludes auto_extracted unless pinned", async () => {
      mocks.searchMemory.mockResolvedValue([
        {
          id: "auto-1",
          folderId: "default",
          title: "Auto extracted",
          content: "Auto extracted content",
          summary: "Auto",
          type: "summary" as const,
          scope: "global" as const,
          tags: [],
          importance: 3,
          confidence: 0.7,
          priority: "medium" as const,
          sourceMessageIds: [],
          origin: "auto_extracted" as const,
          status: "active" as const,
          isPinned: false,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-06-01T00:00:00.000Z",
          useCount: 0,
          relevanceScore: 0.8,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "manual_only",
        query: "auto extracted content",
        budget: 4000,
      });
      expect(result.info.status).toBe("empty");
    });
  });

  describe("formatting", () => {
    it("formats nodes with type labels", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        {
          id: "n1",
          folderId: "default",
          title: "Preference node",
          content: "User prefers dark mode",
          summary: "Dark mode preference",
          type: "preference" as const,
          scope: "global" as const,
          tags: [],
          importance: 5,
          confidence: 0.9,
          priority: "permanent" as const,
          sourceMessageIds: [],
          origin: "explicit_user_save" as const,
          status: "active" as const,
          isPinned: true,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-06-01T00:00:00.000Z",
          useCount: 5,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "dark mode preference",
        budget: 4000,
      });

      expect(result.pack?.content).toContain("[Preference]");
      expect(result.pack?.content).toContain("Dark mode preference");
    });

    it("marks needs_review nodes as unverified", async () => {
      mocks.listMemoryNodes.mockResolvedValue([
        {
          id: "n1",
          folderId: "default",
          title: "Pinned review node",
          content: "This needs review",
          summary: "Review needed",
          type: "decision" as const,
          scope: "global" as const,
          tags: [],
          importance: 3,
          confidence: 0.6,
          priority: "medium" as const,
          sourceMessageIds: [],
          origin: "auto_extracted" as const,
          status: "needs_review" as const,
          isPinned: true,
          userEditable: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-06-01T00:00:00.000Z",
          useCount: 0,
        },
      ]);

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "review needed",
        budget: 4000,
      });

      expect(result.pack?.content).toContain("[unverified]");
    });
  });

  describe("error handling", () => {
    it("handles storage errors gracefully", async () => {
      mocks.listMemoryNodes.mockRejectedValue(new Error("DB locked"));

      const result = await buildMemoryPackWithInfo({
        enabled: true,
        mode: "safe_auto_save",
        query: "what are my coding preferences",
        budget: 4000,
      });

      expect(result.info.status).toBe("empty");
      expect(result.pack).toBeNull();
      expect(result.info.detail).toContain("DB locked");
    });
  });
});
