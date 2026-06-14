import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

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
): Promise<FetchedPage[]> {
  const cacheDir = await cacheDirPath();
  return invoke<FetchedPage[]>("fetch_and_extract_pages", {
    urls,
    concurrency,
    timeoutSecs,
    maxCharsPerSource,
    cacheDir,
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
