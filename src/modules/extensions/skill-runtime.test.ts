import { describe, expect, it } from "vitest";
import type { SkillRecord } from "./extension-types";
import {
  buildSkillInvocation,
  buildSkillPromptBlock,
  composeSkillDocument,
  createSkillRecord,
  duplicateSkillName,
  parseSkillDocument,
  resolveSkillInvocations,
  sha256Hex,
  slugifySkillName,
  updateSkillRecord,
  validateSkillDraft,
  workflowToSkillDraft,
} from "./skill-runtime";

const PORTABLE = `---
name: pdf-tools
description: Extract text and tables from PDF files. Use when reading or converting PDFs.
---

# PDF tools

Read references/formats.md before converting.`;

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: "skill.pdf-tools.abcd1234",
    type: "skill",
    name: "PDF tools",
    slug: "pdf-tools",
    description: "Extract text from PDFs.",
    instructions: "# PDF tools\n\nRead the reference first.",
    version: "1.0.0",
    enabled: true,
    provenance: "local",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    health: "ready",
    contentHash: sha256Hex("# PDF tools"),
    ...overrides,
  } as SkillRecord;
}

describe("portable SKILL.md format", () => {
  it("reads name and description from frontmatter and keeps the body", () => {
    expect(parseSkillDocument(PORTABLE)).toEqual({
      name: "pdf-tools",
      description: "Extract text and tables from PDF files. Use when reading or converting PDFs.",
      instructions: "# PDF tools\n\nRead references/formats.md before converting.",
      metadata: {},
    });
  });

  it("treats a document without frontmatter as instructions", () => {
    const parsed = parseSkillDocument("# Release notes\n\nBe brief.");
    expect(parsed.name).toBeUndefined();
    expect(parsed.description).toBeUndefined();
    expect(parsed.instructions).toBe("# Release notes\n\nBe brief.");
  });

  it("preserves unknown frontmatter keys across a round trip", () => {
    const document = composeSkillDocument({
      slug: "pdf-tools",
      description: "Extract text.",
      instructions: "Body.",
      metadata: { license: "MIT", compatibility: "node" },
    });
    const parsed = parseSkillDocument(document);
    expect(parsed.metadata).toEqual({ license: "MIT", compatibility: "node" });
    expect(parsed.instructions).toBe("Body.");
  });

  it("collapses a multi-line description so the frontmatter stays valid", () => {
    const document = composeSkillDocument({ slug: "a", description: "First line.\nSecond line.", instructions: "Body." });
    expect(document).toContain("description: First line. Second line.");
    expect(parseSkillDocument(document).description).toBe("First line. Second line.");
  });
});

describe("skill validation", () => {
  it("requires a name, a description, and instructions", () => {
    const validation = validateSkillDraft({ name: "  ", description: "", instructions: " " });
    expect(validation.valid).toBe(false);
    expect(validation.errors).toHaveLength(3);
  });

  it("caps the description at the spec limit", () => {
    const validation = validateSkillDraft({ name: "A", description: "x".repeat(1025), instructions: "Body." });
    expect(validation.errors.some((error) => error.includes("1024"))).toBe(true);
  });

  it("rejects executable activation hooks", () => {
    const validation = validateSkillDraft({ name: "A", description: "B", instructions: "onInstall: rm -rf /" });
    expect(validation.valid).toBe(false);
  });

  it("warns about code blocks without rejecting them", () => {
    const validation = validateSkillDraft({ name: "A", description: "B", instructions: "```bash\nls\n```" });
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toHaveLength(1);
  });
});

describe("skill names", () => {
  it("normalizes to the spec slug shape", () => {
    expect(slugifySkillName("PDF Tools!")).toBe("pdf-tools");
    expect(slugifySkillName("  Release -- Notes  ")).toBe("release-notes");
    expect(slugifySkillName("123")).toBe("123");
  });

  it("suggests a distinct copy name", () => {
    const existing = [record({ name: "PDF tools" }), record({ id: "b", name: "PDF tools copy" })];
    expect(duplicateSkillName("PDF tools", existing)).toBe("PDF tools copy 3");
  });
});

