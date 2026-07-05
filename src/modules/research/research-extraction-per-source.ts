import type { ResearchSource, ResearchEvidenceType, ResearchEvidence, ResearchClaim, CreateResearchEvidenceInput, CreateResearchClaimInput } from "./research-types";
import type { ResearchRuntimeEvent } from "./research-types";
import { isSimilarToExistingClaim, findBorderlineSimilarClaim } from "./research-claim-similarity";

type EvidenceStore = {
  createEvidence(input: CreateResearchEvidenceInput): Promise<ResearchEvidence>;
  createClaim(input: CreateResearchClaimInput): Promise<ResearchClaim>;
};

export type PersistOneResult = { persisted: boolean; wasFiltered: boolean };

export async function persistOneEvidenceItem(
  item: Record<string, unknown>,
  source: ResearchSource,
  params: {
    runId: string;
    stepId: string;
    store: EvidenceStore;
    evidenceList: ResearchEvidence[];
    claims: ResearchClaim[];
    onEvent: (event: ResearchRuntimeEvent) => void;
  },
): Promise<PersistOneResult> {
  const { runId, stepId, store, evidenceList, claims, onEvent } = params;

  if (!item.content || String(item.content).trim().length < 10) {
    onEvent({
      type: "evidence_filtered",
      reason: "too_short",
      content: String(item.content ?? "").slice(0, 200),
      sourceId: source.id,
      sourceTitle: source.title,
      confidence: 0,
    });
    return { persisted: false, wasFiltered: true };
  }

  const significance = (item.significance as string) || "medium";
  const isLowSignificance = significance === "low";

  if (isLowSignificance) {
    onEvent({
      type: "evidence_filtered",
      reason: "low_significance",
      content: String(item.content).slice(0, 200),
      sourceId: source.id,
      sourceTitle: source.title,
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
    });
  }

  const rawConfidence = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.7;
  const evidenceConfidence = isLowSignificance ? Math.min(rawConfidence, 0.5) : rawConfidence;

  const evidence = await store.createEvidence({
    runId,
    sourceId: source.id,
    stepId,
    type: (item.type as ResearchEvidenceType) || "fact",
    content: String(item.content).slice(0, 1000),
    context: String(item.context || "").slice(0, 500),
    confidence: evidenceConfidence,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 5) : [],
  });

  evidenceList.push(evidence);
  onEvent({ type: "evidence_extracted", evidenceId: evidence.id, evidenceType: evidence.type, content: evidence.content });

  if (!isLowSignificance && (significance === "high" || evidence.confidence >= 0.75)) {
    const claimText = evidence.content.slice(0, 500);
    if (!isSimilarToExistingClaim(claimText, claims)) {
      const borderline = findBorderlineSimilarClaim(claimText, claims);
      const newClaim = await store.createClaim({
        runId,
        evidenceId: evidence.id,
        sourceId: evidence.sourceId,
        claim: claimText,
        confidence: evidence.confidence,
        ...(borderline ? { needsSemanticReview: true } : {}),
      });
      claims.push(newClaim);
    }
  }

  return { persisted: true, wasFiltered: false };
}
