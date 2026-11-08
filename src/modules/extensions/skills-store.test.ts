import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillRecord } from "./extension-types";
import { isModelInvocable, manualOnlySkills, modelInvocableSkills } from "./skill-runtime";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});

vi.mock("@/lib/providers", () => ({ getProviderAdapter: () => undefined }));
vi.mock("@/stores/provider-store", () => ({ useProviderStore: { getState: () => ({ selectedProvider: "lm-studio", selectedModel: "" }) } }));
vi.mock("@/stores/settings-store", () => ({ useSettingsStore: { getState: () => ({ getModelSettings: () => ({}) }) } }));

const { useSkillsStore, importLegacySkillsOnce, invocationsFor } = await import("./skills-store");

function reset(): void {
  values.clear();
  useSkillsStore.setState({ skills: [], chatSkillIds: {}, pendingTurnSkillIds: {}, skillsEnabled: true, modelInvocationDefault: false });
}

/** Minimal record shaped like a library entry, for the access-rule cases. */
function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: "skill.notes.abcd", type: "skill", name: "Notes", slug: "notes", description: "D",
    instructions: "Body.", version: "1.0.0", enabled: true, provenance: "local",
    installedAt: "", updatedAt: "", health: "ready", contentHash: "h",
    ...overrides,
  } as SkillRecord;
}

