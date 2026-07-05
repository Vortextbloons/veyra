import type { ResearchSource, ResearchEvidence } from "./research-types";
import { sourceTypeLabel } from "./research-source-utils";
import { getSourceNumber } from "./research-citation-utils";
import { getCredibilityScore } from "./source-credibility";

export function buildEvidenceSummary(opts: {
  weightedEvidence: ResearchEvidence[];
  sources: ResearchSource[];
  claimByEvidenceId: Map<string, { status: string }>;
}): string {
  return opts.weightedEvidence
    .map((e, i) => {
      const source = opts.sources.find((s) => s.id === e.sourceId);
      const claim = opts.claimByEvidenceId.get(e.id);
      const claimStatus = claim ? `[Claim: ${claim.status}]` : "";
      return `Evidence ${i + 1} [${e.id}] ${claimStatus}:
Source: ${source?.title || "Unknown"} (${source?.url || "N/A"})
Type: ${e.type}
Confidence: ${e.confidence}
Content: ${e.content}
Context: ${e.context}`;
    })
    .join("\n\n");
}

export function buildClaimsSummary(opts: {
  claims: Array<{
    id: string;
    status: string;
    confidence: number;
    sourceId: string;
    evidenceId: string;
    claim: string;
    verificationReason?: string;
  }>;
  evidenceList: ResearchEvidence[];
  sources: ResearchSource[];
}): string {
  return opts.claims
    .sort((a, b) => b.confidence - a.confidence)
    .map((c, i) => {
      const ev = opts.evidenceList.find((e) => e.id === c.evidenceId);
      const source = opts.sources.find((s) => s.id === c.sourceId);
      return `Claim ${i + 1} [${c.id}]:
Status: ${c.status}
Confidence: ${c.confidence}
Source: ${source?.title || "Unknown"}
Evidence: ${ev?.content || "N/A"}
Claim: ${c.claim}
Verification: ${c.verificationReason || "Not verified"}`;
    })
    .join("\n\n");
}

export function buildContradictionsSummary(opts: {
  contradictions: Array<{
    claimAId: string;
    claimBId: string;
    claimAConfidence: number;
    claimBConfidence: number;
    reason?: string;
    resolution?: string;
  }>;
  claims: Array<{ id: string; claim: string; status: string; sourceId: string }>;
  sources: ResearchSource[];
}): string {
  if (opts.contradictions.length === 0) return "No contradictions detected.";
  return opts.contradictions
    .map((c, i) => {
      const claimA = opts.claims.find((cl) => cl.id === c.claimAId);
      const claimB = opts.claims.find((cl) => cl.id === c.claimBId);
      const sourceA = opts.sources.find((s) => s.id === claimA?.sourceId);
      const sourceB = opts.sources.find((s) => s.id === claimB?.sourceId);
      return `Contradiction ${i + 1}:
Claim A: ${claimA?.claim || "N/A"} (status: ${claimA?.status || "unknown"}, confidence: ${c.claimAConfidence}, source: ${sourceA?.title || "Unknown"})
Claim B: ${claimB?.claim || "N/A"} (status: ${claimB?.status || "unknown"}, confidence: ${c.claimBConfidence}, source: ${sourceB?.title || "Unknown"})
Reason: ${c.reason || "N/A"}
Resolution: ${c.resolution || "Unresolved"}`;
    })
    .join("\n\n");
}

export function buildCitationEvidenceSummary(opts: {
  shownEvidence: ResearchEvidence[];
  sources: ResearchSource[];
  shownSources: ResearchSource[];
  claimByEvidenceId: Map<string, { status: string }>;
}): string {
  return opts.shownEvidence
    .map((e) => {
      const source = opts.sources.find((s) => s.id === e.sourceId);
      const sourceNumber = getSourceNumber(e.sourceId, opts.shownSources);
      const claim = opts.claimByEvidenceId.get(e.id);
      const claimStatus = claim ? ` | Claim: ${claim.status}` : "";
      return `Citation ${sourceNumber ? `[${sourceNumber}]` : "uncited-source"} — ${source?.title || "Unknown"} (${source?.url || "N/A"})
Type: ${e.type} | Confidence: ${e.confidence}${claimStatus}
Evidence: ${e.content}
Context: ${e.context}`;
    })
    .join("\n\n");
}

export function buildSourceQualitySummary(opts: {
  shownSources: ResearchSource[];
}): string {
  return opts.shownSources
    .map((s, i) => {
      const { score, label } = getCredibilityScore(s.url);
      return `[${i + 1}] ${s.title} — ${s.url} (${sourceTypeLabel(s.sourceType)}, Authority: ${score}/5 — ${label})`;
    })
    .join("\n");
}
