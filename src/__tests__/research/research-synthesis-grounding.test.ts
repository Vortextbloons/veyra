import { describe, expect, it } from "vitest";
import type { ResearchSource } from "@/modules/research/research-types";
import {
  buildSnippetCitationSummary,
  selectSnippetGroundingSources,
} from "@/modules/research/research-evidence-summary";
import {
  buildRewritePrompt,
  buildSectionPrompt,
} from "@/modules/research/research-synthesis-prompts";

function source(overrides: Partial<ResearchSource>): ResearchSource {
  return {
    id: "source-1",
    runId: "run-1",
    url: "https://example.com",
    title: "Example",
    status: "discovered",
    sourceType: "webpage",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Lightning synthesis grounding", () => {
  it("selects usable snippets and assigns stable citation numbers", () => {
    const sources = [
      source({ id: "empty", title: "Empty", snippet: "   " }),
      source({ id: "failed", title: "Failed", snippet: "Do not use", status: "failed" }),
      source({ id: "docs", title: "Official docs", snippet: "Documented behavior.", sourceType: "docs" }),
      source({ id: "web", title: "Web result", snippet: "Independent summary." }),
    ];

    const shown = selectSnippetGroundingSources(sources, 2);
    expect(shown.map((item) => item.id)).toEqual(["docs", "web"]);
    expect(buildSnippetCitationSummary(shown)).toContain(
      "Citation [1] — Official docs (https://example.com)",
    );
    expect(buildSnippetCitationSummary(shown)).toContain("Snippet: Documented behavior.");
  });

  it("does not emit an impossible citation range when no sources exist", () => {
    const prompt = buildSectionPrompt({
      heading: "Findings",
      clarifiedQuestion: "",
      question: "What happened?",
      keyPoints: [],
      sectionEvidence: "",
      sectionClaims: "",
      citationEvidenceSummary: "",
      sectionChars: 4000,
      contradictionsSummary: "",
      hasContradictions: false,
      maxCitationNumber: 0,
      sourceQualitySummary: "",
      wordCount: 200,
      sectionMaxWords: 300,
    });
    const rewrite = buildRewritePrompt({
      heading: "Findings",
      sectionIssues: "",
      clarifiedQuestion: "",
      question: "What happened?",
      keyPoints: [],
      maxCitationNumber: 0,
      sourceQualitySummary: "",
      wordCount: 200,
      sectionMaxWords: 300,
    });

    expect(prompt).not.toMatch(/\[1\].*\[0\]|\[1\]\s+through\s+\[0\]/i);
    expect(prompt).toContain("Do not invent citations");
    expect(rewrite).not.toMatch(/\[1\].*\[0\]|\[1\]\s+through\s+\[0\]/i);
  });
});