describe("skill library store", () => {
  beforeEach(reset);

  it("creates a skill and rejects a duplicate name", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Release notes", description: "Write notes.", instructions: "Be brief." });
    expect(useSkillsStore.getState().skills.map((skill) => skill.id)).toContain(created.id);
    await expect(useSkillsStore.getState().createSkill({ name: "release notes", description: "Other.", instructions: "Body." }))
      .rejects.toThrow(/already exists/);
  });

  it("duplicates with a distinct name", async () => {
    const source = await useSkillsStore.getState().createSkill({ name: "Release notes", description: "Write notes.", instructions: "Be brief." });
    const copy = await useSkillsStore.getState().duplicateSkill(source.id);
    expect(copy?.name).toBe("Release notes copy");
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.instructions).toBe(source.instructions);
  });

  it("edits in place and keeps the id stable", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Notes", description: "Old.", instructions: "Old body." });
    const updated = await useSkillsStore.getState().updateSkill(created.id, { instructions: "New body." });
    expect(updated.id).toBe(created.id);
    expect(useSkillsStore.getState().skills[0].instructions).toBe("New body.");
  });

  it("removes a skill and clears its selections", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Notes", description: "Desc.", instructions: "Body." });
    useSkillsStore.getState().addChatSkill("chat-a", created.id);
    useSkillsStore.getState().setPendingTurnSkills("chat-a", [created.id]);
    useSkillsStore.getState().removeSkill(created.id);
    expect(useSkillsStore.getState().skills).toEqual([]);
    expect(useSkillsStore.getState().chatSkillIds["chat-a"]).toEqual([]);
    expect(useSkillsStore.getState().pendingTurnSkillIds["chat-a"]).toEqual([]);
  });

  it("drops a disabled skill from the one-request queue", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Notes", description: "Desc.", instructions: "Body." });
    useSkillsStore.getState().setPendingTurnSkills("chat-a", [created.id]);
    useSkillsStore.getState().setSkillEnabled(created.id, false);
    expect(useSkillsStore.getState().pendingTurnSkillIds["chat-a"]).toEqual([]);
    // The library entry stays so it can be re-enabled.
    expect(useSkillsStore.getState().skills[0].enabled).toBe(false);
  });

  it("promotes a one-request skill to the whole chat without duplicating it", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Notes", description: "Desc.", instructions: "Body." });
    useSkillsStore.getState().setPendingTurnSkills("chat-a", [created.id]);
    useSkillsStore.getState().addChatSkill("chat-a", created.id);
    expect(useSkillsStore.getState().chatSkillIds["chat-a"]).toEqual([created.id]);
    expect(useSkillsStore.getState().pendingTurnSkillIds["chat-a"]).toEqual([]);
  });

  it("never applies a disabled skill, even when it is pinned", async () => {
    const created = await useSkillsStore.getState().createSkill({ name: "Notes", description: "Desc.", instructions: "Body." });
    useSkillsStore.getState().addChatSkill("chat-a", created.id);
    useSkillsStore.getState().setSkillEnabled(created.id, false);
    const invocations = invocationsFor(useSkillsStore.getState().skills, useSkillsStore.getState().chatSkillIds["chat-a"], []);
    expect(invocations).toEqual([]);
  });

  it("keeps a chat's Skill across turns while the one-request pick clears", async () => {
    const pinned = await useSkillsStore.getState().createSkill({ name: "Pinned", description: "A", instructions: "Body A." });
    const once = await useSkillsStore.getState().createSkill({ name: "Once", description: "B", instructions: "Body B." });
    useSkillsStore.getState().addChatSkill("chat-a", pinned.id);
    useSkillsStore.getState().setPendingTurnSkills("chat-a", [once.id]);

    const first = invocationsFor(useSkillsStore.getState().skills, useSkillsStore.getState().chatSkillIds["chat-a"], useSkillsStore.getState().pendingTurnSkillIds["chat-a"]);
    expect(first.map((item) => [item.id, item.scope])).toEqual([[pinned.id, "chat"], [once.id, "turn"]]);

    useSkillsStore.getState().clearPendingTurnSkills("chat-a");
    const second = invocationsFor(useSkillsStore.getState().skills, useSkillsStore.getState().chatSkillIds["chat-a"], useSkillsStore.getState().pendingTurnSkillIds["chat-a"]);
    expect(second.map((item) => item.id)).toEqual([pinned.id]);
  });

  it("imports a portable SKILL.md including supporting files", async () => {
    const record = await useSkillsStore.getState().importSkill({
      skillMd: "---\nname: pdf-tools\ndescription: Extract text from PDFs.\n---\n\n# PDF tools\n\nRead the reference.",
      files: ["SKILL.md", "references/formats.md"],
      snapshotId: "skill-abc",
    });
    expect(record.name).toBe("pdf-tools");
    expect(record.slug).toBe("pdf-tools");
    expect(record.instructions).toBe("# PDF tools\n\nRead the reference.");
    expect(record.files).toEqual(["SKILL.md", "references/formats.md"]);
    expect(record.snapshotId).toBe("skill-abc");
  });

  it("falls back to the folder name when frontmatter omits one", async () => {
    const record = await useSkillsStore.getState().importSkill({
      skillMd: "---\ndescription: Does a thing.\n---\n\nBody.",
      fallbackName: "pdf-tools",
    });
    expect(record.name).toBe("pdf-tools");
  });

  it("rejects an import without a description so routing stays possible", async () => {
    await expect(useSkillsStore.getState().importSkill({ skillMd: "---\nname: x\n---\n\nBody.", fallbackName: "x" }))
      .rejects.toThrow(/description/);
  });

  it("rejects a duplicate name on import rather than silently renaming", async () => {
    await useSkillsStore.getState().importSkill({ skillMd: "---\nname: pdf-tools\ndescription: First.\n---\n\nBody." });
    await expect(useSkillsStore.getState().importSkill({ skillMd: "---\nname: pdf-tools\ndescription: Second.\n---\n\nBody." }))
      .rejects.toThrow(/already exists/);
  });

  it("converts a legacy workflow into a standalone skill", async () => {
    useSkillsStore.setState({
      skills: [{
        id: "skill.legacy", type: "skill", name: "Legacy", slug: "legacy", description: "Old.",
        instructions: "Base.", version: "1.0.0", enabled: true, provenance: "local",
        installedAt: "", updatedAt: "", health: "ready", contentHash: "hash",
        legacyWorkflows: [{ id: "brief", name: "Brief", instructions: "Three bullets." }],
      }],
    });
    const converted = await useSkillsStore.getState().convertWorkflow("skill.legacy", "brief");
    expect(converted?.name).toBe("Legacy · Brief");
    expect(converted?.instructions).toContain("Three bullets.");
    // The source keeps its base instructions and loses the converted workflow.
    const source = useSkillsStore.getState().skills.find((skill) => skill.id === "skill.legacy");
    expect(source?.legacyWorkflows).toEqual([]);
    expect(source?.instructions).toBe("Base.");
  });

  it("imports parked legacy skills exactly once", () => {
    values.set("veyra.skills.legacy.v1", JSON.stringify({ state: {
      skills: [{ id: "skill.old", name: "Old Skill", description: "From before.", instructions: "Legacy body.", enabled: true }],
      activeSkillIds: { "chat-a": "skill.old" },
    } }));
    useSkillsStore.setState({ skills: [], chatSkillIds: {} });
    importLegacySkillsOnce();
    expect(useSkillsStore.getState().skills).toHaveLength(1);
    expect(useSkillsStore.getState().chatSkillIds["chat-a"]).toEqual(["skill.old"]);

    // A second run must not duplicate or overwrite later edits.
    useSkillsStore.setState({ skills: [] });
    importLegacySkillsOnce();
    expect(useSkillsStore.getState().skills).toHaveLength(0);
  });

  it("does not overwrite a selection made after the upgrade", () => {
    values.set("veyra.skills.legacy.v1", JSON.stringify({ state: {
      skills: [{ id: "skill.old", name: "Old", description: "D", instructions: "Body.", enabled: true }],
      activeSkillIds: { "chat-a": "skill.old" },
    } }));
    useSkillsStore.setState({ skills: [], chatSkillIds: { "chat-a": [] } });
    importLegacySkillsOnce();
    expect(useSkillsStore.getState().chatSkillIds["chat-a"]).toEqual([]);
  });
});

