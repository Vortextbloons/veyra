import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SkillDraft, SkillInvocation, SkillRecord } from "./extension-types";
import {
  buildSkillInvocation,
  createSkillRecord,
  duplicateSkillName,
  parseSkillDocument,
  updateSkillRecord,
  workflowToSkillDraft,
} from "./skill-runtime";
import { migrateLegacySkills, readLegacySkillsPayload } from "./skills-migration";

/**
 * The Skill library plus the two live selections:
 *
 * - `chatSkillIds` — persistent for the chat, shown as removable chips.
 * - `pendingTurnSkillIds` — applies to the next request only and is cleared as
 *   soon as that request is sent.
 *
 * What a past request actually used lives on that message's record (see
 * `SkillInvocation`), not here, so editing or deleting a Skill cannot rewrite
 * history and a retry can repeat the original instructions verbatim.
 */
type SkillsStore = {
  skills: SkillRecord[];
  chatSkillIds: Record<string, string[]>;
  pendingTurnSkillIds: Record<string, string[]>;
  skillsEnabled: boolean;
  /**
   * Library-wide default for whether the model may load Skills on its own.
   * A Skill's own `modelInvocable` overrides it either way.
   */
  modelInvocationDefault: boolean;
  createSkill: (draft: SkillDraft) => Promise<SkillRecord>;
  updateSkill: (id: string, patch: Partial<SkillDraft> & { enabled?: boolean; modelInvocable?: boolean }) => Promise<SkillRecord>;
  duplicateSkill: (id: string) => Promise<SkillRecord | undefined>;
  removeSkill: (id: string) => void;
  setSkillEnabled: (id: string, enabled: boolean) => void;
  /** `undefined` clears the override so the Skill follows the library default. */
  setSkillModelInvocable: (id: string, modelInvocable: boolean | undefined) => void;
  setModelInvocationDefault: (allow: boolean) => void;
  setChatSkills: (chatId: string, skillIds: string[]) => void;
  addChatSkill: (chatId: string, skillId: string) => void;
  removeChatSkill: (chatId: string, skillId: string) => void;
  setPendingTurnSkills: (chatId: string, skillIds: string[]) => void;
  clearPendingTurnSkills: (chatId: string) => void;
  clearChat: (chatId: string) => void;
  convertWorkflow: (skillId: string, workflowId: string) => Promise<SkillRecord | undefined>;
  importSkill: (input: { skillMd: string; files?: string[]; snapshotId?: string; provenance?: "local" | "generated"; fallbackName?: string }) => Promise<SkillRecord>;
  setFeatureFlag: (enabled: boolean) => void;
};

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Drops ids for skills that no longer exist so stale chips cannot linger. */
function pruneIds(skills: SkillRecord[], ids: string[]): string[] {
  const live = new Set(skills.map((skill) => skill.id));
  return uniqueIds(ids).filter((id) => live.has(id));
}

function withoutId(record: Record<string, string[]>, id: string): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record).map(([chatId, ids]) => [chatId, ids.filter((value) => value !== id)]));
}

/** Resolves the selections for one request into invocation records. */
export function invocationsFor(
  skills: SkillRecord[],
  chatSkillIds: string[],
  turnSkillIds: string[],
): SkillInvocation[] {
  const byId = new Map(skills.filter((skill) => skill.enabled).map((skill) => [skill.id, skill]));
  const invocations: SkillInvocation[] = [];
  for (const id of chatSkillIds) {
    const skill = byId.get(id);
    if (skill) invocations.push(buildSkillInvocation(skill, "chat"));
  }
  for (const id of turnSkillIds) {
    const skill = byId.get(id);
    if (skill && !invocations.some((item) => item.id === id)) invocations.push(buildSkillInvocation(skill, "turn"));
  }
  return invocations;
}

