import { describe, expect, it } from "vitest";
import {
  getStudioSystemInstruction,
  buildModeContextBlock,
  inferStudioContextMode,
  shouldIncludeStudioResponseContext,
} from "@/modules/chat/studio/studio-context";
import type { StudioContextMode } from "@/modules/chat/studio/studio-types";

describe("Studio Phase 5 — specialized integrations", () => {
  describe("mode-aware system instructions", () => {
    it("returns the base instruction for chat mode", () => {
      const instruction = getStudioSystemInstruction("chat");
      expect(instruction).toContain("studio_render");
      expect(instruction).not.toContain("character-appropriate");
      expect(instruction).not.toContain("evidence interfaces");
    });

    it("includes character scene hints for character mode", () => {
      const instruction = getStudioSystemInstruction("character");
      expect(instruction).toContain("character-appropriate visual scenes");
      expect(instruction).toContain("persona");
    });

    it("includes evidence interface hints for research mode", () => {
      const instruction = getStudioSystemInstruction("research");
      expect(instruction).toContain("evidence interfaces");
      expect(instruction).toContain("source comparison tables");
    });

    it("includes project command center hints for project mode", () => {
      const instruction = getStudioSystemInstruction("project");
      expect(instruction).toContain("project command centers");
      expect(instruction).toContain("milestone trackers");
    });

    it("includes document presentation hints for document mode", () => {
      const instruction = getStudioSystemInstruction("document");
      expect(instruction).toContain("document presentations");
      expect(instruction).toContain("formatted readers");
    });

    it("defaults to chat mode when not specified", () => {
      expect(getStudioSystemInstruction()).toBe(getStudioSystemInstruction("chat"));
    });
  });

  describe("mode inference", () => {
    it("infers character mode from characterId", () => {
      expect(inferStudioContextMode({ characterId: "char-1" })).toBe("character");
    });

    it("infers character mode from groupId", () => {
      expect(inferStudioContextMode({ groupId: "group-1" })).toBe("character");
    });

    it("infers project mode from projectId", () => {
      expect(inferStudioContextMode({ projectId: "proj-1" })).toBe("project");
    });

    it("infers chat mode when no domain properties are set", () => {
      expect(inferStudioContextMode({})).toBe("chat");
    });

    it("defaults to chat mode for undefined conversation", () => {
      expect(inferStudioContextMode()).toBe("chat");
    });

    it("prefers character over project when both are set", () => {
      expect(inferStudioContextMode({ characterId: "char-1", projectId: "proj-1" })).toBe("character");
    });
  });

  describe("mode context block", () => {
    it("returns undefined for chat mode", () => {
      expect(buildModeContextBlock("chat")).toBeUndefined();
    });

    it("builds character context block with persona data", () => {
      const block = buildModeContextBlock("character", {
        persona: "Alice — The Curious Explorer",
      });
      expect(block).toContain('mode="character"');
      expect(block).toContain("Alice");
      expect(block).toContain("The Curious Explorer");
    });

    it("builds character context block with scenario and lore", () => {
      const block = buildModeContextBlock("character", {
        persona: "Bob",
        scenario: "A mysterious forest",
        loreEntries: "The forest is ancient",
      });
      expect(block).toContain("Bob");
      expect(block).toContain("mysterious forest");
      expect(block).toContain("forest is ancient");
    });

    it("builds project context block", () => {
      const block = buildModeContextBlock("project", {
        projectName: "Veyra",
        projectKind: "desktop-app",
        projectDescription: "An AI workspace",
      });
      expect(block).toContain('mode="project"');
      expect(block).toContain("Veyra");
      expect(block).toContain("desktop-app");
      expect(block).toContain("AI workspace");
    });

    it("returns undefined for character mode without domain data", () => {
      expect(buildModeContextBlock("character")).toBeUndefined();
    });

    it("returns a research context without requiring domain data", () => {
      const block = buildModeContextBlock("research");
      expect(block).toContain('mode="research"');
      expect(block).toContain("research sources");
    });
  });

  describe("revision prompt detection", () => {
    it("detects revision-related prompts", () => {
      expect(shouldIncludeStudioResponseContext("Can you restyle the dashboard?")).toBe(true);
      expect(shouldIncludeStudioResponseContext("Update the view")).toBe(true);
      expect(shouldIncludeStudioResponseContext("What is the weather?")).toBe(false);
    });
  });
});
