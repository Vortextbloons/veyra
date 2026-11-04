import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { delimiter, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { effectiveReasoningLevel, reasoningToggleState } from "@/modules/agents/agent-reasoning";
import type { AgentReasoningLevel } from "@/modules/agents/agent-types";

type Model = { provider: string; id: string; api: string; baseUrl: string; reasoning: boolean; levels: AgentReasoningLevel[]; thinkingLevelMap?: Record<string, string | null>; compat?: { supportsReasoningEffort?: boolean; thinkingFormat?: string } };
const helperUrl = pathToFileURL(join(process.cwd(), "src-tauri/src/agents/model-capabilities.mjs")).href;
const { resolveModelReasoning } = await import(helperUrl) as { resolveModelReasoning: (models: Model[], input: { providerId: string; modelId: string; baseUrl?: string; requested?: string }, ai: unknown) => { known: boolean; levels: string[]; effectiveLevel: string; provider: string; model: string; control: string } };
type RouteConfig = { providers: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id: string; reasoning: boolean; contextWindow: number; maxTokens: number; compat?: { thinkingFormat?: string } }> }> };
const { configureModelRoute } = await import(helperUrl) as { configureModelRoute: (config: unknown, input: { providerId: string; modelId: string; baseUrl?: string; contextLength?: string; maxTokens?: string }, models?: Model[]) => { config: RouteConfig; provider: string } };
const ai = { getSupportedThinkingLevels: (model: Model) => model.reasoning ? model.levels : ["off"], clampThinkingLevel: (model: Model, requested: AgentReasoningLevel) => effectiveReasoningLevel(requested, model.reasoning ? model.levels : ["off"]) };
function model(overrides: Partial<Model> = {}): Model { return { provider: "test", id: "org/model", api: "openai-completions", baseUrl: "https://example.invalid/v1", reasoning: true, levels: ["off", "low", "medium", "high"], ...overrides }; }

