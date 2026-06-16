import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

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
};

export type TauriSearchResponse = {
  query: string;
  results: TauriSearchResult[];
  result_count: number;
  searxng_url: string;
};

export async function invokeSearchSearxng(
  baseUrl: string,
  query: string,
  limit: number,
  allowExternal = true,
  options?: {
    timeRange?: string;
    categories?: string;
    safeSearch?: number;
    language?: string;
  },
): Promise<TauriSearchResponse> {
  return invoke<TauriSearchResponse>("web_search_searxng", {
    baseUrl,
    query,
    limit,
    allowExternal,
    timeRange: options?.timeRange || null,
    categories: options?.categories || null,
    safeSearch: options?.safeSearch ?? null,
    language: options?.language || null,
  });
}

export async function invokeTestSearxngConnection(
  baseUrl: string,
): Promise<boolean> {
  return invoke<boolean>("test_searxng_connection", { baseUrl });
}

export type FetchStatus =
  | "ok"
  | "timeout"
  | "http"
  | "extraction"
  | "network"
  | "ssrf_blocked"
  | "too_large"
  | "unsupported"
  | "invalid_url";

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
  options?: { advancedSearchBundleEnabled?: boolean },
): Promise<FetchedPage[]> {
  const cacheDir = await cacheDirPath();
  return invoke<FetchedPage[]>("fetch_and_extract_pages", {
    urls,
    concurrency,
    timeoutSecs,
    maxCharsPerSource,
    cacheDir,
    advancedSearchBundleEnabled: options?.advancedSearchBundleEnabled ?? null,
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
