import { invokeFetchAndExtractPages, type FetchedPage } from "@/modules/web-search/tauri-commands";
import { evidenceCache } from "./evidence-cache";
import { updateResearchSourceAfterFetch } from "./research-storage";
import type { ResearchSource, ResearchSourceStatus } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { mapFetchedPageToSource, nowIso } from "./research-source-utils";
import { getErrorMessage } from "./research-json-utils";

const RESEARCH_FETCH_TIMEOUT_SECS = 15;
const RESEARCH_FETCH_MAX_CHARS = 50_000;
const RESEARCH_FETCH_CONCURRENCY = 3;

export async function fetchAndReadSources(ctx: ResearchRuntimeContext, sourceBatch: ResearchSource[]): Promise<void> {
  const { store, sources, onEvent } = ctx;

  const discoveredSources = sourceBatch.filter((s) => s.status === "discovered");

  if (discoveredSources.length > 0) {
    // Check cache first — avoid redundant fetches
    const cachedPages: FetchedPage[] = [];
    const uncachedUrls: string[] = [];
    for (const source of discoveredSources) {
      const cached = evidenceCache.get(source.url);
      if (cached) {
        cachedPages.push(...cached as FetchedPage[]);
      } else {
        uncachedUrls.push(source.url);
      }
    }

    const pages: FetchedPage[] = [...cachedPages];
    if (uncachedUrls.length > 0) {
      try {
        const fetched = await invokeFetchAndExtractPages(
          uncachedUrls,
          RESEARCH_FETCH_CONCURRENCY,
          RESEARCH_FETCH_TIMEOUT_SECS,
          RESEARCH_FETCH_MAX_CHARS,
          { advancedSearchBundleEnabled: ctx.bundleEnabled },
        );
        // Cache the newly fetched pages
        for (const page of fetched) {
          evidenceCache.set(page.url, [page]);
        }
        pages.push(...fetched);
      } catch (bulkErr) {
        console.warn("[research-runtime] Bulk fetch threw, treating all sources as failed:", bulkErr);
        for (const source of discoveredSources) {
          if (uncachedUrls.includes(source.url)) {
            ctx.checkAbort();
            await store.updateSource({
              id: source.id,
              status: "failed" as ResearchSourceStatus,
              error: getErrorMessage(bulkErr),
            });
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) {
              sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: getErrorMessage(bulkErr) };
            }
          }
        }
        return;
      }
    }

    const pageByUrl = new Map<string, FetchedPage>();
    for (const page of pages) {
      pageByUrl.set(page.url, page);
    }

    for (const source of discoveredSources) {
      ctx.checkAbort();
      const page = pageByUrl.get(source.url);
      if (!page) {
        await store.updateSource({
          id: source.id,
          status: "failed" as ResearchSourceStatus,
          error: "No fetch result returned",
        });
        const idx = sources.findIndex((s) => s.id === source.id);
        if (idx !== -1) {
          sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: "No fetch result returned" };
        }
        continue;
      }

      try {
        const fetched = mapFetchedPageToSource(page);
        const updated = await updateResearchSourceAfterFetch(source.id, fetched);
        const withFetchMeta = {
          ...updated,
          fetchStatus: page.status,
        };
        const idx = sources.findIndex((s) => s.id === source.id);
        if (idx !== -1) sources[idx] = withFetchMeta;
        store.syncSource(withFetchMeta);
        onEvent({ type: "source_fetched", sourceId: withFetchMeta.id, title: withFetchMeta.title });
      } catch (updateErr) {
        console.warn("[research-runtime] Update after fetch failed:", source.url, updateErr);
        await store.updateSource({
          id: source.id,
          status: "failed" as ResearchSourceStatus,
          error: getErrorMessage(updateErr),
        });
      }
    }
  }

  for (const source of sourceBatch) {
    ctx.checkAbort();
    const current = sources.find((s) => s.id === source.id) ?? source;
    if (current.status === "fetched") {
      const readAt = nowIso();
      const readSource = await store.updateSource({
        id: current.id,
        status: "read" as ResearchSourceStatus,
        readAt,
      });
      const idx = sources.findIndex((s) => s.id === current.id);
      if (idx !== -1) {
        sources[idx] = readSource;
      }
    }
  }
}

export async function readPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<void> {
  const { sources, onEvent } = ctx;

  ctx.checkAbort();
  const readStep = await ctx.createStep("read", "Fetching and reading sources");
  onEvent({ type: "phase_start", phase: "read", stepId: readStep.id });
  await ctx.updateRunStatus("reading", 35);

  const pendingReadSources = sources.filter((s) => s.status === "discovered" || s.status === "fetched");
  if (resumeFromPhase && resumeFromPhase !== "read" && pendingReadSources.length === 0 && sources.some((s) => s.status === "read")) {
    console.info("[research-runtime] Resume reusing persisted read sources");
  } else {
    await fetchAndReadSources(ctx, sources);
  }

  const readCount = sources.filter((s) => s.status === "read").length;
  await ctx.completeStep(readStep, `Read ${readCount} of ${sources.length} sources`);
  onEvent({ type: "phase_complete", phase: "read", stepId: readStep.id });
}
