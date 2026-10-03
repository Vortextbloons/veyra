import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { effectiveReasoningLevel, reasoningToggleState } from "@/modules/agents/agent-reasoning";
import type { AgentReasoningLevel } from "@/modules/agents/agent-types";

type Model = { provider: string; id: string; api: string; baseUrl: string; reasoning: boolean; levels: AgentReasoningLevel[]; compat?: { supportsReasoningEffort?: boolean; thinkingFormat?: string } };
const helperUrl = pathToFileURL(join(process.cwd(), "src-tauri/src/agents/model-capabilities.mjs")).href;
const { resolveModelReasoning } = await import(helperUrl) as { resolveModelReasoning: (models: Model[], input: { providerId: string; modelId: string; baseUrl?: string; requested?: string }, ai: unknown) => { known: boolean; levels: string[]; effectiveLevel: string; provider: string; model: string; control: string } };
type RouteConfig = { providers: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id: string; reasoning: boolean; contextWindow: number; maxTokens: number; compat?: { thinkingFormat?: string } }> }> };
const { configureModelRoute } = await import(helperUrl) as { configureModelRoute: (config: unknown, input: { providerId: string; modelId: string; baseUrl?: string; contextLength?: string; maxTokens?: string }, models?: Model[]) => { config: RouteConfig; provider: string } };
const ai = { getSupportedThinkingLevels: (model: Model) => model.reasoning ? model.levels : ["off"], clampThinkingLevel: (model: Model, requested: AgentReasoningLevel) => effectiveReasoningLevel(requested, model.reasoning ? model.levels : ["off"]) };
function model(overrides: Partial<Model> = {}): Model { return { provider: "test", id: "org/model", api: "openai-completions", baseUrl: "https://example.invalid/v1", reasoning: true, levels: ["off", "low", "medium", "high"], ...overrides }; }

describe("Pi reasoning routing", () => {
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
  it("disables controls for nonreasoning models and endpoint-managed thinking", () => {
    expect(resolveModelReasoning([model({reasoning:false})], {providerId:"test",modelId:"org/model"}, ai).levels).toEqual(["off"]);
    expect(resolveModelReasoning([model({compat:{supportsReasoningEffort:false}})], {providerId:"test",modelId:"org/model"}, ai).levels).toEqual([]);
  });
});