export const useSkillsStore = create<SkillsStore>()(persist((set, get) => ({
  skills: [],
  chatSkillIds: {},
  pendingTurnSkillIds: {},
  skillsEnabled: true,
  // Model invocation starts off: a Skill the user never asked for should not
  // start steering the chat because it happens to be installed.
  modelInvocationDefault: false,

  createSkill: async (draft) => {
    const record = await createSkillRecord(draft, get().skills);
    set((state) => ({ skills: [record, ...state.skills] }));
    return record;
  },

  updateSkill: async (id, patch) => {
    const current = get().skills.find((skill) => skill.id === id);
    if (!current) throw new Error("This Skill is no longer in the library.");
    const next = await updateSkillRecord(current, patch, get().skills);
    set((state) => ({
      skills: state.skills.map((skill) => (skill.id === id ? next : skill)),
      // A disabled Skill must not stay queued for the next request.
      pendingTurnSkillIds: next.enabled ? state.pendingTurnSkillIds : withoutId(state.pendingTurnSkillIds, id),
    }));
    return next;
  },

  duplicateSkill: async (id) => {
    const source = get().skills.find((skill) => skill.id === id);
    if (!source) return undefined;
    const record = await createSkillRecord({
      name: duplicateSkillName(source.name, get().skills),
      description: source.description,
      instructions: source.instructions,
      provenance: source.provenance === "manual" ? "local" : source.provenance,
      files: source.files,
      snapshotId: source.snapshotId,
      metadata: source.metadata,
    }, get().skills);
    // A copy inherits the model-access choice, since it is the same instructions.
    if (source.modelInvocable !== undefined) {
      set((state) => ({
        skills: state.skills.map((skill) => (skill.id === record.id ? { ...skill, modelInvocable: source.modelInvocable } : skill)),
      }));
      record.modelInvocable = source.modelInvocable;
    }
    set((state) => ({ skills: [record, ...state.skills] }));
    return record;
  },

  removeSkill: (id) => set((state) => ({
    skills: state.skills.filter((skill) => skill.id !== id),
    chatSkillIds: withoutId(state.chatSkillIds, id),
    pendingTurnSkillIds: withoutId(state.pendingTurnSkillIds, id),
  })),

  setSkillEnabled: (id, enabled) => set((state) => ({
    skills: state.skills.map((skill) => skill.id === id
      ? { ...skill, enabled, health: enabled ? "ready" : "disabled", updatedAt: new Date().toISOString() }
      : skill),
    pendingTurnSkillIds: enabled ? state.pendingTurnSkillIds : withoutId(state.pendingTurnSkillIds, id),
  })),

  setSkillModelInvocable: (id, modelInvocable) => set((state) => ({
    skills: state.skills.map((skill) => skill.id === id
      ? { ...skill, modelInvocable, updatedAt: new Date().toISOString() }
      : skill),
  })),

  setModelInvocationDefault: (allow) => set({ modelInvocationDefault: allow }),

  setChatSkills: (chatId, skillIds) => set((state) => ({
    chatSkillIds: { ...state.chatSkillIds, [chatId]: pruneIds(state.skills, skillIds) },
  })),

  addChatSkill: (chatId, skillId) => set((state) => ({
    chatSkillIds: { ...state.chatSkillIds, [chatId]: pruneIds(state.skills, [...(state.chatSkillIds[chatId] ?? []), skillId]) },
    // A chat-wide Skill is not also a one-request pick.
    pendingTurnSkillIds: { ...state.pendingTurnSkillIds, [chatId]: (state.pendingTurnSkillIds[chatId] ?? []).filter((id) => id !== skillId) },
  })),

  removeChatSkill: (chatId, skillId) => set((state) => ({
    chatSkillIds: { ...state.chatSkillIds, [chatId]: (state.chatSkillIds[chatId] ?? []).filter((id) => id !== skillId) },
  })),

  setPendingTurnSkills: (chatId, skillIds) => set((state) => ({
    pendingTurnSkillIds: { ...state.pendingTurnSkillIds, [chatId]: pruneIds(state.skills, skillIds) },
  })),

  clearPendingTurnSkills: (chatId) => set((state) => ({
    pendingTurnSkillIds: { ...state.pendingTurnSkillIds, [chatId]: [] },
  })),

  clearChat: (chatId) => set((state) => {
    const chatSkillIds = { ...state.chatSkillIds };
    const pendingTurnSkillIds = { ...state.pendingTurnSkillIds };
    delete chatSkillIds[chatId];
    delete pendingTurnSkillIds[chatId];
    return { chatSkillIds, pendingTurnSkillIds };
  }),

  convertWorkflow: async (skillId, workflowId) => {
    const source = get().skills.find((skill) => skill.id === skillId);
    if (!source) return undefined;
    const draft = workflowToSkillDraft(source, workflowId);
    if (!draft) return undefined;
    const record = await createSkillRecord(draft, get().skills);
    set((state) => ({
      skills: [
        record,
        ...state.skills.map((skill) => skill.id === skillId
          ? { ...skill, legacyWorkflows: skill.legacyWorkflows?.filter((workflow) => workflow.id !== workflowId), updatedAt: new Date().toISOString() }
          : skill),
      ],
    }));
    return record;
  },

  importSkill: async ({ skillMd, files, snapshotId, provenance = "local", fallbackName }) => {
    const parsed = parseSkillDocument(skillMd);
    const name = parsed.name?.trim() || fallbackName?.trim() || skillMd.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
    const description = parsed.description?.trim() || "";
    if (!name) throw new Error("SKILL.md needs a name in frontmatter or a named folder.");
    if (!description) throw new Error("SKILL.md needs a description in frontmatter so the AI knows when to use it.");
    if (!parsed.instructions.trim()) throw new Error("SKILL.md has no instructions after the frontmatter.");
    const record = await createSkillRecord({
      name,
      description,
      instructions: parsed.instructions,
      metadata: parsed.metadata,
      files,
      snapshotId,
      provenance,
    }, get().skills);
    set((state) => ({ skills: [record, ...state.skills] }));
    return record;
  },

  setFeatureFlag: (enabled) => set({ skillsEnabled: enabled }),
}), {
  name: "veyra.skills.v1",
  version: 2,
  migrate: (persisted, version) => migratePersistedSkills(persisted, version),
  partialize: (state) => ({
    skills: state.skills,
    chatSkillIds: state.chatSkillIds,
    // A one-request pick must not survive a reload.
    pendingTurnSkillIds: {},
    skillsEnabled: state.skillsEnabled,
    modelInvocationDefault: state.modelInvocationDefault,
  }),
}));

