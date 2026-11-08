import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillRecord } from "@/modules/extensions/extension-types";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  return { stop: vi.fn(), run: vi.fn(), steer: vi.fn(), invoke: vi.fn() };
});

vi.mock("@/modules/agents/pi-runtime", () => ({
  checkPiAvailable: vi.fn(),
  runPiAgent: mocks.run,
  stopPiAgent: mocks.stop,
  steerPiAgent: mocks.steer,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

const { useAgentStore } = await import("@/modules/agents/agent-store");
const { useSkillsStore } = await import("@/modules/extensions/skills-store");

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: "skill.pdf-tools.abcd1234",
    type: "skill",
    name: "PDF tools",
    slug: "pdf-tools",
    description: "Extract text from PDFs.",
    instructions: "Read the reference first.",
    version: "1.0.0",
    enabled: true,
    provenance: "local",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    health: "ready",
    contentHash: "hash-v1",
    ...overrides,
  } as SkillRecord;
}

describe("skills on a request", () => {
  beforeEach(() => {
    mocks.run.mockReset();
    mocks.run.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue([{ path: "/skills/pdf-tools", name: "pdf-tools" }]);
    useSkillsStore.setState({ skills: [], chatSkillIds: {}, pendingTurnSkillIds: {}, skillsEnabled: true });
    useAgentStore.setState({ sessions: [], activeSessionId: null, projectPath: "", projects: [] });
  });

  it("materializes a one-request skill for exactly that request", async () => {
    useSkillsStore.setState({ skills: [skill()], pendingTurnSkillIds: { "new-chat": ["skill.pdf-tools.abcd1234"] } });
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Read report.pdf" });

    expect(mocks.invoke).toHaveBeenCalledWith("materialize_pi_skills", {
      skills: [expect.objectContaining({ slug: "pdf-tools", instructions: "Read the reference first." })],
    });
    expect(mocks.run.mock.calls[0][0].skillPaths).toEqual(["/skills/pdf-tools"]);

    const session = useAgentStore.getState().sessions.find((item) => item.id === id);
    const prompt = session?.events.find((event) => event.title === "Prompt");
    expect(prompt?.skillInvocations).toEqual([expect.objectContaining({ id: skill().id, scope: "turn", contentHash: "hash-v1" })]);

    // The one-request pick is consumed, so the next message does not inherit it.
    expect(useSkillsStore.getState().pendingTurnSkillIds["new-chat"]).toEqual([]);
  });

  it("does not apply a skill to the next request after one-request use", async () => {
    useSkillsStore.setState({ skills: [skill()], pendingTurnSkillIds: { "new-chat": ["skill.pdf-tools.abcd1234"] } });
    await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "First" });
    mocks.invoke.mockClear();
    await useAgentStore.getState().startSession({ continueSessionId: useAgentStore.getState().activeSessionId, projectPath: "", model: "test", prompt: "Second" });
    expect(mocks.invoke).not.toHaveBeenCalledWith("materialize_pi_skills", expect.anything());
  });

  it("keeps a chat-scoped skill on every message", async () => {
    useSkillsStore.setState({ skills: [skill()] });
    const first = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "First" });
    // The chat now has a real id, which is what the composer pins against.
    useSkillsStore.getState().addChatSkill(first, skill().id);
    await useAgentStore.getState().startSession({ continueSessionId: first, projectPath: "", model: "test", prompt: "Second" });
    const session = useAgentStore.getState().sessions.find((item) => item.id === first);
    const prompts = session?.events.filter((event) => event.title === "Prompt") ?? [];
    expect(prompts).toHaveLength(2);
    // The first message had no Skill; the pinned one applies from then on.
    expect(prompts[0].skillInvocations).toBeUndefined();
    expect(prompts[1].skillInvocations?.[0]).toMatchObject({ scope: "chat" });
  });

  it("carries a pin from a brand-new chat into the session it creates", async () => {
    useSkillsStore.setState({ skills: [skill()] });
    useSkillsStore.getState().addChatSkill("new-chat", skill().id);
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "First" });
    expect(useSkillsStore.getState().chatSkillIds[id]).toEqual([skill().id]);
    await useAgentStore.getState().startSession({ continueSessionId: id, projectPath: "", model: "test", prompt: "Second" });
    const prompts = useAgentStore.getState().sessions.find((item) => item.id === id)?.events.filter((event) => event.title === "Prompt") ?? [];
    expect(prompts[1].skillInvocations?.[0]).toMatchObject({ scope: "chat" });
  });

  it("records nothing when the Skills feature is off", async () => {
    useSkillsStore.setState({ skills: [skill()], skillsEnabled: false, pendingTurnSkillIds: { "new-chat": [skill().id] } });
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Hello" });
    expect(mocks.invoke).not.toHaveBeenCalledWith("materialize_pi_skills", expect.anything());
    const session = useAgentStore.getState().sessions.find((item) => item.id === id);
    expect(session?.events.find((event) => event.title === "Prompt")?.skillInvocations).toBeUndefined();
  });

  it("sends the recorded instructions with the request", async () => {
    useSkillsStore.setState({ skills: [skill()], pendingTurnSkillIds: { "new-chat": [skill().id] } });
    await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Read report.pdf" });
    const sent = mocks.run.mock.calls[0][0].prompt as string;
    expect(sent).toContain('<skill name="pdf-tools" scope="turn">');
    expect(sent).toContain("Read the reference first.");
    expect(sent).toContain("Read report.pdf");
    // The materialized directory is named so relative files can be resolved.
    expect(sent).toContain("Files for this Skill are in /skills/pdf-tools");
  });

  it("sends no skill block when the Skills feature is off", async () => {
    useSkillsStore.setState({ skills: [skill()], skillsEnabled: false, pendingTurnSkillIds: { "new-chat": [skill().id] } });
    await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Hello" });
    expect(mocks.run.mock.calls[0][0].prompt).not.toContain("<skill");
  });

  it("still runs the request when skill materialization fails", async () => {
    mocks.invoke.mockRejectedValue(new Error("disk full"));
    useSkillsStore.setState({ skills: [skill()], pendingTurnSkillIds: { "new-chat": [skill().id] } });
    await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Hello" });
    expect(mocks.run).toHaveBeenCalled();
    expect(mocks.run.mock.calls[0][0].skillPaths).toEqual([]);
  });

  it("replays the recorded instructions after the skill is edited", async () => {
    const original = skill();
    useSkillsStore.setState({ skills: [original], pendingTurnSkillIds: { "new-chat": [original.id] } });
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Read it" });
    const prompt = useAgentStore.getState().sessions.find((item) => item.id === id)?.events.find((event) => event.title === "Prompt");
    expect(prompt?.skillInvocations).toBeDefined();

    // Editing afterwards must not change what a replay runs.
    await useSkillsStore.getState().updateSkill(original.id, { instructions: "Rewritten instructions." });
    mocks.invoke.mockClear();
    await useAgentStore.getState().startSession({
      continueSessionId: id, projectPath: "", model: "test", prompt: "Read it",
      retrySkillInvocations: prompt?.skillInvocations,
    });

    expect(mocks.invoke).toHaveBeenCalledWith("materialize_pi_skills", {
      skills: [expect.objectContaining({ instructions: "Read the reference first.", slug: "pdf-tools" })],
    });
    expect(mocks.run.mock.calls[0][0].prompt).toContain("Read the reference first.");
    expect(mocks.run.mock.calls[0][0].prompt).not.toContain("Rewritten instructions.");
  });

  it("replays the recorded instructions after the skill is deleted", async () => {
    const original = skill();
    useSkillsStore.setState({ skills: [original], pendingTurnSkillIds: { "new-chat": [original.id] } });
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Read it" });
    const prompt = useAgentStore.getState().sessions.find((item) => item.id === id)?.events.find((event) => event.title === "Prompt");
    expect(prompt?.skillInvocations).toBeDefined();
    useSkillsStore.getState().removeSkill(original.id);

    mocks.invoke.mockClear();
    await useAgentStore.getState().startSession({
      continueSessionId: id, projectPath: "", model: "test", prompt: "Read it",
      retrySkillInvocations: prompt?.skillInvocations,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("materialize_pi_skills", {
      skills: [expect.objectContaining({ instructions: "Read the reference first." })],
    });
  });

  it("replays a request that had no skill without inventing one", async () => {
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Plain" });
    useSkillsStore.setState({ skills: [skill()] });
    mocks.invoke.mockClear();
    await useAgentStore.getState().startSession({
      continueSessionId: id, projectPath: "", model: "test", prompt: "Plain",
      retrySkillInvocations: [],
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith("materialize_pi_skills", expect.anything());
  });

  it("spends the one-request pick even when the run later fails", async () => {
    mocks.run.mockRejectedValueOnce(new Error("provider offline"));
    useSkillsStore.setState({ skills: [skill()], pendingTurnSkillIds: { "new-chat": [skill().id] } });
    await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Hello" });
    expect(useSkillsStore.getState().pendingTurnSkillIds["new-chat"]).toEqual([]);
  });

  it("rejects a retry for a request that is not in the session", async () => {
    const id = await useAgentStore.getState().startSession({ continueSessionId: null, projectPath: "", model: "test", prompt: "Plain" });
    const session = useAgentStore.getState().sessions.find((item) => item.id === id);
    expect(session?.events.some((event) => event.id === "missing")).toBe(false);
  });
});
