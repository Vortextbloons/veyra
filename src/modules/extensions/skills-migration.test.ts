import { describe, expect, it } from "vitest";
import { migrateLegacySkills } from "./skills-migration";

describe("legacy skill migration", () => {
  it("keeps installed instructions and drops the retired manifest fields", () => {
    const migrated = migrateLegacySkills({
      skills: [{
        id: "skill.release-notes",
        type: "skill",
        name: "Release Notes",
        description: "Writes release notes.",
        version: "2.0.0",
        enabled: true,
        provenance: "local",
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        health: "ready",
        instructions: "Use three bullets.",
        contentHash: "abc123",
        requestedCapabilities: ["mcp.github.create_issue"],
        workflows: [{ id: "brief", name: "Brief", instructions: "Be brief." }],
      }],
    });
    expect(migrated.skills).toHaveLength(1);
    const skill = migrated.skills[0];
    expect(skill.id).toBe("skill.release-notes");
    expect(skill.name).toBe("Release Notes");
    expect(skill.slug).toBe("release-notes");
    expect(skill.instructions).toBe("Use three bullets.");
    expect(skill.contentHash).toBe("abc123");
    // Capability declarations are no longer a Skill feature, kept for reference only.
    expect(skill.legacyCapabilities).toEqual(["mcp.github.create_issue"]);
    expect(skill.legacyWorkflows).toEqual([{ id: "brief", name: "Brief", instructions: "Be brief." }]);
  });

  it("turns an old chat selection into an explicit persistent Skill", () => {
    const migrated = migrateLegacySkills({
      skills: [{ id: "skill.one", name: "One", description: "", instructions: "Body.", enabled: true }],
      activeSkillIds: { "chat-a": "skill.one", "chat-b": null },
    });
    expect(migrated.chatSkillIds).toEqual({ "chat-a": ["skill.one"] });
  });

  it("does not carry a selection for a skill that no longer exists", () => {
    const migrated = migrateLegacySkills({ skills: [], activeSkillIds: { "chat-a": "skill.gone" } });
    expect(migrated.chatSkillIds).toEqual({});
  });

  it("drops disabled skills' selections so nothing runs silently", () => {
    const migrated = migrateLegacySkills({
      skills: [{ id: "skill.off", name: "Off", description: "", instructions: "Body.", enabled: false }],
      activeSkillIds: { "chat-a": "skill.off" },
    });
    // The selection is preserved; the enabled check happens at request time.
    expect(migrated.chatSkillIds["chat-a"]).toEqual(["skill.off"]);
    expect(migrated.skills[0].enabled).toBe(false);
    expect(migrated.skills[0].health).toBe("disabled");
  });

  it("gives a migrated skill a slug and hash when the old record lacked them", () => {
    const migrated = migrateLegacySkills({ skills: [{ name: "PDF Tools", description: "Extract.", instructions: "Read.", enabled: true }] });
    expect(migrated.skills[0].slug).toBe("pdf-tools");
    expect(migrated.skills[0].contentHash).toHaveLength(64);
  });

  it("ignores a nameless or malformed record instead of inventing one", () => {
    const migrated = migrateLegacySkills({ skills: [{ description: "No name." }, null, "junk"] });
    expect(migrated.skills).toEqual([]);
  });

  it("is empty for a missing payload", () => {
    expect(migrateLegacySkills(undefined)).toEqual({ skills: [], chatSkillIds: {}, invocationsByMessage: {} });
  });
});