describe("skill library records", () => {
  it("derives id, slug, and content hash from the draft", async () => {
    const skill = await createSkillRecord({ name: "Release Notes", description: "Write notes.", instructions: "Be brief." });
    expect(skill.slug).toBe("release-notes");
    expect(skill.id.startsWith("skill.release-notes.")).toBe(true);
    expect(skill.contentHash).toHaveLength(64);
    expect(skill.enabled).toBe(true);
  });

  it("rejects a duplicate name so the picker stays unambiguous", async () => {
    await expect(createSkillRecord({ name: "PDF tools", description: "B", instructions: "C" }, [record()]))
      .rejects.toThrow(/already exists/);
  });

  it("keeps the same id when an edit changes the content", async () => {
    const original = record({ name: "PDF tools", description: "Old.", instructions: "Old body." });
    const updated = await updateSkillRecord(original, { description: "New.", instructions: "New body." }, [original]);
    expect(updated.id).toBe(original.id);
    expect(updated.contentHash).not.toBe(original.contentHash);
    expect(updated.instructions).toBe("New body.");
  });

  it("allows an edit that keeps the same name on the same skill", async () => {
    const original = record();
    await expect(updateSkillRecord(original, { description: "Changed." }, [original])).resolves.toMatchObject({ id: original.id });
  });

  it("rejects an edit that would steal another skill's name", async () => {
    const first = record({ id: "a", name: "Alpha" });
    const second = record({ id: "b", name: "Beta" });
    await expect(updateSkillRecord(second, { name: "Alpha" }, [first, second])).rejects.toThrow(/already exists/);
  });
});

describe("request invocations", () => {
  it("records a one-message skill as turn-scoped and a pinned skill as chat-scoped", () => {
    const turn = record({ id: "turn", name: "One shot" });
    const pinned = record({ id: "pinned", name: "Always" });
    const invocations = resolveSkillInvocations({
      skills: [turn, pinned], skillsEnabled: true, chatSkillIds: ["pinned"], turnSkillIds: ["turn"],
    });
    expect(invocations.map((item) => [item.id, item.scope])).toEqual([["pinned", "chat"], ["turn", "turn"]]);
  });

  it("does not double-apply a skill that is both pinned and selected", () => {
    const skill = record({ id: "one" });
    const invocations = resolveSkillInvocations({ skills: [skill], skillsEnabled: true, chatSkillIds: ["one"], turnSkillIds: ["one"] });
    expect(invocations).toHaveLength(1);
    expect(invocations[0].scope).toBe("chat");
  });

  it("skips disabled skills and everything when the feature is off", () => {
    const disabled = record({ id: "off", enabled: false });
    expect(resolveSkillInvocations({ skills: [disabled], skillsEnabled: true, chatSkillIds: ["off"] })).toEqual([]);
    expect(resolveSkillInvocations({ skills: [record()], skillsEnabled: false, chatSkillIds: [record().id] })).toEqual([]);
  });

  it("snapshots instructions so a later edit cannot change the record", async () => {
    const original = record({ instructions: "Original steps." });
    const invocation = buildSkillInvocation(original, "turn");
    const edited = await updateSkillRecord(original, { instructions: "Rewritten steps." }, [original]);
    expect(invocation.instructions).toBe("Original steps.");
    expect(invocation.contentHash).toBe(original.contentHash);
    expect(edited.instructions).toBe("Rewritten steps.");
  });

  it("builds one prompt block per invocation with its scope", () => {
    const block = buildSkillPromptBlock([
      buildSkillInvocation(record({ slug: "pdf-tools", instructions: "Read the reference." }), "chat"),
    ]);
    expect(block).toContain('<skill name="pdf-tools" scope="chat">');
    expect(block).toContain("Read the reference.");
    expect(buildSkillPromptBlock([])).toBe("");
  });
});

describe("legacy workflow conversion", () => {
  it("turns one workflow into a standalone skill draft", () => {
    const source = record({
      legacyWorkflows: [{ id: "brief", name: "Brief", instructions: "Use three bullets." }],
    });
    const draft = workflowToSkillDraft(source, "brief");
    expect(draft?.name).toBe("PDF tools · Brief");
    expect(draft?.instructions).toContain("Use three bullets.");
  });

  it("returns nothing for an unknown workflow", () => {
    expect(workflowToSkillDraft(record(), "missing")).toBeUndefined();
  });
});

describe("content hashing", () => {
  it("matches the known SHA-256 of an empty string and a sample", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("a".repeat(1000))).toHaveLength(64);
  });
});
