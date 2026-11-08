import type { SkillInvocation, SkillRecord } from "./extension-types";
import { composeSkillDocument, sha256Hex } from "./skill-runtime";

/** Where a legacy payload is parked once the MCP store rewrites its key. */
export const LEGACY_SKILLS_KEY = "veyra.skills.legacy.v1";

type LegacyState = {
  skills?: unknown;
  activeSkillIds?: unknown;
  invocationsByMessage?: unknown;
};

export type MigratedSkills = {
  skills: SkillRecord[];
  chatSkillIds: Record<string, string[]>;
  invocationsByMessage: Record<string, SkillInvocation[]>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeLegacySkill(raw: Record<string, unknown>): SkillRecord | undefined {
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "";
  if (!name) return undefined;
  const description = typeof raw.description === "string" ? raw.description : "";
  const instructions = typeof raw.instructions === "string" ? raw.instructions : "";
  const slug = typeof raw.slug === "string" && raw.slug
    ? raw.slug
    : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
  const enabled = raw.enabled !== false;
  const now = new Date().toISOString();
  const legacyWorkflows = Array.isArray(raw.workflows)
    ? (raw.workflows as unknown[]).flatMap((item) => {
      const workflow = asRecord(item);
      return workflow && typeof workflow.id === "string" && typeof workflow.name === "string"
        ? [{ id: workflow.id, name: workflow.name, instructions: typeof workflow.instructions === "string" ? workflow.instructions : "" }]
        : [];
    })
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `skill.${slug}.${crypto.randomUUID().slice(0, 8)}`,
    type: "skill",
    name,
    slug,
    description,
    instructions,
    // Legacy manifests carried a version; the library derives it from content now.
    version: "1.0.0",
    enabled,
    provenance: raw.provenance === "generated" || raw.provenance === "manual" ? raw.provenance : "local",
    installedAt: typeof raw.installedAt === "string" ? raw.installedAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    health: enabled ? "ready" : "disabled",
    contentHash: typeof raw.contentHash === "string" && raw.contentHash
      ? raw.contentHash
      : sha256Hex(composeSkillDocument({ slug, description, instructions })),
    files: Array.isArray(raw.files) ? raw.files.filter((item): item is string => typeof item === "string") : undefined,
    snapshotId: typeof raw.snapshotId === "string" ? raw.snapshotId : undefined,
    metadata: asRecord(raw.metadata) as Record<string, string> | undefined,
    legacyWorkflows: legacyWorkflows.length ? legacyWorkflows : undefined,
    legacyCapabilities: Array.isArray(raw.requestedCapabilities)
      ? raw.requestedCapabilities.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

/**
 * Converts the pre-library skill shape.
 *
 * Old chats stored a single `activeSkillIds[chatId]`. Those become explicit
 * chat-scoped Skills, which is the new model's equivalent of "this chat uses
 * this skill". A workflow selection is preserved as its parent Skill; the
 * workflow itself stays available for conversion into a standalone Skill.
 */
export function migrateLegacySkills(state: LegacyState | undefined): MigratedSkills {
  const rawSkills = Array.isArray(state?.skills) ? state.skills : [];
  const skills = rawSkills.flatMap((item) => {
    const record = asRecord(item);
    const migrated = record ? normalizeLegacySkill(record) : undefined;
    return migrated ? [migrated] : [];
  });
  const live = new Set(skills.map((skill) => skill.id));
  const chatSkillIds: Record<string, string[]> = {};
  const activeSkillIds = asRecord(state?.activeSkillIds);
  for (const [chatId, skillId] of Object.entries(activeSkillIds ?? {})) {
    if (typeof skillId === "string" && live.has(skillId)) chatSkillIds[chatId] = [skillId];
  }
  const invocationsByMessage: Record<string, SkillInvocation[]> = {};
  const storedInvocations = asRecord(state?.invocationsByMessage);
  for (const [messageId, value] of Object.entries(storedInvocations ?? {})) {
    if (Array.isArray(value) && value.length) invocationsByMessage[messageId] = value as SkillInvocation[];
  }
  return { skills, chatSkillIds, invocationsByMessage };
}

/** Reads the parked payload first, then the original store key if it is still legacy. */
export function readLegacySkillsPayload(): LegacyState | undefined {
  for (const key of [LEGACY_SKILLS_KEY, "veyra.extensions.v1"]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> } | Record<string, unknown>;
      const state = asRecord((parsed as { state?: unknown })?.state) ?? asRecord(parsed);
      if (state && Array.isArray(state.skills) && state.skills.length > 0) return state as LegacyState;
    } catch {
      // A corrupt payload is not worth blocking startup over.
    }
  }
  return undefined;
}

/** Parks the legacy payload so the MCP store can rewrite its own key safely. */
export function stashLegacySkills(state: Record<string, unknown>): void {
  const hasSkills = Array.isArray(state.skills) && state.skills.length > 0;
  const hasSelections = asRecord(state.activeSkillIds) && Object.keys(state.activeSkillIds as object).length > 0;
  if (!hasSkills && !hasSelections) return;
  try {
    localStorage.setItem(LEGACY_SKILLS_KEY, JSON.stringify({ state: {
      skills: state.skills ?? [],
      activeSkillIds: state.activeSkillIds ?? {},
      invocationsByMessage: state.invocationsByMessage ?? {},
    } }));
  } catch {
    // Storage failures only affect migration, never the live library.
  }
}
