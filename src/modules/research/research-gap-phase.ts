import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import type { ResearchSource } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { callResearchAi, getTemporalContext } from "./research-ai";
import { safeJsonParse } from "./research-json-utils";
import { guessSourceType } from "./research-source-utils";
import { fetchAndReadSources } from "./research-read-phase";
import { validateSources, runClaimVerificationPass } from "./research-verify-phase";
import { extractFromSourcesBatch } from "./research-extract-phase";

export async function gapPhase(
  ctx: ResearchRuntimeContext,
  activeSources: ResearchSource[],
): Promise<void> {
  const { run, config, signal, store, sources, claims, onEvent } = ctx;

  if (!config.gapAnalysis || claims.length === 0) return;

  ctx.checkAbort();
  const gapStep = await ctx.createStep("search", "Gap analysis and follow-up search");
  onEvent({ type: "phase_start", phase: "gap", stepId: gapStep.id });
  await ctx.updateRunStatus("searching", 72);

  const directSearchSources = {
    directArxivSearch: config.directArxivSearch,
    directWikipediaSearch: config.directWikipediaSearch,
  };

  const claimsText = claims
    .map((c, i) => `${i + 1}. [${c.status}] ${c.claim} (confidence: ${c.confidence})`)
    .join("\n");

  const sourcesText = activeSources
    .map((s, i) => `${i + 1}. ${s.title} (${s.url})`)
    .join("\n");

  const gapQueryCap = run.depth === "exhaustive" ? 5 : run.depth === "deep" ? 3 : run.depth === "standard" ? 2 : 0;

  const gapPrompt = `You are a research strategist. Analyze what information is MISSING or INSUFFICIENTLY COVERED.

Research Question: ${ctx.clarifiedResearchQuestion || run.question}

Current Claims:
${claimsText}

Current Sources:
${sourcesText}

Identify:
1. What important aspects of the question are NOT covered by current claims?
2. What types of sources are missing? (e.g., academic studies, government data, recent news, industry reports)
3. Generate up to ${gapQueryCap} specific search queries to fill these gaps.

Return ONLY a JSON object:
{
  "gaps": ["missing aspect 1", "missing aspect 2"],
  "missingSourceTypes": ["academic", "government", "news"],
  "followUpQueries": ["specific query 1", "specific query 2"]
}`;

  const { value: gapResponse } = await ctx.runAiStep(
    "search",
    "Identify research gaps",
    `Analyze coverage across ${claims.length} claims and ${activeSources.length} sources`,
    () =>
      callResearchAi(
        [
          { role: "system", content: `You are a research strategist. Identify information gaps carefully. Return valid JSON only.\n\n${getTemporalContext()}` },
          { role: "user", content: gapPrompt },
        ],
        signal,
        undefined,
        3000,
        { reasoningEnabled: config.synthesisReasoning, jsonModeHint: true, temperature: 0.5, ...ctx.researchAiOptions("main") },
      ),
    (v) => `${v.length} chars analyzed`,
  );

  const gapJson = safeJsonParse<{
    gaps?: string[];
    missingSourceTypes?: string[];
    followUpQueries?: string[];
  }>(gapResponse);

  const gapContextText = [
    gapJson?.gaps?.length ? `Missing coverage: ${gapJson.gaps.join("; ")}` : "",
    gapJson?.missingSourceTypes?.length ? `Needed source types: ${gapJson.missingSourceTypes.join(", ")}` : "",
  ].filter(Boolean).join("\n") || "";

  const followUpQueries = gapJson?.followUpQueries || [];
  const discoveredUrls = new Set<string>(sources.map((s) => s.url));
  const followUpSources: ResearchSource[] = [];
  let added = 0;

  for (const query of followUpQueries.slice(0, gapQueryCap)) {
    ctx.checkAbort();
    if (sources.length >= config.maxSources) break;

    try {
      const bundle = await runSearch(query, {
        signal,
        skipFetch: true,
        speedPreset: "normal",
        ...directSearchSources,
      });
      for (const src of bundle.sources) {
        if (discoveredUrls.has(src.url)) continue;
        if (sources.length >= config.maxSources) break;
        discoveredUrls.add(src.url);
        added++;

        const source = await store.createSource({
          runId: run.id,
          stepId: gapStep.id,
          url: src.url,
          title: src.title,
          snippet: src.snippet,
          sourceType: guessSourceType(src.url),
          engine: run.searchProvider ?? "searxng",
          score: src.score ?? 0,
          rank: src.rank ?? (sources.length + 1),
          ...(src.fetch?.status ? { fetchStatus: src.fetch.status } : {}),
        });
        sources.push(source);
        followUpSources.push(source);
      }
    } catch (err) {
      ctx.captureSearchError(err);
      console.warn("[research-runtime] Follow-up search failed:", query, err);
    }
  }

  if (followUpSources.length > 0) {
    await fetchAndReadSources(ctx, followUpSources);

    const readFollowUps = followUpSources
      .map((source) => sources.find((s) => s.id === source.id) ?? source)
      .filter((s) => s.status === "read");
    if (readFollowUps.length > 0) {
      ctx.checkAbort();
      const validatedFollowUps = await validateSources(ctx, readFollowUps, { updateRunStatus: false, progressStartPercent: 72 });
      if (validatedFollowUps.length > 0) {
        const followUpClaimIds = new Set(claims.map((claim) => claim.id));
        const followUpSourceIds = new Set(validatedFollowUps.map((source) => source.id));
        await extractFromSourcesBatch(ctx, validatedFollowUps, gapStep.id, true, gapContextText);

        const newFollowUpClaims = claims.filter((claim) => !followUpClaimIds.has(claim.id) && followUpSourceIds.has(claim.sourceId));
        if (newFollowUpClaims.length > 0) {
          await runClaimVerificationPass(ctx, newFollowUpClaims);
        }
      }
    }
  }

  await ctx.completeStep(gapStep, `Gap analysis: ${gapJson?.gaps?.length || 0} gaps, ${added} follow-up sources added and processed`);
  onEvent({ type: "phase_complete", phase: "gap", stepId: gapStep.id });
}
