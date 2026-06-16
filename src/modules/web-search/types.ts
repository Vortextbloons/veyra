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
  safeSearch?: number;
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
  status: string;
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
  fetch?: {
    status: string;
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
  };
};
