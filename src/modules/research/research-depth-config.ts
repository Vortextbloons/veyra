import { useSettingsStore } from "@/stores/settings-store";
import { clamp } from "@/lib/number";
import type { ResearchDepth } from "./research-types";
import {
  resolveResearchProfileForRun,
  type ResearchProfileOverride,
} from "./research-config";

export type DepthConfig = {
  maxSearchRounds: number;
  maxSources: number;
  maxSourcesPerRound: number;
  adaptiveDeepening: boolean;
  minSourceQuality: number;
  perSourceRead: boolean;
  crossSourceVerify: boolean;
  gapAnalysis: boolean;
  validateConcurrency: number;
  validateReasoning: boolean;
  validateBatchSize: number;
  verifyBatchSize: number;
  verifyReasoning: boolean;
  extractBatchSize: number;
  contradictionDetect: boolean;
  contradictionMaxPairs: number;
  contradictionMinClaims: number;
  contradictionStrategy: "all_pairs" | "top_k";
  contradictionTopK: number;
  contradictionConcurrency: number;
  synthesisReasoning: boolean;
  selfCritiquePass: boolean;
  auditReasoning: boolean;
  auditMaxCitations: number;
  auditConcurrency: number;
  sectionMaxWords: number;
  maxSections: number;
  directArxivSearch: boolean;
  directWikipediaSearch: boolean;
  liteModelId: string;
  liteModelProviderId: string;
};

function profileToDepthConfig(p: ResearchProfileOverride): DepthConfig {
  const liteModelId = p.liteModelId ?? "";
  const liteModelProviderId = p.liteModelProviderId ?? "";
  return {
    maxSearchRounds: p.maxSearchRounds ?? 5,
    maxSources: p.maxSources ?? 75,
    maxSourcesPerRound: p.maxSourcesPerRound ?? 15,
    adaptiveDeepening: p.adaptiveDeepening ?? false,
    minSourceQuality: p.minSourceQuality ?? 3,
    perSourceRead: p.perSourceRead ?? true,
    directArxivSearch: p.directArxivSearch ?? true,
    directWikipediaSearch: p.directWikipediaSearch ?? true,
    crossSourceVerify: p.crossSourceVerify ?? true,
    gapAnalysis: p.gapAnalysis ?? false,
    validateConcurrency: clamp(p.validateConcurrency ?? 3, 1, 8),
    validateReasoning: p.validateReasoning ?? false,
    validateBatchSize: clamp(p.validateBatchSize ?? 1, 1, 5),
    verifyBatchSize: clamp(p.verifyBatchSize ?? 1, 1, 20),
    verifyReasoning: p.verifyReasoning ?? false,
    extractBatchSize: clamp(p.extractBatchSize ?? 1, 1, 10),
    contradictionDetect: p.contradictionDetect ?? false,
    contradictionMaxPairs: Math.max(0, p.contradictionMaxPairs ?? 0),
    contradictionMinClaims: Math.max(0, p.contradictionMinClaims ?? 5),
    contradictionStrategy: p.contradictionStrategy ?? "top_k",
    contradictionTopK: clamp(p.contradictionTopK ?? 50, 5, 500),
    contradictionConcurrency: clamp(p.contradictionConcurrency ?? 2, 1, 8),
    synthesisReasoning: p.synthesisReasoning ?? false,
    selfCritiquePass: p.selfCritiquePass ?? false,
    auditReasoning: p.auditReasoning ?? false,
    auditMaxCitations: Math.max(0, p.auditMaxCitations ?? 30),
    auditConcurrency: clamp(p.auditConcurrency ?? 3, 1, 8),
    sectionMaxWords: clamp(p.sectionMaxWords ?? 700, 150, 3000),
    maxSections: clamp(p.maxSections ?? 8, 1, 20),
    liteModelId,
    liteModelProviderId,
  };
}

/**
 * Build the effective depth config for a run, layering built-in preset,
 * per-depth settings, global settings, and any per-run override.
 */
export function buildDepthConfig(
  depth: ResearchDepth,
  perRunOverride?: ResearchProfileOverride,
): DepthConfig {
  const settings = useSettingsStore.getState();
  const merged = resolveResearchProfileForRun(
    settings.research,
    depth,
    perRunOverride,
  );
  return profileToDepthConfig(merged);
}

export type { ResearchProfileOverride };
