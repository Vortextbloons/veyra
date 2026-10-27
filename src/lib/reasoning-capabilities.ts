import { invoke } from "@tauri-apps/api/core";

/** Reasoning levels Pi can advertise for a model, in ascending order. */
export const REASONING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type ReasoningControl = "effort" | "toggle" | "none" | "unknown";

export type ModelReasoning = {
  known: boolean;
  provider?: string;
  model?: string;
  levels: ReasoningLevel[];
  effectiveLevel?: ReasoningLevel;
  message: string;
  control?: ReasoningControl;
};

/** Conservative levels used when the installed Pi SDK cannot be read. */
export const FALLBACK_REASONING_LEVELS: ReasoningLevel[] = ["off", "low", "high"];

/** Emitted by the backend when Pi's models.json changes on disk. */
export const REASONING_CHANGED_EVENT = "pi-reasoning-changed";

export const REASONING_LEVEL_LABELS: Record<ReasoningLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "xHigh",
  max: "Max",
};

export function reasoningModelKey(provider: string, model: string, baseUrl = ""): string {
  return JSON.stringify([provider, model, baseUrl.replace(/\/+$/, "")]);
}

/** Keep only levels Pi advertises, in canonical ascending order. */
export function normalizeReasoningLevels(
  levels: readonly string[] | null | undefined,
): ReasoningLevel[] {
  if (!levels?.length) return [];
  const available = new Set(levels);
  return REASONING_LEVELS.filter((level) => available.has(level));
}

/** Mirrors Pi's upward-then-downward clamp, including models that cannot turn reasoning off. */
export function effectiveReasoningLevel(
  requested: ReasoningLevel,
  levels: ReasoningLevel[],
): ReasoningLevel {
  const available = normalizeReasoningLevels(levels);
  if (available.length === 0) return "off";
  if (available.includes(requested)) return requested;
  const index = REASONING_LEVELS.indexOf(requested);
  if (index < 0) return available[0];
  return (
    REASONING_LEVELS.slice(index).find((level) => available.includes(level)) ??
    [...REASONING_LEVELS.slice(0, index)].reverse().find((level) => available.includes(level)) ??
    available[0]
  );
}

export function reasoningToggleState(preferred: ReasoningLevel, levels: ReasoningLevel[]) {
  const onLevel = levels.includes("medium") ? "medium" : levels.find((level) => level !== "off");
  return {
    enabled: Boolean(onLevel) && (preferred !== "off" || !levels.includes("off")),
    canToggle: Boolean(onLevel) && levels.includes("off"),
  };
}

export function fallbackModelReasoning(
  message = "Pi reasoning options are unavailable. Using basic reasoning levels.",
): ModelReasoning {
  return {
    known: false,
    levels: [...FALLBACK_REASONING_LEVELS],
    control: "effort",
    message,
  };
}

const cache = new Map<string, { at: number; value: Promise<ModelReasoning> }>();
const knownControls = new Map<string, ReasoningControl>();
const knownLevels = new Map<string, ReasoningLevel[]>();
const CACHE_TTL_MS = 120_000;

export function getCachedReasoningControl(key: string): ReasoningControl | undefined {
  return knownControls.get(key);
}

export function getCachedReasoningLevels(key: string): ReasoningLevel[] | undefined {
  return knownLevels.get(key);
}

export function invalidateReasoningCache(): void {
  cache.clear();
}

/**
 * Record capabilities resolved from a provider's own API rather than Pi. Normal
 * chat talks to the endpoint directly, so the endpoint's report is authoritative
 * and must also drive request building.
 */
export function rememberReasoningCapabilities(
  key: string,
  control: ReasoningControl,
  levels: readonly string[],
): ReasoningLevel[] {
  const normalized = normalizeReasoningLevels(levels);
  knownControls.set(key, control);
  knownLevels.set(key, normalized);
  return normalized;
}

/**
 * Reads reasoning capabilities from the installed Pi SDK. This is the same
 * source the agents runtime uses, so new Pi levels appear here automatically.
 */
export function inspectModelReasoning(
  providerId: string,
  model: string,
  providerBaseUrl?: string,
  refresh = false,
): Promise<ModelReasoning> {
  const key = reasoningModelKey(providerId, model, providerBaseUrl);
  const existing = cache.get(key);
  if (!refresh && existing && Date.now() - existing.at < CACHE_TTL_MS) return existing.value;

  const value = invoke<ModelReasoning>("inspect_agent_reasoning", {
    providerId,
    model,
    providerBaseUrl,
  })
    .then((result) => {
      const levels = normalizeReasoningLevels(result.levels);
      const control: ReasoningControl = result.control ?? "unknown";
      knownControls.set(key, control);
      knownLevels.set(key, levels);
      return {
        ...result,
        levels,
        control,
        effectiveLevel: result.effectiveLevel
          ? effectiveReasoningLevel(result.effectiveLevel, levels)
          : undefined,
      };
    })
    .catch((error) => {
      if (cache.get(key)?.value === value) cache.delete(key);
      throw error;
    });

  if (cache.size >= 32) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, { at: Date.now(), value });
  return value;
}
