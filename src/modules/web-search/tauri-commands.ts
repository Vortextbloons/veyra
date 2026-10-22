import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { FetchStatus as BaseFetchStatus } from "@/lib/fetch-status";

const inflightDirectSearches = new Map<string, Promise<unknown>>();

function dedupedDirectInvoke<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflightDirectSearches.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    inflightDirectSearches.delete(key);
  });
  inflightDirectSearches.set(key, pending);
  return pending;
}

export type TauriSearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  engine: string;
  score: number;
  published_at: string | null;
};

export type TauriSearchResponse = {
  query: string;
  results: TauriSearchResult[];
  result_count: number;
  engine: string;
  degraded: boolean;
};

export type SearchEngineStatusKind = "stopped" | "starting" | "ready" | "failed";

export type SearchEngineStatus = {
  state: SearchEngineStatusKind;
  version: string;
  url: string | null;
  message: string | null;
  logPath: string;
};

export async function invokeWebSearch(
  query: string,
  limit: number,
  intent?: string,
): Promise<TauriSearchResponse> {
  return invoke<TauriSearchResponse>("web_search", {
    query,
    limit,
    intent: intent ?? null,
  });
}

export async function invokeGetSearchEngineStatus(): Promise<SearchEngineStatus> {
  return invoke<SearchEngineStatus>("get_search_engine_status");
}

export async function invokeRestartSearchEngine(): Promise<SearchEngineStatus> {
  return invoke<SearchEngineStatus>("restart_search_engine");
}

export async function invokeStopSearchEngine(): Promise<void> {
  return invoke<void>("stop_search_engine");
}

export async function invokeGetSearchEngineLogs(): Promise<string> {
  return invoke<string>("get_search_engine_logs");
}

export type FetchStatus = BaseFetchStatus;

export type FetchedPage = {
  url: string;
  status: FetchStatus | string;
  title: string | null;
  content: string | null;
  error_reason: string | null;
  source_type?: string | null;
  extraction_method?: string | null;
  via_wayback?: boolean | null;
  char_count?: number | null;
};

export type WebFetchCacheStats = {
  entries: number;
  total_bytes: number;
};

async function cacheDirPath(): Promise<string> {
  const dir = await appDataDir();
  return await join(dir, "web_fetch_cache");
}

export async function invokeFetchAndExtractPages(
  urls: string[],
  concurrency: number,
  timeoutSecs: number,
  maxCharsPerSource: number,
  options?: {
    advancedSearchBundleEnabled?: boolean;
    waybackFallbackEnabled?: boolean;
  },
): Promise<FetchedPage[]> {
  const cacheDir = await cacheDirPath();
  return invoke<FetchedPage[]>("fetch_and_extract_pages", {
    urls,
    concurrency,
    timeoutSecs,
    maxCharsPerSource,
    cacheDir,
    advancedSearchBundleEnabled: options?.advancedSearchBundleEnabled ?? null,
    waybackFallbackEnabled: options?.waybackFallbackEnabled ?? null,
  });
}

export async function invokeClearWebFetchCache(): Promise<void> {
  const cacheDir = await cacheDirPath();
  return invoke("clear_web_fetch_cache", { cacheDir });
}

export async function invokeGetWebFetchCacheStats(): Promise<WebFetchCacheStats> {
  const cacheDir = await cacheDirPath();
  return invoke<WebFetchCacheStats>("get_web_fetch_cache_stats", { cacheDir });
}

// ── ArXiv Search ──────────────────────────────────────────────────────────

export type ArxivResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  authors: string;
  published: string;
  updated: string;
  summary: string;
};

export type ArxivSearchResponse = {
  query: string;
  results: ArxivResult[];
  result_count: number;
};

export async function invokeSearchArxiv(
  query: string,
  limit: number,
): Promise<ArxivSearchResponse> {
  return dedupedDirectInvoke(`arxiv:${limit}:${query.trim().toLowerCase()}`, () =>
    invoke<ArxivSearchResponse>("search_arxiv", { query, limit }),
  );
}

// ── Wikipedia Search ──────────────────────────────────────────────────────

export type WikipediaResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  extract: string;
};

export type WikipediaSearchResponse = {
  query: string;
  results: WikipediaResult[];
  result_count: number;
};

export async function invokeSearchWikipedia(
  query: string,
  limit: number,
): Promise<WikipediaSearchResponse> {
  return dedupedDirectInvoke(`wikipedia:${limit}:${query.trim().toLowerCase()}`, () =>
    invoke<WikipediaSearchResponse>("search_wikipedia", { query, limit }),
  );
}
