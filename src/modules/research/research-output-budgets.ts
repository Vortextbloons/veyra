import { clamp } from "@/lib/number";

export const RESEARCH_OUTPUT_TOKENS = {
  plan: 3_000,
  sourceValidation: 800,
  claimVerification: 2_500,
  contradictionCheck: 1_200,
  gapAnalysis: 2_000,
  reportOutline: 3_000,
  selfCritique: 3_000,
  citationAudit: 1_800,
} as const;

export function validationBatchOutputTokens(sourceCount: number): number {
  return clamp(Math.max(1, sourceCount) * 700, 700, 3_500);
}

export function extractionOutputTokens(sourceCount: number, followUp: boolean): number {
  const count = Math.max(1, sourceCount);
  const scaled = followUp
    ? 1_000 + count * 1_000
    : 1_200 + count * 1_200;
  return Math.min(followUp ? 4_000 : 6_000, scaled);
}

export function reportSectionOutputTokens(targetWords: number): number {
  return clamp(Math.max(2_000, Math.max(1, targetWords) * 3), 2_000, 5_000);
}
