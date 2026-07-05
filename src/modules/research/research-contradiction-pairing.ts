import type { ResearchClaim, ResearchEvidence } from "./research-types";
import { scoreContradictionPair } from "./research-claim-similarity";

// ── Contradiction pairing ─────────────────────────────────────────────────

export type ContradictionPair = { a: ResearchClaim; b: ResearchClaim };

export function generateContradictionPairs(
  candidates: ResearchClaim[],
): ContradictionPair[] {
  const allPairs: ContradictionPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a && b) allPairs.push({ a, b });
    }
  }
  return allPairs;
}

export function rankContradictionPairs(
  pairs: ContradictionPair[],
  evidenceById: Map<string, ResearchEvidence>,
): Array<{ pair: ContradictionPair; score: number }> {
  return pairs
    .map((pair) => ({ pair, score: scoreContradictionPair(pair.a, pair.b, evidenceById) }))
    .sort((a, b) => b.score - a.score);
}

export function filterAndCapPairs(
  rankedPairs: Array<{ pair: ContradictionPair; score: number }>,
  cap: number,
): ContradictionPair[] {
  return cap > 0 ? rankedPairs.slice(0, cap).map(({ pair }) => pair) : rankedPairs.map(({ pair }) => pair);
}
