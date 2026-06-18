import { estimateTokens } from "@/lib/context";
import type { ResearchClaim, ResearchSource } from "./research-types";
import { truncateToTokens } from "./research-source-utils";

// ── Citation helpers ───────────────────────────────────────────────────────

export function getSourceNumber(sourceId: string, readSources: ResearchSource[]): number | null {
  const index = readSources.findIndex((s) => s.id === sourceId);
  return index === -1 ? null : index + 1;
}

export function extractCitationContext(reportMarkdown: string, citationNumber: number): string {
  const citationPattern = new RegExp(`\\[${citationNumber}\\]`, "g");
  let bestContext = "";
  let match;
  while ((match = citationPattern.exec(reportMarkdown)) !== null) {
    const start = Math.max(0, match.index - 400);
    const end = Math.min(reportMarkdown.length, match.index + 400);
    const context = reportMarkdown.slice(start, end).trim();
    if (context.length > bestContext.length) {
      bestContext = context;
    }
  }
  return bestContext || `Citation [${citationNumber}] found in report`;
}

export function pickContradictionWinner(
  resolution: string | undefined,
  claimA: ResearchClaim,
  claimB: ResearchClaim,
  preferredClaim?: string,
): { winnerId: string; loserId: string } | null {
  if (preferredClaim === "A") return { winnerId: claimA.id, loserId: claimB.id };
  if (preferredClaim === "B") return { winnerId: claimB.id, loserId: claimA.id };
  if (preferredClaim === "neither" || preferredClaim === "unclear") return null;
  if (!resolution) return null;
  const aQuote = claimA.claim.slice(0, 60).toLowerCase();
  const bQuote = claimB.claim.slice(0, 60).toLowerCase();
  const lower = resolution.toLowerCase();
  const mentionsA = aQuote.length > 5 && lower.includes(aQuote);
  const mentionsB = bQuote.length > 5 && lower.includes(bQuote);
  if (mentionsA && !mentionsB) {
    return { winnerId: claimA.id, loserId: claimB.id };
  }
  if (mentionsB && !mentionsA) {
    return { winnerId: claimB.id, loserId: claimA.id };
  }
  return null;
}

// ── Round-robin evidence sampling by source score ───────────────────────────

export function roundRobinSampleBySourceScore<T extends { sourceId: string }>(
  items: T[],
  maxItems: number,
  score: (item: T) => number,
): T[] {
  if (items.length <= maxItems) return items;
  const bySource = new Map<string, T[]>();
  for (const item of items) {
    const list = bySource.get(item.sourceId) || [];
    list.push(item);
    bySource.set(item.sourceId, list);
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => score(b) - score(a));
  }
  const sourceIds = Array.from(bySource.keys()).sort((a, b) => {
    const aTop = bySource.get(a)?.[0];
    const bTop = bySource.get(b)?.[0];
    return (bTop ? score(bTop) : 0) - (aTop ? score(aTop) : 0);
  });
  const out: T[] = [];
  let idx = 0;
  while (out.length < maxItems) {
    let pushedThisRound = 0;
    for (const sid of sourceIds) {
      const list = bySource.get(sid)!;
      if (idx < list.length) {
        out.push(list[idx]);
        pushedThisRound++;
        if (out.length >= maxItems) break;
      }
    }
    if (pushedThisRound === 0) break;
    idx++;
  }
  return out;
}

export function sourceSynthesisPriority(source: ResearchSource | undefined): number {
  if (!source) return 0;
  let priority = 0;
  if (source.sourceType === "docs") priority += 0.35;
  if (source.sourceType === "arxiv") priority += 0.3;
  if (source.sourceType === "pdf") priority += 0.2;
  if (source.sourceType === "wikipedia") priority += 0.05;
  if (source.sourceQuality?.credibilityScore) priority += source.sourceQuality.credibilityScore / 20;
  if (source.sourceQuality?.depthScore) priority += source.sourceQuality.depthScore / 25;
  return priority;
}

// ── Extract batch token estimation ─────────────────────────────────────────

const EXTRACT_BATCH_TOKENS_PER_SOURCE_MAX = 6000;
const EXTRACT_BATCH_TOKENS_PER_SOURCE_MIN = 1800;
const EXTRACT_BATCH_TOTAL_TOKEN_BUDGET = 14_000;
const EXTRACT_BATCH_PROMPT_OVERHEAD_TOKENS = 600;

export const EXTRACT_CHUNK_TOKENS = 8000;

/** Per-source excerpt budget shrinks as more sources share one batch call. */
export function tokensPerSourceForBatchCount(sourceCount: number): number {
  const n = Math.max(1, sourceCount);
  if (n <= 1) return EXTRACT_BATCH_TOKENS_PER_SOURCE_MAX;
  if (n === 2) return 3200;
  if (n === 3) return 2400;
  if (n === 4) return 2100;
  return EXTRACT_BATCH_TOKENS_PER_SOURCE_MIN;
}

export function estimateExtractBatchInputTokens(
  sources: ResearchSource[],
  workBySource: Map<string, { chunk: string }[]>,
): number {
  const perSource = tokensPerSourceForBatchCount(sources.length);
  let total = EXTRACT_BATCH_PROMPT_OVERHEAD_TOKENS;
  for (const source of sources) {
    const items = workBySource.get(source.id) || [];
    const first = items[0];
    if (!first) continue;
    total += estimateTokens(truncateToTokens(first.chunk, perSource));
    total += estimateTokens(source.title) + 40;
  }
  return total;
}

export function buildAdaptiveExtractBatches(
  orderedSources: ResearchSource[],
  workBySource: Map<string, { chunk: string }[]>,
  targetBatchSize: number,
): ResearchSource[][] {
  const batches: ResearchSource[][] = [];
  let current: ResearchSource[] = [];

  for (const source of orderedSources) {
    const candidate = [...current, source];
    const withinTarget = candidate.length <= Math.max(1, targetBatchSize);
    const withinBudget =
      estimateExtractBatchInputTokens(candidate, workBySource) <= EXTRACT_BATCH_TOTAL_TOKEN_BUDGET;

    if (current.length > 0 && (!withinTarget || !withinBudget)) {
      batches.push(current);
      current = [source];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export function maxOutputTokensForExtractBatch(sourceCount: number, followUp: boolean): number {
  const base = followUp ? 6000 : 12_000;
  const scaled = 1500 + Math.max(1, sourceCount) * 2200;
  return Math.min(base, scaled);
}
