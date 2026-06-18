/** Strip model reasoning / thinking wrappers from report text. */
export function stripReportThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

const PLANNING_LINE =
  /^\s*(\*+\s*)?(Drafting|Self-Correction|Word Count|Citation[s]? Check|Formal\/Objective|Check Citations|Revised Draft|Final Polish|Point \d+:|Instruction:|Evidence Packet \d+ ->|Let's re-|Re-mapping Citations|Revised Draft:|Mapping Citations|Source List at the bottom|Prompt asks|Wait, let me re-read)/i;

const PLANNING_INLINE =
  /(\*Self-Correction|\*Word Count Check|\*Citations Check|Re-mapping Citations|Let's re-read the instructions)/i;

/** Remove leaked planning / chain-of-thought from a report section. */
export function sanitizeReportSection(text: string): string {
  let out = stripReportThinking(text);

  // Common UI / export artifacts.
  out = out.replace(/^\s*code\s*$/gim, "");
  out = out.replace(/^\s*Copy\s*$/gim, "");

  const paragraphs = out.split(/\n{2,}/);
  const kept: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // Drop fenced blocks that are clearly planning notes, not real code.
    if (/^```/.test(trimmed)) {
      const inner = trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      if (PLANNING_LINE.test(inner) || PLANNING_INLINE.test(inner)) continue;
      if (/^\s*[*-]\s*(Drafting|Point \d+|Formal)/im.test(inner)) continue;
    }

    const lines = trimmed.split("\n");
    const nonPlanningLines = lines.filter((line) => !PLANNING_LINE.test(line.trim()));
    if (nonPlanningLines.length === 0) continue;

    const joined = nonPlanningLines.join("\n").trim();
    if (!joined || PLANNING_INLINE.test(joined) && joined.length < 120) continue;

    kept.push(joined);
  }

  return kept.join("\n\n").trim();
}

/** Remove citation markers that refer to sources outside the allowed range. */
export function clampReportCitations(text: string, maxCitation: number): string {
  if (maxCitation <= 0) {
    return text.replace(/\s*\[(\d+)\]/g, "");
  }
  return text.replace(/\[(\d+)\]/g, (match, raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > maxCitation) return "";
    return match;
  }).replace(/  +/g, " ");
}

/** Hide internal citation-audit appendix from reader-facing report bodies. */
export function stripCitationAuditSection(markdown: string): string {
  const idx = markdown.search(/\n---\n+\s*##\s+Citation Audit\b/i);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx).trimEnd();
}

export function prepareReportSection(
  raw: string,
  maxCitation: number,
): string {
  const sanitized = sanitizeReportSection(raw);
  if (!sanitized) return "";
  return clampReportCitations(sanitized, maxCitation).trim();
}
