import { invoke } from "@tauri-apps/api/core";

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
): Promise<TauriSearchResponse> {
  return invoke<TauriSearchResponse>("web_search_searxng", {
    baseUrl,
    query,
    limit,
  });
}

export async function invokeTestSearxngConnection(
  baseUrl: string,
): Promise<boolean> {
  return invoke<boolean>("test_searxng_connection", { baseUrl });
}