/** Applies the legacy conversion only when this key predates the library. */
function migratePersistedSkills(persisted: unknown, version: number) {
  const state = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {};
  if (version >= 2) {
    return {
      skills: Array.isArray(state.skills) ? state.skills as SkillRecord[] : [],
      chatSkillIds: (state.chatSkillIds && typeof state.chatSkillIds === "object" ? state.chatSkillIds : {}) as Record<string, string[]>,
      pendingTurnSkillIds: {},
      skillsEnabled: state.skillsEnabled !== false,
      modelInvocationDefault: state.modelInvocationDefault === true,
    };
  }
  const migrated = migrateLegacySkills(state);
  return {
    skills: migrated.skills,
    chatSkillIds: migrated.chatSkillIds,
    pendingTurnSkillIds: {},
    skillsEnabled: true,
    // Migrated Skills have never been offered to the model, so keep them manual.
    modelInvocationDefault: false,
  };
}

/** Copies a skill's editable fields into a draft for a new entry. */
export function skillToDraft(skill: SkillRecord, name = skill.name): SkillDraft {
  return { name, description: skill.description, instructions: skill.instructions, provenance: "local", metadata: skill.metadata };
}

const LEGACY_IMPORTED_KEY = "veyra.skills.legacy-imported.v1";

/**
 * Imports Skills parked by the MCP store migration.
 *
 * Zustand only calls `migrate` when its own key already exists, so a user who
 * upgrades from a build with no skills store would otherwise never see their
 * old Skills. This runs once, marks the import, and merges rather than
 * overwriting anything created since the upgrade.
 */
export function importLegacySkillsOnce(): void {
  try {
    if (localStorage.getItem(LEGACY_IMPORTED_KEY)) return;
    const legacy = readLegacySkillsPayload();
    if (!legacy) {
      localStorage.setItem(LEGACY_IMPORTED_KEY, "1");
      return;
    }
    const migrated = migrateLegacySkills(legacy);
    if (migrated.skills.length === 0 && Object.keys(migrated.chatSkillIds).length === 0) {
      localStorage.setItem(LEGACY_IMPORTED_KEY, "1");
      return;
    }
    useSkillsStore.setState((state) => {
      const known = new Set(state.skills.map((skill) => skill.id));
      return {
        skills: [...state.skills, ...migrated.skills.filter((skill) => !known.has(skill.id))],
        // Do not clobber a selection the user has already made in the new UI.
        chatSkillIds: { ...migrated.chatSkillIds, ...state.chatSkillIds },
      };
    });
    localStorage.setItem(LEGACY_IMPORTED_KEY, "1");
  } catch {
    // A failed import must not block startup; the library still works.
  }
}
