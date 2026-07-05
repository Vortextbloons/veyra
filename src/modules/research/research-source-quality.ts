import type { ResearchSource } from "./research-types";
import { getCredibilityScore } from "./source-credibility";

// ── Source quality assessment ──────────────────────────────────────────────

export function computeSourceQuality(
  validationResult: {
    relevant?: boolean;
    quality?: number;
    relevanceScore?: number;
    credibilityScore?: number;
    currencyScore?: number;
    depthScore?: number;
    reason?: string;
    keyInsights?: string[];
  },
  sourceUrl: string,
  minQuality: number,
): { relevant: boolean; quality: number; sourceQuality: ResearchSource["sourceQuality"] } {
  const credibility = getCredibilityScore(sourceUrl);
  const domainScore = credibility.score;
  const quality = validationResult.quality || domainScore;
  const relevant = validationResult.relevant !== false && quality >= minQuality;
  const sourceQuality = {
    relevant,
    quality,
    ...(typeof validationResult.relevanceScore === "number" ? { relevanceScore: validationResult.relevanceScore } : {}),
    ...(typeof validationResult.credibilityScore === "number" ? { credibilityScore: validationResult.credibilityScore } : {}),
    ...(typeof validationResult.currencyScore === "number" ? { currencyScore: validationResult.currencyScore } : {}),
    ...(typeof validationResult.depthScore === "number" ? { depthScore: validationResult.depthScore } : {}),
    ...(validationResult.reason ? { reason: validationResult.reason } : {}),
    ...(validationResult.keyInsights ? { keyInsights: validationResult.keyInsights } : {}),
  } satisfies ResearchSource["sourceQuality"];
  return { relevant, quality, sourceQuality };
}

export function isSourceValid(
  source: ResearchSource,
  minQuality: number,
): boolean {
  return (
    source.status === "read" &&
    source.sourceQuality?.relevant === true &&
    (typeof source.sourceQuality.quality !== "number" || source.sourceQuality.quality >= minQuality)
  );
}

export function filterValidSources(
  sources: ResearchSource[],
  minQuality: number,
): ResearchSource[] {
  return sources.filter((source) => isSourceValid(source, minQuality));
}
