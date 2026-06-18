import { describe, expect, it } from "vitest";
import {
  clampReportCitations,
  prepareReportSection,
  sanitizeReportSection,
  stripCitationAuditSection,
  stripReportThinking,
} from "./report-sanitize";

describe("report-sanitize", () => {
  it("removes thinking wrappers", () => {
    expect(stripReportThinking("intro <think>secret</think> outro")).toBe("intro  outro");
  });

  it("drops planning junk while preserving real report text", () => {
    const raw = `First claim [1].

\`\`\`text
Drafting
\`\`\`

Second claim [3]

<think>ignored</think>`;

    expect(sanitizeReportSection(raw)).toBe("First claim [1].\n\nSecond claim [3]");
    expect(prepareReportSection(raw, 2)).toBe("First claim [1].\n\nSecond claim");
  });

  it("clamps citations outside the allowed range and strips the audit appendix", () => {
    expect(clampReportCitations("A [1] B [3] C", 2)).toBe("A [1] B C");
    expect(stripCitationAuditSection("## Body\n\n---\n## Citation Audit\nHidden details")).toBe("## Body");
  });
});
