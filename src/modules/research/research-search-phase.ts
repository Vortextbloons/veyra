import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import type { SearchContextBundle } from "@/modules/web-search/types";
import { runWithConcurrency } from "@/lib/async-pool";
import type { CreateResearchSourceInput, ResearchPlanStep } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { guessSourceType } from "./research-source-utils";

const RESEARCH_SEARCH_CONCURRENCY = 6;
const RESEARCH_SOURCE_CREATE_CONCURRENCY = 8;

type SearchQueryOutcome = {
  query: string;
  bundle: SearchContextBundle | null;
  error: string | null;
};

async function runResearchSearchesInParallel(
  queries: string[],
  signal: AbortSignal,
  onError: (err: unknown) => string,
  directSources: { directArxivSearch: boolean; directWikipediaSearch: boolean },
): Promise<SearchQueryOutcome[]> {
  return runWithConcurrency(queries, RESEARCH_SEARCH_CONCURRENCY, async (query) => {
    if (signal.aborted) {
      return { query, bundle: null, error: "Aborted" };
    }
    try {
      const bundle = await runSearch(query, {
        signal,
        skipFetch: true,
        directArxivSearch: directSources.directArxivSearch,
        directWikipediaSearch: directSources.directWikipediaSearch,
      });
      return { query, bundle, error: null };
    } catch (err) {
      return { query, bundle: null, error: onError(err) };
    }
  });
}

export async function searchPhase(
  ctx: ResearchRuntimeContext,
  planSteps: ResearchPlanStep[],
  resumeFromPhase?: string,
): Promise<void> {
  const { run, config, signal, store, onEvent, sources } = ctx;

  ctx.checkAbort();
  const searchRoundLimit = Math.min(planSteps.length, config.maxSearchRounds);
  const discoveredUrls = new Set<string>(sources.map((s) => s.url));

  const directSearchSources = {
    directArxivSearch: config.directArxivSearch,
    directWikipediaSearch: config.directWikipediaSearch,
  };

  if (resumeFromPhase && resumeFromPhase !== "search" && sources.length > 0) {
    console.info(`[research-runtime] Resume reusing ${sources.length} persisted sources`);
  } else for (let round = 0; round < searchRoundLimit; round++) {
    const planStepItem = planSteps[round];
    const searchStep = await ctx.createStep("search", `Search Round ${round + 1}: ${planStepItem.title}`);
    onEvent({ type: "phase_start", phase: "search", stepId: searchStep.id });
    await ctx.updateRunStatus("searching", 10 + round * 8);

    const queries = planStepItem.searchQueries || [];
    let roundDiscovered = 0;
    const roundQueryErrors: string[] = [];

    const queriesToRun: string[] = [];
    for (const query of queries) {
      ctx.checkAbort();
      if (sources.length >= config.maxSources) break;
      queriesToRun.push(query);
      ctx.searchQueriesUsed.push(query);
    }

    const searchOutcomes = await runResearchSearchesInParallel(
      queriesToRun,
      signal,
      ctx.captureSearchError,
      directSearchSources,
    );

    for (const outcome of searchOutcomes) {
      ctx.checkAbort();
      if (sources.length >= config.maxSources) break;

      if (outcome.error || !outcome.bundle) {
        if (outcome.error && outcome.error !== "Aborted") {
          roundQueryErrors.push(`"${outcome.query}": ${outcome.error}`);
          console.warn("[research-runtime] Search failed for query:", outcome.query, outcome.error);
        }
        continue;
      }

      const pendingSources: CreateResearchSourceInput[] = [];
      for (const src of outcome.bundle.sources) {
        if (discoveredUrls.has(src.url)) continue;
        if (sources.length + pendingSources.length >= config.maxSources) break;
        if (roundDiscovered + pendingSources.length >= config.maxSourcesPerRound) break;
        discoveredUrls.add(src.url);
        pendingSources.push({
          runId: run.id,
          stepId: searchStep.id,
          url: src.url,
          title: src.title,
          snippet: src.snippet,
          sourceType: guessSourceType(src.url),
          engine: run.searchProvider ?? "searxng",
          score: src.score ?? 0,
          rank: src.rank ?? (sources.length + pendingSources.length + 1),
          ...(src.fetch?.status ? { fetchStatus: src.fetch.status } : {}),
        });
      }

      if (pendingSources.length > 0) {
        const created = await runWithConcurrency(
          pendingSources,
          RESEARCH_SOURCE_CREATE_CONCURRENCY,
          (input) => store.createSource(input),
        );
        for (const source of created) {
          sources.push(source);
          roundDiscovered++;
          onEvent({ type: "source_fetched", sourceId: source.id, title: source.title });
        }
      }

      onEvent({
        type: "search_complete",
        query: outcome.query,
        sourceCount: outcome.bundle.sources.length,
      });
    }

    if (roundQueryErrors.length > 0 && roundDiscovered === 0) {
      await ctx.failStep(searchStep, roundQueryErrors.join("; "));
    } else {
      const detail = `Discovered ${roundDiscovered} sources (total: ${sources.length})`;
      const errSuffix = roundQueryErrors.length > 0 ? ` (${roundQueryErrors.length} of ${queries.length} queries failed)` : "";
      await ctx.completeStep(searchStep, `${detail}${errSuffix}`);
    }
    onEvent({ type: "phase_complete", phase: "search", stepId: searchStep.id });

    // Adaptive deepening: if we have few sources, try broader queries
    if (config.adaptiveDeepening && sources.length < config.maxSources && round === searchRoundLimit - 1) {
      const adaptiveStep = await ctx.createStep("search", "Adaptive search: broadening queries");
      const broadQuery = `${run.question} overview comprehensive guide`;
      try {
        const bundle = await runSearch(broadQuery, {
          signal,
          skipFetch: true,
          ...directSearchSources,
        });
        let added = 0;
        for (const src of bundle.sources) {
          if (discoveredUrls.has(src.url)) continue;
          if (sources.length >= config.maxSources) break;
          discoveredUrls.add(src.url);
          added++;

          const source = await store.createSource({
            runId: run.id,
            stepId: adaptiveStep.id,
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
        }
        await ctx.completeStep(adaptiveStep, `Adaptive: ${added} additional sources`);
      } catch (err) {
        const msg = ctx.captureSearchError(err);
        await ctx.failStep(adaptiveStep, msg);
      }
    }
  }

  if (sources.length === 0) {
    const provider = run.searchProvider ?? "searxng";
    throw new Error(
      ctx.firstSearchError
        ? `No sources found using search provider "${provider}". ${ctx.firstSearchError}`
        : `No sources found using search provider "${provider}". Check that ${provider} is running and accessible, or pick a different search provider.`,
    );
  }
}
