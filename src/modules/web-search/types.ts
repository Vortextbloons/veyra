import type { FetchStatus } from "@/lib/fetch-status";

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
  intent?: SearchIntent;
  language?: string;
  categories?: string;
  engines?: string;
  timeRange?: SearchTimeRange;
  safeSearch?: 0 | 1 | 2;
  page?: number;
};

export type SearchIntent =
  | "general"
  | "news"
  | "academic"
  | "code"
  | "documentation"
  | "local"
  | "discussion";

export type SearchTimeRange = "day" | "week" | "month" | "year";

export type SearxCapabilities = {
  engines: Array<{
    name: string;
    shortcut: string;
    categories: string[];
    enabled: boolean;
  }>;
  categories: string[];
  locales: string[];
  safeSearch: 0 | 1 | 2;
  fetchedAt: number;
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
  sourceType?: "webpage" | "docs" | "news" | "github" | "wikipedia" | "pdf" | "forum" | "package" | "arxiv" | "epub" | "docx" | "pptx" | "xlsx";
};

export type FetchedPageSummary = {
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

export type SearchSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  providerId?: string;
  engine?: string;
  sourceType?: SearchResult["sourceType"];
  publishedAt?: string;
  score?: number;
  rank?: number;
  rankScore?: number;
  rankReason?: string;
  queryLane?: string;
  passages?: SearchPassage[];
  fetch?: {
    status: FetchStatus | string;
    error_reason?: string;
    extraction_method?: string;
    via_wayback?: boolean;
    char_count?: number;
    source_type?: string;
  };
};

export type SearchContextBundle = {
  query: string;
  summary: string;
  sources: SearchSource[];
  tokenCount: number;
  fetchedPages?: FetchedPageSummary[];
  diagnostics?: {
    queries: Array<{ query: string; lane: string }>;
    providerResultCounts: Record<string, number>;
    fused: boolean;
    fallbackUsed: boolean;
    freshnessBoosted?: boolean;
    qualityFiltered?: boolean;
    capabilitiesAvailable?: boolean;
    routedCategories?: string[];
    routedEngines?: string[];
  };
};

export type SearchPassage = {
  sourceId: string;
  heading?: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  lexicalScore: number;
  finalScore: number;
};
