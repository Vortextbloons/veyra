import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@/lib/lm-studio-constants";
import {
  REASONING_LEVELS,
  normalizeReasoningLevels,
  type ModelReasoning,
  type ReasoningControl,
  type ReasoningLevel,
} from "@/lib/reasoning-capabilities";

/**
 * LM Studio reports the reasoning options a model actually accepts through its
 * native `/api/v1/models` endpoint. That is authoritative for normal chat,
 * which talks to the endpoint directly instead of going through Pi.
 */
type LmStudioReasoningReport = {
  options: string[];
  defaultOption?: string;
};

const CACHE_TTL_MS = 60_000;

const reports = new Map<string, { at: number; report: Promise<LmStudioReasoningReport | null> }>();
const optionsByModel = new Map<string, string[]>();

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_LM_STUDIO_BASE_URL).replace(/\/+$/, "");
}

function cacheKey(modelId: string, baseUrl?: string): string {
  return JSON.stringify([modelId, normalizeBaseUrl(baseUrl)]);
}

function readReasoningReport(entry: unknown): { report: LmStudioReasoningReport | null; modelId: string } {
  if (!entry || typeof entry !== "object") return { report: null, modelId: "" };
  const record = entry as Record<string, unknown>;
  const selected = typeof record.selected_variant === "string" ? record.selected_variant : "";
  const keyed = typeof record.key === "string" ? record.key : "";
  const modelId = (selected || keyed).trim();
  const capabilities = record.capabilities;
  if (!capabilities || typeof capabilities !== "object") return { report: null, modelId };
  const reasoning = (capabilities as Record<string, unknown>).reasoning;
  if (!reasoning || typeof reasoning !== "object") return { report: null, modelId };
  const reasoningRecord = reasoning as Record<string, unknown>;
  const allowed = Array.isArray(reasoningRecord.allowed_options)
    ? reasoningRecord.allowed_options.filter((option): option is string => typeof option === "string")
    : [];
  if (allowed.length === 0) return { report: null, modelId };
  const defaultOption = typeof reasoningRecord.default === "string" ? reasoningRecord.default : undefined;
  return { report: { options: allowed, defaultOption }, modelId };
}

async function fetchReasoningReport(
  modelId: string,
  baseUrl?: string,
): Promise<LmStudioReasoningReport | null> {
  try {
    const res = await tauriFetch(`${normalizeBaseUrl(baseUrl)}/api/v1/models`);
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: unknown[] } | unknown[];
    const entries = Array.isArray(json) ? json : Array.isArray(json?.models) ? json.models : [];
    const wanted = modelId.trim();
    for (const entry of entries) {
      const { report, modelId: entryId } = readReasoningReport(entry);
      if (!report || !entryId) continue;
      if (entryId === wanted || entryId.startsWith(`${wanted}@`)) return report;
    }
    return null;
  } catch {
    return null;
  }
}

/** Public LM Studio options are a subset of Pi's levels; `on` means enabled. */
function optionToLevel(option: string): ReasoningLevel | undefined {
  if (option === "on") return "medium";
  return (REASONING_LEVELS as readonly string[]).includes(option)
    ? (option as ReasoningLevel)
    : undefined;
}

function isBinary(options: string[]): boolean {
  return options.length > 0 && options.every((option) => option === "off" || option === "on");
}

function describe(modelId: string, report: LmStudioReasoningReport): ModelReasoning {
  const levels = normalizeReasoningLevels(
    report.options.map(optionToLevel).filter((level): level is ReasoningLevel => Boolean(level)),
  );
  const control: ReasoningControl = isBinary(report.options) ? "toggle" : "effort";
  const reportedDefault = report.defaultOption ? optionToLevel(report.defaultOption) : undefined;
  const effectiveLevel =
    reportedDefault && levels.includes(reportedDefault)
      ? reportedDefault
      : levels.includes("medium")
        ? "medium"
        : levels.find((level) => level !== "off") ?? "off";
  return {
    known: true,
    provider: "lm-studio",
    model: modelId,
    levels,
    effectiveLevel,
    control,
    message:
      control === "toggle"
        ? "LM Studio exposes reasoning on/off for this model."
        : report.options.includes("off")
          ? ""
          : "This model requires reasoning; only effort can be adjusted.",
  };
}

/**
 * Reads the reasoning options LM Studio advertises for a model. Returns null when
 * the endpoint is unreachable or the model publishes no reasoning configuration,
 * so callers can fall back to the Pi registry.
 */
export async function inspectLmStudioReasoning(
  modelId: string,
  baseUrl?: string,
  refresh = false,
): Promise<ModelReasoning | null> {
  if (!modelId.trim()) return null;
  const key = cacheKey(modelId, baseUrl);
  const cached = reports.get(key);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    const report = await cached.report;
    return report ? describe(modelId, report) : null;
  }
  const report = fetchReasoningReport(modelId, baseUrl);
  if (reports.size >= 32) reports.delete(reports.keys().next().value ?? "");
  reports.set(key, { at: Date.now(), report });
  const resolved = await report;
  if (!resolved) {
    reports.delete(key);
    return null;
  }
  optionsByModel.set(key, resolved.options);
  return describe(modelId, resolved);
}

export function invalidateLmStudioReasoningCache(): void {
  reports.clear();
}

/** Reasoning options last seen for a model, used to build valid request fields. */
export function getLmStudioReasoningOptions(modelId: string, baseUrl?: string): string[] | undefined {
  return optionsByModel.get(cacheKey(modelId, baseUrl));
}

/** Record options discovered elsewhere (e.g. model discovery) for request building. */
export function rememberLmStudioReasoningOptions(
  modelId: string,
  options: readonly string[],
  baseUrl?: string,
): void {
  if (options.length === 0) return;
  optionsByModel.set(cacheKey(modelId, baseUrl), [...options]);
}

/**
 * Maps a reasoning level to a value LM Studio accepts for the model. LM Studio
 * errors when a model receives a reasoning setting it does not advertise, so
 * unsupported levels clamp to the closest advertised one and unknown support
 * sends nothing at all.
 */
export function lmStudioReasoningValue(
  modelId: string,
  level: ReasoningLevel,
  baseUrl?: string,
): string | undefined {
  const options = getLmStudioReasoningOptions(modelId, baseUrl);
  if (!options?.length) return undefined;
  if (level === "off") return options.includes("off") ? "off" : undefined;
  if (isBinary(options)) return options.includes("on") ? "on" : options.find((option) => option !== "off");
  const preference =
    level === "max" || level === "xhigh"
      ? ["high", "medium", "low", "on"]
      : level === "minimal"
        ? ["low", "medium", "on", "high"]
        : [level, "high", "medium", "low", "on"];
  return preference.find((option) => options.includes(option));
}

/**
 * Maps a level to the OpenAI-compatible `reasoning_effort` vocabulary, which
 * spells disabled reasoning `none` and has no `on` value.
 */
export function lmStudioReasoningEffort(
  modelId: string,
  level: ReasoningLevel,
  baseUrl?: string,
): string | undefined {
  const value = lmStudioReasoningValue(modelId, level, baseUrl);
  if (!value) return undefined;
  if (value === "off") return "none";
  if (value === "on") return "medium";
  return value;
}
