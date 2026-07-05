export interface CitationAuditResult {
  citationNumber: number;
  sourceId: string;
  sourceTitle: string;
  claimFound: boolean;
  supportingEvidence: string[];
  auditNotes: string;
}

export function missingSourceResult(num: number): CitationAuditResult {
  return {
    citationNumber: num,
    sourceId: "missing",
    sourceTitle: "Source not found",
    claimFound: false,
    supportingEvidence: [],
    auditNotes: "Citation number refers to a source the writer did not see evidence for",
  };
}

export function buildSourceContradictionsText(opts: {
  sourceId: string;
  claims: Array<{ id: string; sourceId: string; claim: string; status: string }>;
  contradictions: Array<{
    claimAId: string;
    claimBId: string;
    resolution?: string;
  }>;
}): string {
  return opts.contradictions
    .filter((c) => {
      const claimA = opts.claims.find((cl) => cl.id === c.claimAId);
      const claimB = opts.claims.find((cl) => cl.id === c.claimBId);
      return claimA?.sourceId === opts.sourceId || claimB?.sourceId === opts.sourceId;
    })
    .map((c, i) => {
      const claimA = opts.claims.find((cl) => cl.id === c.claimAId);
      const claimB = opts.claims.find((cl) => cl.id === c.claimBId);
      return `Contradiction ${i + 1}: ${claimA?.claim || "N/A"} (${claimA?.status || "unknown"}) vs ${claimB?.claim || "N/A"} (${claimB?.status || "unknown"}). Resolution: ${c.resolution || "Unresolved"}`;
    })
    .join("\n")
    .slice(0, 2000);
}

export function markUnsupportedCitations(
  reportMarkdown: string,
  unsupportedCitations: CitationAuditResult[],
): string {
  if (unsupportedCitations.length === 0) return reportMarkdown;
  const sourcesMarker = "\n---\n\n## Sources";
  const markerIndex = reportMarkdown.indexOf(sourcesMarker);
  let reportBody = markerIndex === -1 ? reportMarkdown : reportMarkdown.slice(0, markerIndex);
  const reportTail = markerIndex === -1 ? "" : reportMarkdown.slice(markerIndex);
  for (const audit of unsupportedCitations) {
    const citationPattern = new RegExp(`\\[${audit.citationNumber}\\](?!\\s*\\(citation flagged\\))`, "g");
    reportBody = reportBody.replace(citationPattern, `[${audit.citationNumber}] (citation flagged)`);
  }
  return `${reportBody}${reportTail}`;
}

export function buildAuditAppendix(
  unsupportedCitations: CitationAuditResult[],
  skippedAudit: number,
  auditedCount: number,
): string {
  const auditNotes = unsupportedCitations.length > 0
    ? unsupportedCitations
        .map((a) => `- [${a.citationNumber}] ${a.sourceTitle}: ${a.auditNotes}`)
        .join("\n")
    : "No audited citations were flagged.";

  const auditDetail = `Audited ${auditedCount} citation${auditedCount === 1 ? "" : "s"}, ${unsupportedCitations.length} flagged` +
    (skippedAudit > 0 ? ` (${skippedAudit} citations skipped due to cap)` : "") +
    (unsupportedCitations.length > 0 ? `\n\n${auditNotes}` : "");

  return `---\n\n## Citation Audit\n\n${unsupportedCitations.length > 0 ? "Unsupported citations were marked inline as `(citation flagged)`.\n\n" : ""}${auditDetail}\n`;
}