describe("who may use a skill", () => {
  beforeEach(reset);

  it("starts manual-only: the model cannot load a Skill nobody configured", () => {
    expect(useSkillsStore.getState().modelInvocationDefault).toBe(false);
    const skill = record();
    expect(isModelInvocable(skill, false)).toBe(false);
    expect(modelInvocableSkills([skill], false)).toEqual([]);
  });

  it("offers every Skill when the user allows model choice", () => {
    const skill = record();
    expect(modelInvocableSkills([skill], true)).toEqual([skill]);
    expect(manualOnlySkills([skill], true)).toEqual([]);
  });

  it("lets one Skill opt in while the default stays manual", () => {
    const opted = record({ modelInvocable: true });
    const plain = record({ id: "b", name: "Plain", slug: "plain" });
    expect(modelInvocableSkills([opted, plain], false)).toEqual([opted]);
    expect(manualOnlySkills([opted, plain], false)).toEqual([plain]);
  });

  it("lets one Skill opt out while the default allows the model", () => {
    const opted = record({ modelInvocable: false });
    const plain = record({ id: "b", name: "Plain", slug: "plain" });
    expect(modelInvocableSkills([opted, plain], true)).toEqual([plain]);
    expect(manualOnlySkills([opted, plain], true)).toEqual([opted]);
  });

  it("never offers a disabled Skill even when it opted in", () => {
    const disabled = record({ enabled: false, modelInvocable: true });
    expect(modelInvocableSkills([disabled], true)).toEqual([]);
    expect(manualOnlySkills([disabled], true)).toEqual([]);
  });

  it("still lets the user apply a manual-only Skill", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "Manual", description: "D", instructions: "Body." });
    useSkillsStore.getState().setSkillModelInvocable(skill.id, false);
    useSkillsStore.getState().setPendingTurnSkills("chat-a", [skill.id]);
    // The picker does not filter on model access; only the tool catalogue does.
    const invocations = invocationsFor(useSkillsStore.getState().skills, [], useSkillsStore.getState().pendingTurnSkillIds["chat-a"]);
    expect(invocations.map((item) => item.id)).toEqual([skill.id]);
  });

  it("stores an explicit override and clears it on reset", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "Notes", description: "D", instructions: "Body." });
    useSkillsStore.getState().setSkillModelInvocable(skill.id, true);
    expect(useSkillsStore.getState().skills[0].modelInvocable).toBe(true);
    useSkillsStore.getState().setSkillModelInvocable(skill.id, false);
    expect(useSkillsStore.getState().skills[0].modelInvocable).toBe(false);
    useSkillsStore.getState().setSkillModelInvocable(skill.id, undefined);
    expect(useSkillsStore.getState().skills[0].modelInvocable).toBeUndefined();
  });

  it("keeps the override when an unrelated edit saves", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "Notes", description: "D", instructions: "Body." });
    useSkillsStore.getState().setSkillModelInvocable(skill.id, true);
    const updated = await useSkillsStore.getState().updateSkill(skill.id, { instructions: "New body." });
    expect(updated.modelInvocable).toBe(true);
  });

  it("carries the override onto a duplicate", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "Notes", description: "D", instructions: "Body." });
    useSkillsStore.getState().setSkillModelInvocable(skill.id, true);
    const copy = await useSkillsStore.getState().duplicateSkill(skill.id);
    expect(copy?.modelInvocable).toBe(true);
  });

  it("flips the library default", () => {
    useSkillsStore.getState().setModelInvocationDefault(true);
    expect(useSkillsStore.getState().modelInvocationDefault).toBe(true);
    useSkillsStore.getState().setModelInvocationDefault(false);
    expect(useSkillsStore.getState().modelInvocationDefault).toBe(false);
  });
});
