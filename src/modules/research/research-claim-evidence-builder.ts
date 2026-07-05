import type { ResearchSource, ResearchEvidence, ResearchClaim } from "./research-types";
import { scoreClaimEvidenceMatch } from "./research-claim-similarity";

// ── Evidence building ─────────────────────────────────────────────────────

export function buildClaimEvidence(
  claim: ResearchClaim,
  evidenceList: ResearchEvidence[],
  evidenceById: Map<string, ResearchEvidence>,
  sourceById: Map<string, ResearchSource>,
): { evidenceText: string; claimEvidence: ResearchEvidence[]; independentEvidenceCount: number } {
  const anchorEvidence = evidenceById.get(claim.evidenceId);
  const anchorTags = anchorEvidence?.tags ?? [];

  const scoredEvidence = evidenceList.map((evidence) => ({
    evidence,
    score: scoreClaimEvidenceMatch(claim, anchorTags, evidence, sourceById),
  }));

  const selectedEvidence = scoredEvidence
    .filter(({ evidence, score }) => evidence.id === claim.evidenceId || score >= (evidence.sourceId === claim.sourceId ? 0.24 : 0.3))
    .sort((a, b) => {
      if (a.evidence.id === claim.evidenceId) return -1;
      if (b.evidence.id === claim.evidenceId) return 1;
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;
      return b.evidence.confidence - a.evidence.confidence;
    })
    .slice(0, 8)
    .map(({ evidence }) => evidence);

  const claimEvidence = selectedEvidence.length > 0
    ? selectedEvidence
    : anchorEvidence
      ? [anchorEvidence]
      : [];
  const independentEvidenceCount = new Set(
    claimEvidence
      .filter((evidence) => evidence.sourceId !== claim.sourceId)
      .map((evidence) => evidence.sourceId),
  ).size;
  const evidenceText = claimEvidence
    .map((evidence, index) => `Evidence ${index + 1} from ${sourceById.get(evidence.sourceId)?.title || "Unknown"}:
Type: ${evidence.type}
Content: ${evidence.content}
Confidence: ${evidence.confidence}`)
    .join("\n\n");
  return { evidenceText, claimEvidence, independentEvidenceCount };
}

// ── Batch building ────────────────────────────────────────────────────────

export type VerifyBatch = {
  claim: ResearchClaim;
  evidenceText: string;
  claimEvidence: ResearchEvidence[];
  independentEvidenceCount: number;
};

export function buildVerifyBatches(
  claimPool: ResearchClaim[],
  evidenceList: ResearchEvidence[],
  evidenceById: Map<string, ResearchEvidence>,
  sourceById: Map<string, ResearchSource>,
  batchSize: number,
): VerifyBatch[][] {
  const size = Math.max(1, batchSize);
  if (size === 1) {
    return claimPool.map((claim) => [{ claim, ...buildClaimEvidence(claim, evidenceList, evidenceById, sourceById) }]);
  }

  const order: string[] = [];
  const bySource = new Map<string, ResearchClaim[]>();
  for (const claim of claimPool) {
    if (!bySource.has(claim.sourceId)) {
      bySource.set(claim.sourceId, []);
      order.push(claim.sourceId);
    }
    const arr = bySource.get(claim.sourceId) ?? [];
    arr.push(claim);
  }

  const batches: VerifyBatch[][] = [];
  const flush = (group: ResearchClaim[]) => {
    for (let i = 0; i < group.length; i += size) {
      const slice = group.slice(i, i + size);
      batches.push(slice.map((claim) => ({ claim, ...buildClaimEvidence(claim, evidenceList, evidenceById, sourceById) })));
    }
  };

  for (const sourceId of order) {
    flush(bySource.get(sourceId) ?? []);
  }
  return batches;
}