describe("Pi reasoning routing", () => {
  it("finds Pi after Cargo's bundled pi directory and stale PATH entries", async () => {
    const { locatePi } = await import(helperUrl);
    const fixture = mkdtempSync(join(tmpdir(), "veyra-pi-discovery-"));
    try {
      const bundled = join(fixture, "target", "debug");
      const stale = join(fixture, "stale");
      const npm = join(fixture, "npm");
      const sdk = join(npm, "node_modules", "@fixture", "pi-coding-agent");
      mkdirSync(join(bundled, "pi"), { recursive: true });
      mkdirSync(stale, { recursive: true });
      writeFileSync(join(stale, "pi.cmd"), "unrelated shim");
      mkdirSync(sdk, { recursive: true });
      writeFileSync(join(sdk, "package.json"), JSON.stringify({ name: "@fixture/pi-coding-agent" }));
      writeFileSync(join(npm, "pi.cmd"), 'node "%dp0%/node_modules/@fixture/pi-coding-agent/dist/cli.js"');
      expect(locatePi([bundled, stale, npm].join(delimiter), "win32")).toBe(sdk);
      expect(() => locatePi(bundled, "win32")).toThrow("Pi SDK not found");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("reads Windows BOM-prefixed Pi configuration without losing providers", async () => {
    const { parsePiJson } = await import(helperUrl);
    expect(parsePiJson('\uFEFF{"providers":{"custom":{"baseUrl":"https://example.invalid"}}}')).toEqual({ providers: { custom: { baseUrl: "https://example.invalid" } } });
    expect(parsePiJson('{"providers":{}}')).toEqual({ providers: {} });
    expect(() => parsePiJson('\uFEFFinvalid')).toThrow();
  });
  it("routes NVIDIA Nemotron through Pi's documented chat-template toggle", () => {
    const input = { providerId: "nvidia", modelId: "nvidia/nemotron-3.5-super-vl-120b-a12b", baseUrl: "https://integrate.api.nvidia.com/v1" };
    const template = model({ provider: "nvidia", id: input.modelId, compat: { supportsReasoningEffort: false } });
    const route = configureModelRoute({}, input, [template]);
    const entry = route.config.providers[route.provider];
    expect(entry.models?.[0].compat).toMatchObject({ supportsReasoningEffort: false, thinkingFormat: "qwen-chat-template" });
    const registered = model({ ...entry.models?.[0], provider: route.provider, baseUrl: entry.baseUrl });
    expect(resolveModelReasoning([registered], { ...input, requested: "high" }, ai)).toMatchObject({ known: true, control: "toggle", levels: ["off", "medium"], effectiveLevel: "medium" });
    expect(resolveModelReasoning([registered], { ...input, requested: "off" }, ai).effectiveLevel).toBe("off");
    const other = configureModelRoute({}, { ...input, baseUrl: "https://example.invalid/v1" }, [template]);
    expect(other.config.providers[other.provider].models?.[0].compat?.thinkingFormat).toBeUndefined();
  });
  it("keeps all explicit Pi effort levels instead of collapsing DeepSeek to a toggle", () => {
    const template = model({ levels: ["off", "high", "max"], thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" }, compat: { thinkingFormat: "deepseek", supportsReasoningEffort: false } });
    expect(resolveModelReasoning([template], { providerId: "test", modelId: template.id, requested: "max" }, ai)).toMatchObject({ levels: ["off", "high", "max"], effectiveLevel: "max", control: "effort" });
  });
  it("corrects MiniMax effort metadata on its isolated NVIDIA route and preserves token limits", () => {
    const input = { providerId: "nvidia", modelId: "minimaxai/minimax-m3.1-flash", baseUrl: "https://integrate.api.nvidia.com/v1", contextLength: "32768", maxTokens: "4096" };
    const template = model({ provider: "nvidia", id: input.modelId, compat: { supportsReasoningEffort: false } });
    const route = configureModelRoute({}, input, [template]);
    expect(route.config.providers[route.provider].models?.[0]).toMatchObject({ compat: { supportsReasoningEffort: true, thinkingFormat: "openai" }, thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" } });
    const { contextLength: _context, maxTokens: _tokens, ...lookup } = input;
    expect(configureModelRoute(route.config, lookup, [template]).config).toEqual(route.config);
  });
  it("inherits registry reasoning metadata for a custom endpoint and refreshes existing routes", () => {
    const input = { providerId: "custom", modelId: "org/model", baseUrl: "https://custom.invalid/v1" };
    const initial = configureModelRoute({}, input);
    const updated = configureModelRoute(initial.config, input, [model({ reasoning: false })]);
    expect(updated.config.providers[updated.provider].models?.[0].reasoning).toBe(false);
    expect(updated.config.providers[updated.provider].baseUrl).toBe(input.baseUrl);
  });
  it("automatically registers a missing model at the exact endpoint without changing user providers", () => {
    const existing = { providers: { custom: { baseUrl: "https://original.invalid/v1" } } };
    const input = { providerId: "custom", modelId: "org/model", baseUrl: "https://selected.invalid/v1/", contextLength: "32768", maxTokens: "4096" };
    expect(resolveModelReasoning([model()], input, ai).known).toBe(false);
    const route = configureModelRoute(existing, input);
    expect(route.config.providers.custom).toEqual(existing.providers.custom);
    expect(existing).toEqual({ providers: { custom: { baseUrl: "https://original.invalid/v1" } } });
    const entry = route.config.providers[route.provider];
    expect(entry).toMatchObject({ baseUrl: "https://selected.invalid/v1", apiKey: "$VEYRA_PI_API_KEY" });
    expect(entry.models).toMatchObject([{ id: "org/model", contextWindow: 32768, maxTokens: 4096 }]);
    const registered = model({ ...entry.models?.[0], provider: route.provider, baseUrl: entry.baseUrl });
    expect(resolveModelReasoning([registered], input, ai)).toMatchObject({ known: true, provider: route.provider, model: "org/model" });
    expect(configureModelRoute(route.config, input).config).toEqual(route.config);
    expect(configureModelRoute(route.config, { ...input, baseUrl: "https://different.invalid/v1" }).provider).not.toBe(route.provider);
  });
  it("configures local thinking with Pi's boolean chat template adapter and bounds token limits", () => {
    const route = configureModelRoute({}, { providerId: "lm-studio", modelId: "qwen/model", contextLength: "1024", maxTokens: "5000" });
    expect(route.config.providers[route.provider]).toMatchObject({ baseUrl: "http://localhost:1234/v1", apiKey: "lm-studio", models: [{ reasoning: true, maxTokens: 896, compat: { thinkingFormat: "qwen-chat-template" } }] });
  });
  it("refuses invalid configuration and never guesses a missing cloud endpoint", () => {
    expect(() => configureModelRoute([], { providerId: "custom", modelId: "m", baseUrl: "https://example.invalid" })).toThrow();
    expect(() => configureModelRoute({}, { providerId: "custom", modelId: "m" })).toThrow();
  });
  it("maps legacy effort preferences to a binary toggle while respecting mandatory reasoning", () => {
    expect(reasoningToggleState("high", ["off", "low", "medium", "high"])).toEqual({ enabled: true, canToggle: true });
    expect(reasoningToggleState("off", ["off", "medium"])).toEqual({ enabled: false, canToggle: true });
    expect(reasoningToggleState("off", ["high"])).toEqual({ enabled: true, canToggle: false });
    expect(reasoningToggleState("medium", ["off"])).toEqual({ enabled: false, canToggle: false });
  });
  it("preserves model namespaces and selects the exact provider endpoint", () => {
    const result = resolveModelReasoning([model(), model({provider: "other"})], {providerId: "test", modelId: "org/model", baseUrl: "https://example.invalid/v1/", requested: "high"}, ai);
    expect(result).toMatchObject({known: true, provider: "test", model: "org/model", effectiveLevel: "high"});
  });
  it("refuses ambiguous and mismatched routes instead of guessing by model name", () => {
    expect(resolveModelReasoning([model()], {providerId:"test",modelId:"org/model",baseUrl:"https://wrong.invalid/v1"}, ai).known).toBe(false);
    expect(resolveModelReasoning([model(),model({provider:"other"})], {providerId:"custom",modelId:"org/model",baseUrl:"https://example.invalid/v1"}, ai).known).toBe(false);
  });
  it("uses a verified endpoint to resolve custom provider aliases", () => {
    expect(resolveModelReasoning([model()], {providerId:"custom",modelId:"org/model",baseUrl:"https://example.invalid/v1"}, ai).provider).toBe("test");
  });
  it("does not offer off or extra levels for a model with mandatory reasoning", () => {
    const result = resolveModelReasoning([model({levels:["high","max"]})], {providerId:"test",modelId:"org/model",requested:"off"}, ai);
    expect(result.levels).toEqual(["high","max"]);
    expect(result.effectiveLevel).toBe("high");
  });
  it("collapses boolean adapters to on/off and does not invent effort levels", () => {
    const result = resolveModelReasoning([model({compat:{thinkingFormat:"qwen",supportsReasoningEffort:false}})], {providerId:"test",modelId:"org/model",requested:"high"}, ai);
    expect(result).toMatchObject({levels:["off","medium"],effectiveLevel:"medium",control:"toggle"});
  });
  it("keeps effort levels when a toggle-capable adapter also supports reasoning effort", () => {
    for (const thinkingFormat of ["qwen", "together", "deepseek", "zai"]) {
      const result = resolveModelReasoning([model({ compat: { thinkingFormat, supportsReasoningEffort: true } })], { providerId: "test", modelId: "org/model", requested: "high" }, ai);
      expect(result).toMatchObject({ levels: ["off", "low", "medium", "high"], effectiveLevel: "high", control: "effort" });
    }
  });
  it("disables controls for nonreasoning models and endpoint-managed thinking", () => {
    expect(resolveModelReasoning([model({reasoning:false})], {providerId:"test",modelId:"org/model"}, ai).levels).toEqual(["off"]);
    expect(resolveModelReasoning([model({compat:{supportsReasoningEffort:false}})], {providerId:"test",modelId:"org/model"}, ai).levels).toEqual([]);
  });
});
