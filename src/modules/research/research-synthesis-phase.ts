import type { ResearchSource, ResearchEvidence, CreateResearchReportInput } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { callResearchAi, getTemporalContext } from "./research-ai";
import { safeJsonParse, getErrorMessage } from "./research-json-utils";
import { sourceTypeLabel, synthesisBudget, nowIso } from "./research-source-utils";
import { roundRobinSampleBySourceScore, sourceSynthesisPriority, getSourceNumber, extractCitationContext } from "./research-citation-utils";
import { prepareReportSection } from "./report-sanitize";
import { getCredibilityScore } from "./source-credibility";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function synthesisPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<void> {
  const { run, config, signal, store, sources, evidenceList, claims, contradictions, onEvent } = ctx;
  const existingRun = store.activeRunOrNull();

  if (config.perSourceRead && evidenceList.length === 0) {
    throw new Error("No usable evidence was extracted from the fetched sources. Try a broader question, different search settings, or verify SearXNG/page fetching is working.");
  }
  if (resumeFromPhase && existingRun?.report) {
    onEvent({ type: "report_complete", reportId: existingRun.report.id });
    await ctx.updateRunStatus("completed", 100, {
      completedAt: nowIso(),
      totalTokensUsed: ctx.tokenUsage.input > 0 ? ctx.tokenUsage.input : undefined,
    });
    return;
  }
  const synthesizeStep = await ctx.createStep("synthesize", "Synthesizing comprehensive report");
  onEvent({ type: "phase_start", phase: "synthesize", stepId: synthesizeStep.id });
  await ctx.updateRunStatus("synthesizing", 80);

  // Build a comprehensive evidence summary, weighted by claim verification status.
  const claimByEvidenceId = new Map(claims.map((c) => [c.evidenceId, c]));
  const verificationBoost: Record<string, number> = {
    verified: 1.0,
    partially_verified: 0.6,
    extracted: 0.3,
    unverified: 0.0,
    contradicted: -0.3,
    disputed: -0.2,
    rejected: -0.5,
  };
  const evidenceVerificationScore = (evidence: ResearchEvidence): number => {
    const claim = claimByEvidenceId.get(evidence.id);
    const source = sources.find((s) => s.id === evidence.sourceId);
    return evidence.confidence +
      (verificationBoost[claim?.status ?? "extracted"] ?? 0) +
      sourceSynthesisPriority(source);
  };

  const weightedEvidence = [...evidenceList].sort((a, b) => {
    const claimA = claimByEvidenceId.get(a.id);
    const claimB = claimByEvidenceId.get(b.id);
    const sourceA = sources.find((s) => s.id === a.sourceId);
    const sourceB = sources.find((s) => s.id === b.sourceId);
    const scoreA = a.confidence + (verificationBoost[claimA?.status ?? "extracted"] ?? 0) + sourceSynthesisPriority(sourceA);
    const scoreB = b.confidence + (verificationBoost[claimB?.status ?? "extracted"] ?? 0) + sourceSynthesisPriority(sourceB);
    return scoreB - scoreA;
  });

  const evidenceSummary = weightedEvidence
    .map((e, i) => {
      const source = sources.find((s) => s.id === e.sourceId);
      const claim = claimByEvidenceId.get(e.id);
      const claimStatus = claim ? `[Claim: ${claim.status}]` : "";
      return `Evidence ${i + 1} [${e.id}] ${claimStatus}:
Source: ${source?.title || "Unknown"} (${source?.url || "N/A"})
Type: ${e.type}
Confidence: ${e.confidence}
Content: ${e.content}
Context: ${e.context}`;
    })
    .join("\n\n");

  const claimsSummary = claims
    .sort((a, b) => b.confidence - a.confidence)
    .map((c, i) => {
      const ev = evidenceList.find((e) => e.id === c.evidenceId);
      const source = sources.find((s) => s.id === c.sourceId);
      return `Claim ${i + 1} [${c.id}]:
Status: ${c.status}
Confidence: ${c.confidence}
Source: ${source?.title || "Unknown"}
Evidence: ${ev?.content || "N/A"}
Claim: ${c.claim}
Verification: ${c.verificationReason || "Not verified"}`;
    })
    .join("\n\n");

  const contradictionsSummary = contradictions.length > 0
    ? contradictions.map((c, i) => {
        const claimA = claims.find((cl) => cl.id === c.claimAId);
        const claimB = claims.find((cl) => cl.id === c.claimBId);
        const sourceA = sources.find((s) => s.id === claimA?.sourceId);
        const sourceB = sources.find((s) => s.id === claimB?.sourceId);
        return `Contradiction ${i + 1}:
Claim A: ${claimA?.claim || "N/A"} (status: ${claimA?.status || "unknown"}, confidence: ${c.claimAConfidence}, source: ${sourceA?.title || "Unknown"})
Claim B: ${claimB?.claim || "N/A"} (status: ${claimB?.status || "unknown"}, confidence: ${c.claimBConfidence}, source: ${sourceB?.title || "Unknown"})
Reason: ${c.reason || "N/A"}
Resolution: ${c.resolution || "Unresolved"}`;
      }).join("\n\n")
    : "No contradictions detected.";

  const budget = synthesisBudget(run.depth);
  const shownEvidenceBase = roundRobinSampleBySourceScore(weightedEvidence, budget.evidenceItems, evidenceVerificationScore);
  const shownEvidenceIds = new Set(shownEvidenceBase.map((e) => e.id));
  const mustIncludeEvidence = weightedEvidence.filter((evidence) => {
    if (shownEvidenceIds.has(evidence.id)) return false;
    const claim = claimByEvidenceId.get(evidence.id);
    const source = sources.find((s) => s.id === evidence.sourceId);
    return claim?.status === "verified" || claim?.status === "partially_verified" || sourceSynthesisPriority(source) >= 0.45;
  });
  const shownEvidence = [
    ...shownEvidenceBase,
    ...mustIncludeEvidence.slice(0, Math.max(0, Math.floor(budget.evidenceItems * 0.15))),
  ];
  const citationVisibleEvidenceIds = new Set(shownEvidence.map((e) => e.id));
  const shownSourceIds: string[] = [];
  const seen = new Set<string>();
  for (const e of shownEvidence) {
    if (!seen.has(e.sourceId)) {
      seen.add(e.sourceId);
      shownSourceIds.push(e.sourceId);
    }
  }
  const shownSources: ResearchSource[] = shownSourceIds
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is ResearchSource => Boolean(s));

  const maxCitationNumber = shownSources.length;

  const citationEvidenceSummary = shownEvidence
    .map((e) => {
      const source = sources.find((s) => s.id === e.sourceId);
      const sourceNumber = getSourceNumber(e.sourceId, shownSources);
      const claim = claimByEvidenceId.get(e.id);
      const claimStatus = claim ? ` | Claim: ${claim.status}` : "";
      return `Citation ${sourceNumber ? `[${sourceNumber}]` : "uncited-source"} — ${source?.title || "Unknown"} (${source?.url || "N/A"})
Type: ${e.type} | Confidence: ${e.confidence}${claimStatus}
Evidence: ${e.content}
Context: ${e.context}`;
    })
    .join("\n\n");

  const sourceQualitySummary = shownSources
    .map((s, i) => {
      const { score, label } = getCredibilityScore(s.url);
      return `[${i + 1}] ${s.title} — ${s.url} (${sourceTypeLabel(s.sourceType)}, Authority: ${score}/5 — ${label})`;
    })
    .join("\n");

  // Pass 1: Build outline
  const outlinePrompt = `You are a senior research analyst. Create a detailed outline for a comprehensive research report.

Research Question: ${ctx.clarifiedResearchQuestion || run.question}
${ctx.clarifiedResearchQuestion ? `Clarified Question: ${ctx.clarifiedResearchQuestion}` : ""}

Key Evidence (sorted by confidence):
${evidenceSummary.slice(0, budget.outlineChars)}

Claims Summary:
${claimsSummary.slice(0, 4000)}

Contradictions:
${contradictionsSummary}

Create a detailed outline with no more than ${config.maxSections} sections total, distributed as:
1. Executive Summary
2. Introduction (context and scope)
3. Main sections (fill remaining budget based on key themes)
4. For each section: key points to cover, which evidence supports it, which claims to discuss
5. Contradictions section (if any exist, count toward the total)
6. Limitations and Gaps (count toward the total)
7. Conclusion (count toward the total)

The total number of sections in your JSON response must not exceed ${config.maxSections}.

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

  let reportMarkdown = "";
  let outlineJson: {
    title?: string;
    sections?: Array<{
      heading?: string;
      keyPoints?: string[];
      supportingEvidenceIds?: string[];
      supportingClaimIds?: string[];
      wordCount?: number;
    }>;
  } | null = null;

  const outlineStep = await ctx.createStep("report", "Generating report outline");
  try {
    const outlineResult = await callResearchAi(
      [
        { role: "system", content: `You are a senior research analyst. Create detailed, well-structured report outlines. Return valid JSON only.\n\n${getTemporalContext()}` },
        { role: "user", content: outlinePrompt },
      ],
      signal,
      undefined,
      12000,
      { reasoningEnabled: config.synthesisReasoning, jsonModeHint: true, temperature: 0.4, ...ctx.researchAiOptions("main") },
    );
    if (outlineResult.tokens?.totalTokens) ctx.tokenUsage.input += outlineResult.tokens.totalTokens;

    outlineJson = safeJsonParse(outlineResult.text);
    await ctx.completeStep(outlineStep, outlineJson?.sections?.length ? `${outlineJson.sections.length} sections planned` : "Using default outline", outlineResult.tokens?.totalTokens);
  } catch (err) {
    console.warn("[research-runtime] Outline generation failed:", err);
    await ctx.failStep(outlineStep, getErrorMessage(err));
  }

  // Pass 2: Write each section
  const rawSections = outlineJson?.sections?.length ? outlineJson.sections : [
    { heading: "Executive Summary", keyPoints: ["Summarize findings"], wordCount: 300 },
    { heading: "Introduction", keyPoints: ["Context and scope"], wordCount: 200 },
    { heading: "Key Findings", keyPoints: ["Main evidence and claims"], wordCount: 600 },
    { heading: "Analysis", keyPoints: ["Interpretation and implications"], wordCount: 400 },
    { heading: "Limitations", keyPoints: ["Gaps and weaknesses"], wordCount: 200 },
    { heading: "Conclusion", keyPoints: ["Summary and recommendations"], wordCount: 200 },
  ];
  const sections = rawSections.slice(0, config.maxSections).map((s) => ({
    ...s,
    supportingEvidenceIds: (s.supportingEvidenceIds || []).filter((id) => citationVisibleEvidenceIds.has(id)),
    wordCount: clamp(s.wordCount || 300, 150, config.sectionMaxWords),
  }));
  const contradictionSectionIndex = contradictions.length > 0
    ? sections.findIndex((section) => /contradict|conflict|uncertain|limitation|gap/i.test(section.heading || ""))
    : -1;

  reportMarkdown += `# ${outlineJson?.title || `Research: ${ctx.clarifiedResearchQuestion || run.question}`}\n\n`;

  // Track section offsets for safe self-critique replacement (avoids fragile regex).
  const sectionOffsets = new Map<string, { start: number; end: number }>();

  for (let i = 0; i < sections.length; i++) {
    ctx.checkAbort();
    const section = sections[i];
    const sectionStep = await ctx.createStep("report", `Writing: ${section.heading}`, `Section ${i + 1} of ${sections.length}`);
    onEvent({ type: "report_progress", percent: 80 + Math.floor((i / sections.length) * 15) });

    const sectionEvidence = (section.supportingEvidenceIds || [])
      .map((id) => evidenceList.find((e) => e.id === id))
      .filter(Boolean)
      .map((e) => {
        const source = sources.find((s) => s.id === e!.sourceId);
        const sourceNumber = getSourceNumber(e!.sourceId, shownSources);
        return `Evidence: ${e!.content} (Citation: ${sourceNumber ? `[${sourceNumber}]` : "uncited-source"}, Source: ${source?.title || "Unknown"}, Confidence: ${e!.confidence})`;
      })
      .join("\n");

    const sectionClaims = (section.supportingClaimIds || [])
      .map((id) => claims.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => `Claim: ${c!.claim} (Status: ${c!.status}, Confidence: ${c!.confidence})`)
      .join("\n");

    const sectionPrompt = `Write section "${section.heading}" for a research report.

Research Question: ${ctx.clarifiedResearchQuestion || run.question}

Key Points to Cover:
${(section.keyPoints || []).map((p) => `- ${p}`).join("\n")}

${sectionEvidence ? `Supporting Evidence:\n${sectionEvidence}\n\n` : ""}
${sectionClaims ? `Related Claims:\n${sectionClaims}\n\n` : ""}
Evidence Packets Available for Citation:
${citationEvidenceSummary.slice(0, budget.sectionChars) || "No extracted evidence available."}


${contradictions.length > 0 ? `Known Contradictions and Resolutions:\n${contradictionsSummary}\n\n` : ""}

Requirements:
- Write in formal, objective academic tone
- Cite claims using only citation numbers [1] through [${maxCitationNumber}] from the evidence packets and source list below
- Do not cite a source unless a listed evidence packet supports the sentence
- Do not invent citation numbers outside that range
- Address uncertainties and conflicting evidence honestly
- Include specific statistics and quotes where available
- Target: ${section.wordCount || 300} words (do not exceed ${config.sectionMaxWords})

Sources (citation numbers [1]–[${maxCitationNumber}] only):
${sourceQualitySummary}

Output rules:
- Return ONLY polished report prose for this section
- Do NOT include the section heading
- Do NOT include planning notes, checklists, self-corrections, word-count commentary, citation-mapping notes, or instructions to yourself
- Do NOT output labels like "code", "Copy", "Drafting", or bullet lists of writing steps`;

    try {
      const sectionResult = await callResearchAi(
        [
          {
            role: "system",
            content: `You are an expert research writer. Write formal, well-cited, objective research sections in markdown. Output only final reader-facing prose — never chain-of-thought, planning, or meta-commentary.\n\n${getTemporalContext()}`,
          },
          { role: "user", content: sectionPrompt },
        ],
        signal,
        undefined,
        Math.max(1000, (section.wordCount || 300) * 2),
        { reasoningEnabled: config.synthesisReasoning, temperature: 0.4, ...ctx.researchAiOptions("main") },
      );
      if (sectionResult.tokens?.totalTokens) ctx.tokenUsage.input += sectionResult.tokens.totalTokens;

      const sectionResponse = prepareReportSection(sectionResult.text, maxCitationNumber);
      const wordCount = sectionResponse.split(/\s+/).filter(Boolean).length;
      if (sectionResponse) {
        const sectionStart = reportMarkdown.length;
        reportMarkdown += `## ${section.heading}\n\n`;
        reportMarkdown += sectionResponse;
        reportMarkdown += "\n\n";
        sectionOffsets.set(section.heading ?? "", { start: sectionStart, end: reportMarkdown.length });
      } else {
        const sectionStart = reportMarkdown.length;
        reportMarkdown += `## ${section.heading}\n\n*[Section content could not be generated]*\n\n`;
        sectionOffsets.set(section.heading ?? "", { start: sectionStart, end: reportMarkdown.length });
      }
      await ctx.completeStep(sectionStep, `${wordCount} words written`, sectionResult.tokens?.totalTokens);
    } catch (err) {
      console.warn("[research-runtime] Section writing failed:", section.heading, err);
      reportMarkdown += `\n\n*[Section generation failed for "${section.heading}"]*\n\n`;
      await ctx.failStep(sectionStep, getErrorMessage(err));
    }
  }

  // ── Self-Critique Pass (optional) ──────────────────────────────────────
  if (config.selfCritiquePass && reportMarkdown.trim().length > 0) {
    ctx.checkAbort();
    const critiqueStep = await ctx.createStep("report", "Self-critique and refinement", "Reviewing draft for gaps and weaknesses");
    onEvent({ type: "report_progress", percent: 92 });
    await ctx.updateRunStatus("synthesizing", 92);

    const rewriteCap = run.depth === "exhaustive" ? 4 : run.depth === "deep" ? 3 : run.depth === "standard" ? 2 : 1;

    try {
      const critiquePrompt = `You are a critical peer reviewer. Review this research draft and identify specific improvements.

Research Question: "${ctx.clarifiedResearchQuestion || run.question}"

Draft Report:
${reportMarkdown.slice(0, 12000)}

Evaluate:
1. Are there logical gaps or unsupported claims?
2. Is the structure clear and flowing well?
3. Are there weaker sections that need more evidence or better argumentation?
4. Are citations properly integrated?

Identify up to ${rewriteCap} sections that need rewriting most.

Return a JSON object:
{
  "overallScore": 1-10,
  "issues": [
    {"section": "section heading", "issue": "description", "severity": "high|medium|low", "fix": "specific suggestion"}
  ],
  "rewriteSections": ["section heading that needs rewriting"]
}`;

      const critiqueResult = await callResearchAi(
        [
          { role: "system", content: "You are a meticulous research peer reviewer. Return ONLY valid JSON." },
          { role: "user", content: critiquePrompt },
        ],
        signal,
        undefined,
        2000,
        { reasoningEnabled: config.synthesisReasoning, temperature: 0.3, ...ctx.researchAiOptions("main") },
      );

      if (critiqueResult.tokens?.totalTokens) ctx.tokenUsage.input += critiqueResult.tokens.totalTokens;

      // Parse critique
      const critiqueJsonMatch = critiqueResult.text.match(/\{[\s\S]*\}/);
      if (critiqueJsonMatch) {
        const critique = JSON.parse(critiqueJsonMatch[0]) as {
          overallScore?: number;
          issues?: Array<{ section: string; issue: string; severity: string; fix: string }>;
          rewriteSections?: string[];
        };

        // Rewrite flagged sections (cap scales with depth)
        const sectionsToRewrite = (critique.rewriteSections || []).slice(0, rewriteCap);
        if (sectionsToRewrite.length > 0) {
          for (const heading of sectionsToRewrite) {
            const sectionIndex = sections.findIndex((s) => s.heading === heading);
            if (sectionIndex === -1) continue;

            const section = sections[sectionIndex];
            const sectionIssues = (critique.issues || [])
              .filter((issue) => issue.section === heading)
              .map((issue) => `- ${issue.severity}: ${issue.issue} → ${issue.fix}`)
              .join("\n");

            const rewritePrompt = `Rewrite section "${heading}" for this research report, addressing these issues:

${sectionIssues || "Improve clarity, add more specific evidence, and strengthen argumentation."}

Research Question: "${ctx.clarifiedResearchQuestion || run.question}"

Key Points to Cover:
${(section.keyPoints || []).map((p) => `- ${p}`).join("\n")}

Requirements:
- Write in formal, objective academic tone
- Cite claims using citation numbers [1] through [${maxCitationNumber}]
- Target: ${section.wordCount || 300} words (do not exceed ${config.sectionMaxWords})

Sources:
${sourceQualitySummary}

Output: Return ONLY polished report prose. No headings, no meta-commentary.`;

            try {
              const rewriteResult = await callResearchAi(
                [
                  { role: "system", content: `You are an expert research writer. Rewrite sections for clarity, accuracy, and flow.\n\n${getTemporalContext()}` },
                  { role: "user", content: rewritePrompt },
                ],
                signal,
                undefined,
                Math.max(1000, (section.wordCount || 300) * 2),
                { reasoningEnabled: config.synthesisReasoning, temperature: 0.4, ...ctx.researchAiOptions("main") },
              );
              if (rewriteResult.tokens?.totalTokens) ctx.tokenUsage.input += rewriteResult.tokens.totalTokens;

              const rewritten = prepareReportSection(rewriteResult.text, maxCitationNumber);
                if (rewritten && rewritten.length > 100) {
                  // Replace the section using tracked offsets (avoids fragile regex).
                  const offsets = sectionOffsets.get(heading);
                  if (offsets) {
                    const newSection = `## ${heading}\n\n${rewritten}\n\n`;
                    reportMarkdown = reportMarkdown.slice(0, offsets.start) + newSection + reportMarkdown.slice(offsets.end);
                    // Recalculate all offsets after the replacement using matchAll
                    // (avoids lastIndex state bugs with exec() + g flag).
                    sectionOffsets.clear();
                    const headingMatches = [...reportMarkdown.matchAll(/^## (.+)$/gm)];
                    for (let i = 0; i < headingMatches.length; i++) {
                      const hStart = headingMatches[i].index;
                      const hEnd = i + 1 < headingMatches.length ? headingMatches[i + 1].index : reportMarkdown.length;
                      sectionOffsets.set(headingMatches[i][1], { start: hStart, end: hEnd });
                    }
                  }
                }
            } catch (rewriteErr) {
              console.warn("[research-runtime] Section rewrite failed:", heading, rewriteErr);
            }
          }
        }

        console.debug("[research-runtime] Self-critique:", {
          score: critique.overallScore,
          issuesFound: critique.issues?.length || 0,
          sectionsRewritten: sectionsToRewrite.length,
        });

        await ctx.completeStep(critiqueStep, `Score: ${critique.overallScore || "?"}/10, ${(critique.issues?.length || 0)} issues found, ${(sectionsToRewrite.length)} sections rewritten`);
      } else {
        await ctx.completeStep(critiqueStep, "Critique response not parseable, skipping refinement");
      }
    } catch (critiqueErr) {
      console.warn("[research-runtime] Self-critique failed:", critiqueErr);
      await ctx.failStep(critiqueStep, getErrorMessage(critiqueErr));
    }
  }

  if (contradictions.length > 0 && contradictionSectionIndex === -1) {
    reportMarkdown += `## Contradictions and Uncertainty\n\n`;
    reportMarkdown += contradictionsSummary;
    reportMarkdown += "\n\n";
  }

  // Extract body citations BEFORE adding Sources appendix
  const bodyMarkdown = reportMarkdown;
  const citationRegex = /\[(\d+)\]/g;
  const bodyCitedNumbers = new Set<number>();
  let match;
  while ((match = citationRegex.exec(reportMarkdown)) !== null) {
    bodyCitedNumbers.add(parseInt(match[1], 10));
  }

  // Build citation map from SHOWN sources (the ones the writer actually saw evidence for).
  // Citations referring to sources not in shownSources are flagged as "uncited" during audit.
  const readSources = shownSources;
  const citationMap: Record<string, string> = {};
  readSources.forEach((s, i) => {
    citationMap[String(i + 1)] = s.id;
  });

  // Add source list appendix
  reportMarkdown += `---\n\n## Sources\n\n`;
  readSources.forEach((s, i) => {
    reportMarkdown += `[${i + 1}] ${s.title}. Retrieved from: ${s.url}\n\n`;
  });

  // Recalculate word count before persisting
  const finalWordCount = reportMarkdown.split(/\s+/).filter(Boolean).length;

  console.debug("[research-runtime] Creating report:", {
    wordCount: finalWordCount,
    sourceCount: readSources.length,
    evidenceCount: evidenceList.length,
    bodyCitations: bodyCitedNumbers.size,
    markdownLength: reportMarkdown.length,
  });

  const reportInput: CreateResearchReportInput = {
    runId: run.id,
    title: outlineJson?.title || `Research: ${ctx.clarifiedResearchQuestion || run.question}`,
    contentMarkdown: reportMarkdown,
    citationMap,
    sourceIds: readSources.map((s) => s.id),
    evidenceIds: evidenceList.map((e) => e.id),
    wordCount: finalWordCount,
    format: "markdown",
  };

  const report = await store.createReport(reportInput);

  // Complete synthesize step NOW, before audit
  await ctx.completeStep(synthesizeStep, `Report: ${finalWordCount} words, ${sections.length} sections, ${evidenceList.length} evidence items cited`);
  onEvent({ type: "phase_complete", phase: "synthesize", stepId: synthesizeStep.id });

  // ── Phase 8.5: Citation Audit ───────────────────────────────────────────
  // Skip the whole audit when the report has no body citations — there's nothing to verify.
  if (bodyCitedNumbers.size === 0) {
    const skipAuditStep = await ctx.createStep("verify", "Auditing citations for accuracy");
    onEvent({ type: "phase_start", phase: "audit", stepId: skipAuditStep.id });
    onEvent({ type: "audit_progress", done: 0, total: 0 });
    await ctx.completeStep(skipAuditStep, "Skipped: no body citations in the report");
    onEvent({ type: "phase_complete", phase: "audit", stepId: skipAuditStep.id });
  } else {
  const allCitations = [...bodyCitedNumbers];
  const auditCap = config.auditMaxCitations;
  const citationsToAudit = auditCap > 0 ? allCitations.slice(0, auditCap) : allCitations;
  const skippedAudit = allCitations.length - citationsToAudit.length;

  ctx.checkAbort();
  const auditStep = await ctx.createStep("verify", "Auditing citations for accuracy");
  onEvent({ type: "phase_start", phase: "audit", stepId: auditStep.id });
  await ctx.updateRunStatus("verifying", 85);

  const auditResults: Array<{
    citationNumber: number;
    sourceId: string;
    sourceTitle: string;
    claimFound: boolean;
    supportingEvidence: string[];
    auditNotes: string;
  }> = [];

  let doneAudit = 0;
  const totalAudit = citationsToAudit.length;
  onEvent({ type: "audit_progress", done: 0, total: totalAudit });
  let lastApPct = -1;
  const emitAp = () => {
    const pct = totalAudit > 0 ? Math.floor((doneAudit / totalAudit) * 10) : 0;
    if (pct !== lastApPct) {
      lastApPct = pct;
      onEvent({ type: "audit_progress", done: doneAudit, total: totalAudit });
    }
  };

  async function auditOne(num: number, idx: number): Promise<void> {
    const sourceIndex = num - 1;
    const source = readSources[sourceIndex];
    if (!source) {
      auditResults.push({
        citationNumber: num,
        sourceId: "missing",
        sourceTitle: "Source not found",
        claimFound: false,
        supportingEvidence: [],
        auditNotes: "Citation number refers to a source the writer did not see evidence for",
      });
      return;
    }

    const citationContext = extractCitationContext(bodyMarkdown, num);
    const sourceEvidence = evidenceList.filter((e) => e.sourceId === source.id);
    const sourceContradictions = contradictions
      .filter((c) => {
        const claimA = claims.find((cl) => cl.id === c.claimAId);
        const claimB = claims.find((cl) => cl.id === c.claimBId);
        return claimA?.sourceId === source.id || claimB?.sourceId === source.id;
      })
      .map((c, i) => {
        const claimA = claims.find((cl) => cl.id === c.claimAId);
        const claimB = claims.find((cl) => cl.id === c.claimBId);
        return `Contradiction ${i + 1}: ${claimA?.claim || "N/A"} (${claimA?.status || "unknown"}) vs ${claimB?.claim || "N/A"} (${claimB?.status || "unknown"}). Resolution: ${c.resolution || "Unresolved"}`;
      })
      .join("\n")
      .slice(0, 2000);
    const evidenceText = sourceEvidence
      .map((e) => e.content)
      .join("\n")
      .slice(0, 3000);

    const auditPrompt = `You are a citation auditor. Verify that a cited source actually supports the claims made near its citation.

Citation [${num}] — ${source.title}
URL: ${source.url}

Claims in context near this citation:
${citationContext}

Evidence from this source:
${evidenceText || "No direct evidence extracted"}

Known contradictions involving this source:
${sourceContradictions || "None"}

Audit: Does this source actually support the claims cited? Answer ONLY with a JSON object:
{
  "claimFound": true|false,
  "supportingEvidence": ["exact evidence that supports the claim"],
  "auditNotes": "Brief explanation of whether the citation is accurate, exaggerated, unsupported, or cites a disputed/contradicted claim without acknowledging the contradiction"
}`;

    try {
      const { value: auditResponse } = await ctx.runAiStep(
        "verify",
        `Audit citation [${num}]`,
        `${source.title} (${idx + 1} of ${citationsToAudit.length})`,
        () =>
          callResearchAi(
            [
              { role: "system", content: `You are a citation auditor. Verify citations rigorously. Flag uncertainty and reasoning transparently. Return valid JSON only.\n\n${getTemporalContext()}` },
              { role: "user", content: auditPrompt },
            ],
            signal,
            undefined,
            2000,
            ctx.researchAiOptions("lite", {
              reasoningEnabled: config.auditReasoning,
              jsonModeHint: true,
            }),
          ),
        (v) => `${v.length} chars audited`,
      );

      const auditJson = safeJsonParse<{
        claimFound?: boolean;
        supportingEvidence?: string[];
        auditNotes?: string;
      }>(auditResponse);

      auditResults.push({
        citationNumber: num,
        sourceId: source.id,
        sourceTitle: source.title,
        claimFound: auditJson?.claimFound ?? false,
        supportingEvidence: auditJson?.supportingEvidence || [],
        auditNotes: auditJson?.auditNotes || "Audit inconclusive; citation needs manual review",
      });
    } catch (err) {
      auditResults.push({
        citationNumber: num,
        sourceId: source.id,
        sourceTitle: source.title,
        claimFound: false,
        supportingEvidence: [],
        auditNotes: "Audit failed; citation needs manual review: " + getErrorMessage(err),
      });
    }
  }

  // Bounded concurrent audit loop.
  const aconcurrency = Math.max(1, config.auditConcurrency);
  let aCursor = 0;
  async function aWorker() {
    while (aCursor < citationsToAudit.length) {
      ctx.checkAbort();
      const idx = aCursor++;
      const num = citationsToAudit[idx];
      if (typeof num !== "number") break;
      await auditOne(num, idx);
      doneAudit++;
      emitAp();
      onEvent({ type: "report_progress", percent: 85 + Math.floor((doneAudit / Math.max(totalAudit, 1)) * 10) });
    }
  }
  const aWorkers = Array.from({ length: Math.min(aconcurrency, citationsToAudit.length) }, () => aWorker());
  await Promise.all(aWorkers);
  onEvent({ type: "audit_progress", done: doneAudit, total: totalAudit });

  // Mark unsupported citations in the report
  const unsupportedCitations = auditResults.filter((a) => !a.claimFound);
  let auditedReportMarkdown = reportMarkdown;
  if (unsupportedCitations.length > 0) {
    const sourcesMarker = "\n---\n\n## Sources";
    const markerIndex = reportMarkdown.indexOf(sourcesMarker);
    let reportBody = markerIndex === -1 ? reportMarkdown : reportMarkdown.slice(0, markerIndex);
    const reportTail = markerIndex === -1 ? "" : reportMarkdown.slice(markerIndex);
    for (const audit of unsupportedCitations) {
      const citationPattern = new RegExp(`\\[${audit.citationNumber}\\](?!\\s*\\(citation flagged\\))`, "g");
      reportBody = reportBody.replace(citationPattern, `[${audit.citationNumber}] (citation flagged)`);
    }
    auditedReportMarkdown = `${reportBody}${reportTail}`;
  }
  const auditNotes = unsupportedCitations.length > 0
    ? unsupportedCitations
        .map((a) => `- [${a.citationNumber}] ${a.sourceTitle}: ${a.auditNotes}`)
        .join("\n")
    : "No audited citations were flagged.";

  const auditDetail = `Audited ${auditResults.length} citations, ${unsupportedCitations.length} flagged` +
    (skippedAudit > 0 ? ` (${skippedAudit} citations skipped due to cap)` : "") +
    (unsupportedCitations.length > 0 ? `\n\n${auditNotes}` : "");
  const auditAppendix = `---\n\n## Citation Audit\n\n${unsupportedCitations.length > 0 ? "Unsupported citations were marked inline as `(citation flagged)`.\n\n" : ""}${auditDetail}\n`;
  await store.updateReport({
    id: report.id,
    contentMarkdown: `${auditedReportMarkdown}\n${auditAppendix}`,
    wordCount: `${auditedReportMarkdown}\n${auditAppendix}`.split(/\s+/).filter(Boolean).length,
  });
  await ctx.completeStep(auditStep, auditDetail);
  onEvent({ type: "phase_complete", phase: "audit", stepId: auditStep.id });
  } // end of audit-when-citations-exist

  onEvent({ type: "report_complete", reportId: report.id });
}
