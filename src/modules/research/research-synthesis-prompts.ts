export function buildOutlinePrompt(opts: {
  clarifiedQuestion: string;
  question: string;
  evidenceSummary: string;
  claimsSummary: string;
  contradictionsSummary: string;
  maxSections: number;
  outlineChars: number;
}): string {
  return `You are a senior research analyst. Create a detailed outline for a comprehensive research report.

Research Question: ${opts.question}
${opts.clarifiedQuestion ? `Clarified Question: ${opts.clarifiedQuestion}` : ""}

Key Evidence (sorted by confidence):
${opts.evidenceSummary.slice(0, opts.outlineChars)}

Claims Summary:
${opts.claimsSummary.slice(0, 4000)}

Contradictions:
${opts.contradictionsSummary}

Create a detailed outline with no more than ${opts.maxSections} sections total, distributed as:
1. Executive Summary
2. Introduction (context and scope)
3. Main sections (fill remaining budget based on key themes)
4. For each section: key points to cover, which evidence supports it, which claims to discuss
5. Contradictions section (if any exist, count toward the total)
6. Limitations and Gaps (count toward the total)
7. Conclusion (count toward the total)

The total number of sections in your JSON response must not exceed ${opts.maxSections}.

Return ONLY a JSON object:
{
  "title": "Report title",
  "sections": [
    {
      "heading": "Section heading",
      "keyPoints": ["point 1", "point 2"],
      "supportingEvidenceIds": ["evidence-id-1"],
      "supportingClaimIds": ["claim-id-1"],
      "wordCount": 300
    }
  ]
}`;
}

export function buildSectionPrompt(opts: {
  heading: string;
  clarifiedQuestion: string;
  question: string;
  keyPoints: string[];
  sectionEvidence: string;
  sectionClaims: string;
  citationEvidenceSummary: string;
  sectionChars: number;
  contradictionsSummary: string;
  hasContradictions: boolean;
  maxCitationNumber: number;
  sourceQualitySummary: string;
  wordCount: number;
  sectionMaxWords: number;
}): string {
  return `Write section "${opts.heading}" for a research report.

Research Question: ${opts.clarifiedQuestion || opts.question}

Key Points to Cover:
${opts.keyPoints.map((p) => `- ${p}`).join("\n")}

${opts.sectionEvidence ? `Supporting Evidence:\n${opts.sectionEvidence}\n\n` : ""}
${opts.sectionClaims ? `Related Claims:\n${opts.sectionClaims}\n\n` : ""}
Evidence Packets Available for Citation:
${opts.citationEvidenceSummary.slice(0, opts.sectionChars) || "No extracted evidence available."}


${opts.hasContradictions ? `Known Contradictions and Resolutions:\n${opts.contradictionsSummary}\n\n` : ""}

Requirements:
- Write in formal, objective academic tone
- Cite claims using only citation numbers [1] through [${opts.maxCitationNumber}] from the evidence packets and source list below
- Do not cite a source unless a listed evidence packet supports the sentence
- Do not invent citation numbers outside that range
- Address uncertainties and conflicting evidence honestly
- Include specific statistics and quotes where available
- Target: ${opts.wordCount} words (do not exceed ${opts.sectionMaxWords})

Sources (citation numbers [1]–[${opts.maxCitationNumber}] only):
${opts.sourceQualitySummary}

Output rules:
- Return ONLY polished report prose for this section
- Do NOT include the section heading
- Do NOT include planning notes, checklists, self-corrections, word-count commentary, citation-mapping notes, or instructions to yourself
- Do NOT output labels like "code", "Copy", "Drafting", or bullet lists of writing steps`;
}

export function buildSelfCritiquePrompt(opts: {
  question: string;
  clarifiedQuestion: string;
  reportDraft: string;
  rewriteCap: number;
}): string {
  return `You are a critical peer reviewer. Review this research draft and identify specific improvements.

Research Question: "${opts.clarifiedQuestion || opts.question}"

Draft Report:
${opts.reportDraft.slice(0, 12000)}

Evaluate:
1. Are there logical gaps or unsupported claims?
2. Is the structure clear and flowing well?
3. Are there weaker sections that need more evidence or better argumentation?
4. Are citations properly integrated?

Identify up to ${opts.rewriteCap} sections that need rewriting most.

Return a JSON object:
{
  "overallScore": 1-10,
  "issues": [
    {"section": "section heading", "issue": "description", "severity": "high|medium|low", "fix": "specific suggestion"}
  ],
  "rewriteSections": ["section heading that needs rewriting"]
}`;
}

export function buildRewritePrompt(opts: {
  heading: string;
  sectionIssues: string;
  clarifiedQuestion: string;
  question: string;
  keyPoints: string[];
  maxCitationNumber: number;
  sourceQualitySummary: string;
  wordCount: number;
  sectionMaxWords: number;
}): string {
  return `Rewrite section "${opts.heading}" for this research report, addressing these issues:

${opts.sectionIssues || "Improve clarity, add more specific evidence, and strengthen argumentation."}

Research Question: "${opts.clarifiedQuestion || opts.question}"

Key Points to Cover:
${opts.keyPoints.map((p) => `- ${p}`).join("\n")}

Requirements:
- Write in formal, objective academic tone
- Cite claims using citation numbers [1] through [${opts.maxCitationNumber}]
- Target: ${opts.wordCount} words (do not exceed ${opts.sectionMaxWords})

Sources:
${opts.sourceQualitySummary}

Output: Return ONLY polished report prose. No headings, no meta-commentary.`;
}

export function buildCitationAuditPrompt(opts: {
  citationNumber: number;
  sourceTitle: string;
  sourceUrl: string;
  citationContext: string;
  evidenceText: string;
  sourceContradictions: string;
}): string {
  return `You are a citation auditor. Verify that a cited source actually supports the claims made near its citation.

Citation [${opts.citationNumber}] — ${opts.sourceTitle}
URL: ${opts.sourceUrl}

Claims in context near this citation:
${opts.citationContext}

Evidence from this source:
${opts.evidenceText || "No direct evidence extracted"}

Known contradictions involving this source:
${opts.sourceContradictions || "None"}

Audit: Does this source actually support the claims cited? Answer ONLY with a JSON object:
{
  "claimFound": true|false,
  "supportingEvidence": ["exact evidence that supports the claim"],
  "auditNotes": "Brief explanation of whether the citation is accurate, exaggerated, unsupported, or cites a disputed/contradicted claim without acknowledging the contradiction"
}`;
}
