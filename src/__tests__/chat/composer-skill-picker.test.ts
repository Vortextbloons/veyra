import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { useSkillsStore } = await import("@/modules/extensions/skills-store");

/**
 * The composer's picker behaviour, exercised through the same store operations
 * it calls. Keeping this at the store level avoids mounting the whole chat while
 * still covering text preservation and one-request versus persistent use.
 */
function selectSkill(chatId: string, skillId: string, draft: string): string {
  const state = useSkillsStore.getState();
  const pending = state.pendingTurnSkillIds[chatId] ?? [];
  if (!pending.includes(skillId)) state.setPendingTurnSkills(chatId, [...pending, skillId]);
  // Only the `/query` token is removed so the draft survives.
  return draft.replace(/^\/[^\s]*/, "").trimStart();
}

beforeEach(() => {
  values.clear();
  useSkillsStore.setState({ skills: [], chatSkillIds: {}, pendingTurnSkillIds: {}, skillsEnabled: true });
});

describe("composer skill selection", () => {
  it("keeps the text already typed when a skill is selected", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    const draft = "/pdf Summarize this contract for me";
    const remaining = selectSkill("new-chat", skill.id, draft);
    expect(remaining).toBe("Summarize this contract for me");
    expect(useSkillsStore.getState().pendingTurnSkillIds["new-chat"]).toEqual([skill.id]);
  });

  it("leaves unrelated text untouched when the picker was not open", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    const draft = "Compare these two invoices";
    expect(selectSkill("new-chat", skill.id, draft)).toBe(draft);
  });

  it("keeps an empty draft empty instead of inserting anything", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    expect(selectSkill("new-chat", skill.id, "/")).toBe("");
  });

  it("selects the same skill only once", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    selectSkill("new-chat", skill.id, "/pdf one");
    selectSkill("new-chat", skill.id, "/pdf two");
    expect(useSkillsStore.getState().pendingTurnSkillIds["new-chat"]).toEqual([skill.id]);
  });

  it("does not persist a one-request selection as a chat selection", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    selectSkill("new-chat", skill.id, "/pdf Summarize");
    expect(useSkillsStore.getState().chatSkillIds["new-chat"]).toBeUndefined();
  });

  it("clears the one-request selection when it is removed", async () => {
    const skill = await useSkillsStore.getState().createSkill({ name: "PDF tools", description: "Extract.", instructions: "Read." });
    selectSkill("new-chat", skill.id, "/pdf Summarize");
    useSkillsStore.getState().setPendingTurnSkills("new-chat", []);
    expect(useSkillsStore.getState().pendingTurnSkillIds["new-chat"]).toEqual([]);
  });
});
