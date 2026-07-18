# Web Search Key Types

From `src/modules/web-search/types.ts`:

```typescript
type SearchInput = {
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

type SearchIntent =
  | "general"
  | "news"
  | "academic"
  | "code"
  | "documentation"
  | "local"
  | "discussion";

type SearchTimeRange = "day" | "week" | "month" | "year";

type SearxCapabilities = {
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

interface SearchProvider {
  id: string;
  name: string;
  type: "searxng" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
  testConnection?(): Promise<boolean>;
}

type SearchResult = {
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
  sourceType?:
    | "webpage" | "docs" | "news" | "github" | "wikipedia"
    | "pdf" | "forum" | "package" | "arxiv" | "epub"
    | "docx" | "pptx" | "xlsx";
};

type SearchSource = {
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

type SearchPassage = {
  sourceId: string;
  heading?: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  lexicalScore: number;
  finalScore: number;
};

type SearchContextBundle = {
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

type FetchedPageSummary = {
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
```

## Search Lanes

| Lane | Purpose |
|------|---------|
| `general` | Standard search |
| `recent` | Current year filter |
| `academic` | Scholarly sources |
| `primary` | Government/data sources |
| `opposing` | Criticism/limitations |

## Search Intents

| Intent | Categories | Engine Hints |
|--------|-----------|--------------|
| `general` | general | wikipedia |
| `news` | news | — |
| `academic` | science | arxiv, pubmed, semantic scholar, openalex |
| `code` | it | github, stackoverflow |
| `documentation` | it | github, stackoverflow |
| `local` | map | openstreetmap |
| `discussion` | general, social media | reddit |
