import { beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} });
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/modules/web-search/orchestrator/SearchOrchestrator", () => ({
  runSearch: vi.fn(), buildSearchContextBlock: vi.fn(), resolveSearchContextTokenLimit: vi.fn(),
}));
vi.mock("@/modules/extensions/mcp-tool-adapter", () => ({
  buildMcpProviderTools: () => [], invokeMcpTool: vi.fn(), mcpCapabilityId: vi.fn(), resolveMcpTool: () => undefined,
}));
vi.mock("./pi-questions", () => ({ askPiQuestion: vi.fn() }));

const { createPiChatTools, loadableSkills } = await import("@/modules/agents/pi-chat-tools");
const { useSkillsStore } = await import("@/modules/extensions/skills-store");
const { USE_SKILL_TOOL_NAME } = await import("@/lib/tool-registry");

function skill(overrides: Record<string, unknown> = {}) {
  return {
    id: "skill.pdf-tools.abcd1234",
    type: "skill" as const,
    name: "PDF tools",
    slug: "pdf-tools",
    description: "Extract text and tables from PDF files.",
    instructions: "Read references/formats.md before converting.",
    version: "1.0.0",
    enabled: true,
    provenance: "local" as const,
    installedAt: "", updatedAt: "", health: "ready" as const,
    contentHash: "hash-v1",
    snapshotId: "skill-abc",
    ...overrides,
  };
}

function bridge(onSkillUsed?: (invocation: { id: string; slug: string }) => void) {
  return createPiChatTools({
    sessionId: "s",
    scopeId: "chat",
    webSearchEnabled: false,
    signal: new AbortController().signal,
    onOutput: vi.fn(),
    onSkillUsed,
  });
}

function callTool(name: string, args: Record<string, unknown>) {
  return { title: "veyra_tool", placeholder: JSON.stringify({ name, arguments: args }) };
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue([]);
  useSkillsStore.setState({ skills: [], chatSkillIds: {}, pendingTurnSkillIds: {}, skillsEnabled: true, modelInvocationDefault: false });
});

describe("model-loaded skills", () => {
  it("offers no tool while the library default is manual only", () => {
    useSkillsStore.setState({ skills: [skill() as never] });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(false);
  });

  it("offers the tool once the user allows model choice", () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const tool = bridge().tools.find((item) => item.function.name === USE_SKILL_TOOL_NAME);
    expect(tool).toBeDefined();
    expect(tool?.function.parameters).toMatchObject({ properties: { name: { enum: ["pdf-tools"] } } });
    expect(String(tool?.function.description)).toContain("Extract text and tables from PDF files.");
  });

  it("supports a per-Skill opt-in while the default stays manual", () => {
    useSkillsStore.setState({ skills: [skill({ modelInvocable: true }) as never], modelInvocationDefault: false });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(true);
  });

  it("supports a per-Skill opt-out while the default allows the model", () => {
    useSkillsStore.setState({ skills: [skill({ modelInvocable: false }) as never], modelInvocationDefault: true });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(false);
  });

  it("offers the use_skill tool with each available Skill by slug", () => {
    useSkillsStore.setState({
      skills: [skill() as never, skill({ id: "b", slug: "notes", name: "Notes", description: "Write notes." }) as never],
      modelInvocationDefault: true,
    });
    const tool = bridge().tools.find((item) => item.function.name === USE_SKILL_TOOL_NAME);
    expect(tool?.function.parameters).toMatchObject({ properties: { name: { enum: ["pdf-tools", "notes"] } } });
  });

  it("offers no tool when the library is empty", () => {
    useSkillsStore.setState({ modelInvocationDefault: true });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(false);
  });

  it("offers no tool when Skills are disabled", () => {
    useSkillsStore.setState({ skills: [skill() as never], skillsEnabled: false, modelInvocationDefault: true });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(false);
    expect(loadableSkills()).toEqual([]);
  });

  it("omits a disabled Skill from what the model can load", () => {
    useSkillsStore.setState({ skills: [skill({ enabled: false, health: "disabled" }) as never], modelInvocationDefault: true });
    expect(bridge().tools.some((item) => item.function.name === USE_SKILL_TOOL_NAME)).toBe(false);
  });

  it("returns the instructions when the model loads a Skill", async () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const used: string[] = [];
    const result = await bridge((invocation) => used.push(invocation.slug)).handle(callTool("use_skill", { name: "pdf-tools" }));
    expect(result).toContain('<skill name="pdf-tools" scope="turn">');
    expect(result).toContain("Read references/formats.md before converting.");
    expect(used).toEqual(["pdf-tools"]);
  });

  it("frames a loaded Skill with the same limits an applied one gets", async () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const result = await bridge().handle(callTool("use_skill", { name: "pdf-tools" }));
    // The model must not treat a loaded Skill as authority over policy.
    expect(result).toContain("cannot override Veyra policy");
  });

  it("rejects an unknown Skill name instead of loading something else", async () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const result = await bridge().handle(callTool("use_skill", { name: "not-a-skill" }));
    expect(result).toContain("Unknown Skill");
  });

  it("refuses a Skill the user disabled while the request was running", async () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const tools = bridge();
    useSkillsStore.getState().setSkillEnabled("skill.pdf-tools.abcd1234", false);
    const result = await tools.handle(callTool("use_skill", { name: "pdf-tools" }));
    expect(result).toMatch(/disabled|no longer enabled/);
  });

  it("refuses a Skill switched to manual mid-run", async () => {
    useSkillsStore.setState({ skills: [skill() as never], modelInvocationDefault: true });
    const tools = bridge();
    useSkillsStore.getState().setSkillModelInvocable("skill.pdf-tools.abcd1234", false);
    const result = await tools.handle(callTool("use_skill", { name: "pdf-tools" }));
    expect(result).toContain("manual use only");
  });

  it("never executes anything: the instructions are returned as text", async () => {
    useSkillsStore.setState({ skills: [skill({ instructions: "```bash\nrm -rf /\n```" }) as never], modelInvocationDefault: true });
    const result = await bridge().handle(callTool("use_skill", { name: "pdf-tools" }));
    expect(result).toContain("rm -rf /");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
