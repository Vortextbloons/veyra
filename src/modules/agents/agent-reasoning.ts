import { invoke } from "@tauri-apps/api/core";
import { AGENT_REASONING_LEVELS, type AgentReasoningLevel } from "./agent-types";

export type ModelReasoning = {
  known: boolean; provider?: string; model?: string; levels: AgentReasoningLevel[];
  effectiveLevel?: AgentReasoningLevel; message: string;
  control?: "effort" | "toggle" | "none" | "unknown";
};

export function reasoningModelKey(provider: string, model: string, baseUrl = ""): string {
  return JSON.stringify([provider, model, baseUrl.replace(/\/+$/, "")]);
}

/** Mirrors Pi's upward-then-downward clamp, including models that cannot turn reasoning off. */
export function effectiveReasoningLevel(requested: AgentReasoningLevel, levels: AgentReasoningLevel[]): AgentReasoningLevel {
  if (levels.includes(requested)) return requested;
  const index = AGENT_REASONING_LEVELS.indexOf(requested);
  return AGENT_REASONING_LEVELS.slice(index).find((level) => levels.includes(level))
    ?? [...AGENT_REASONING_LEVELS.slice(0, index)].reverse().find((level) => levels.includes(level)) ?? "off";
}

const cache = new Map<string, { at: number; value: Promise<ModelReasoning> }>();
export function inspectAgentReasoning(providerId: string, model: string, providerBaseUrl?: string, refresh = false): Promise<ModelReasoning> {
  const key = reasoningModelKey(providerId, model, providerBaseUrl);
  const existing = cache.get(key);
  if (!refresh && existing && Date.now() - existing.at < 120_000) return existing.value;
  const value = invoke<ModelReasoning>("inspect_agent_reasoning", { providerId, model, providerBaseUrl }).catch((error) => { if (cache.get(key)?.value === value) cache.delete(key); throw error; });
  if (cache.size >= 32) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, { at: Date.now(), value });
  return value;
}
