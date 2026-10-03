import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { effectiveReasoningLevel } from "@/modules/agents/agent-reasoning";
import type { AgentReasoningLevel } from "@/modules/agents/agent-types";

type Model = { provider: string; id: string; api: string; baseUrl: string; reasoning: boolean; levels: AgentReasoningLevel[]; compat?: { supportsReasoningEffort?: boolean; thinkingFormat?: string } };
const helperUrl = pathToFileURL(join(process.cwd(), "src-tauri/src/agents/model-capabilities.mjs")).href;
const { resolveModelReasoning } = await import(helperUrl) as { resolveModelReasoning: (models: Model[], input: { providerId: string; modelId: string; baseUrl?: string; requested?: string }, ai: unknown) => { known: boolean; levels: string[]; effectiveLevel: string; provider: string; model: string; control: string } };
const ai = { getSupportedThinkingLevels: (model: Model) => model.reasoning ? model.levels : ["off"], clampThinkingLevel: (model: Model, requested: AgentReasoningLevel) => effectiveReasoningLevel(requested, model.reasoning ? model.levels : ["off"]) };
function model(overrides: Partial<Model> = {}): Model { return { provider: "test", id: "org/model", api: "openai-completions", baseUrl: "https://example.invalid/v1", reasoning: true, levels: ["off", "low", "medium", "high"], ...overrides }; }

describe("Pi reasoning routing", () => {
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
