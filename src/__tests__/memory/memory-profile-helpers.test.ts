import { describe, expect, it } from "vitest";
import type { MemoryNode } from "../../modules/memory/memory-types";
import { PROFILE_CATEGORIES, TOTAL_PROFILE_QUESTIONS } from "../../modules/memory/profile-config";
import {
  buildProfileNodePayload,
  calculateProfileCompleteness,
  isProfileNode,
  profileNodeForQuestion,
} from "../../modules/memory/profile-helpers";

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

describe("profile-helpers", () => {
  describe("isProfileNode", () => {
    it("returns true for node with profile_setup origin", () => {
      expect(isProfileNode(makeNode({ origin: "profile_setup" }))).toBe(true);
    });

    it("returns true for node with profile: tag", () => {
      expect(isProfileNode(makeNode({ tags: ["profile:identity:0"] }))).toBe(true);
    });

    it("returns true for node with profile category tag", () => {
      expect(isProfileNode(makeNode({ tags: ["profile:communication"] }))).toBe(true);
    });

    it("returns false for auto_extracted node without profile tags", () => {
      expect(isProfileNode(makeNode({ origin: "auto_extracted", tags: ["project"] }))).toBe(false);
    });

    it("returns false for explicit_user_save node without profile tags", () => {
      expect(isProfileNode(makeNode({ origin: "explicit_user_save", tags: [] }))).toBe(false);
    });
  });

  describe("profileNodeForQuestion", () => {
    it("finds node matching category and question index", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:identity:0", "profile:identity", "profile"] }),
        makeNode({ id: "node-2", origin: "profile_setup", tags: ["profile:identity:1", "profile:identity", "profile"] }),
      ];
      const result = profileNodeForQuestion(nodes, "identity", 0);
      expect(result?.id).toBe("node-1");
    });

    it("returns undefined when no matching node exists", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:identity:0"] }),
      ];
      expect(profileNodeForQuestion(nodes, "communication", 0)).toBeUndefined();
    });

    it("returns undefined for archived nodes", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:identity:0"], status: "archived" }),
      ];
      expect(profileNodeForQuestion(nodes, "identity", 0)).toBeUndefined();
    });

    it("finds correct question index across categories", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:work:2"] }),
      ];
      const result = profileNodeForQuestion(nodes, "work", 2);
      expect(result?.id).toBe("node-1");
    });
  });

  describe("calculateProfileCompleteness", () => {
    it("returns 0 for empty nodes", () => {
      expect(calculateProfileCompleteness([])).toBe(0);
    });

    it("returns 100 when all questions are answered", () => {
      const nodes: MemoryNode[] = [];
      for (const cat of PROFILE_CATEGORIES) {
        for (let i = 0; i < cat.questions.length; i++) {
          nodes.push(
            makeNode({
              id: `${cat.id}-${i}`,
              origin: "profile_setup",
              tags: [`profile:${cat.id}:${i}`, `profile:${cat.id}`, "profile"],
            }),
          );
        }
      }
      expect(calculateProfileCompleteness(nodes)).toBe(100);
    });

    it("returns correct percentage for partial profile", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:identity:0"] }),
        makeNode({ id: "n2", origin: "profile_setup", tags: ["profile:identity:1"] }),
      ];
      const expected = Math.round((2 / TOTAL_PROFILE_QUESTIONS) * 100);
      expect(calculateProfileCompleteness(nodes)).toBe(expected);
    });

    it("counts exactly one question per slot", () => {
      const nodes = [
        makeNode({ origin: "profile_setup", tags: ["profile:identity:0"] }),
        makeNode({ id: "n2", origin: "profile_setup", tags: ["profile:identity:0"] }),
      ];
      expect(calculateProfileCompleteness(nodes)).toBe(
        Math.round((1 / TOTAL_PROFILE_QUESTIONS) * 100),
      );
    });
  });

  describe("buildProfileNodePayload", () => {
    it("generates correct tag convention", () => {
      const payload = buildProfileNodePayload("identity", 0, "Isaac");
      expect(payload.tag).toBe("profile:identity:0");
      expect(payload.tags).toContain("profile:identity:0");
      expect(payload.tags).toContain("profile:identity");
      expect(payload.tags).toContain("profile");
    });

    it("uses question text as title", () => {
      const payload = buildProfileNodePayload("identity", 0, "Isaac");
      expect(payload.title).toBe(PROFILE_CATEGORIES[0].questions[0].question);
    });

    it("trims and truncates summary to 140 chars", () => {
      const longAnswer = "x".repeat(200);
      const payload = buildProfileNodePayload("identity", 0, longAnswer);
      expect(payload.summary.length).toBeLessThanOrEqual(140);
    });

    it("trims content", () => {
      const payload = buildProfileNodePayload("identity", 0, "  Isaac  ");
      expect(payload.content).toBe("Isaac");
    });

    it("falls back to generated title for unknown category", () => {
      const payload = buildProfileNodePayload("nonexistent", 0, "answer");
      expect(payload.title).toBe("Profile: nonexistent#0");
    });
  });
});
