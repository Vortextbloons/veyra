export interface SearchProvider {
  id: string;
  name: string;
  type: "searxng" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
  testConnection?(): Promise<boolean>;
}

export type SearchInput = {
  query: string;
  limit?: number;
  language?: string;
  categories?: string;
  timeRange?: string;
};

export type SearXNGProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  defaultCategory?: "general" | "news" | "images" | "science" | "it";
  jsonEnabled: boolean;
  timeoutMs: number;
  maxResults: number;
};

export type SearchResult = {
  id: string;
  title: string;
  url: string;
  displayUrl?: string;
  snippet?: string;
  providerId: string;
  engine?: string;
  publishedAt?: string;
  fetchedAt?: string;
  score?: number;
  rank?: number;
  sourceType?: "webpage" | "docs" | "news" | "github" | "wikipedia" | "pdf" | "forum" | "package";
};

export type SearchContextBundle = {
  query: string;
  summary: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    snippet: string;
  }>;
  tokenCount: number;
};
