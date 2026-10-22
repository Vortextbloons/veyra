# Web Search Key Types

From `src/modules/web-search/types.ts`:

```typescript
type SearchInput = {
  query: string;
  limit?: number;
  intent?: SearchIntent;
};

type SearchIntent =
  | "general"
  | "news"
  | "academic"
  | "code"
  | "documentation"
  | "local"
  | "discussion";

interface SearchProvider {
  id: string;
  name: string;
  type: "donsetch" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
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
    degraded?: boolean;
  };
};
```

## Engine status types

From `src/modules/web-search/tauri-commands.ts`:

```typescript
type SearchEngineStatusKind = "stopped" | "starting" | "ready" | "failed";

type SearchEngineStatus = {
  state: SearchEngineStatusKind;
  version: string;
  url: string | null;
  message: string | null;
  logPath: string;
};
```

## Intent mapping

| Veyra intent | DonSeTch intent |
|--------------|-----------------|
| `general` | `web` |
| `news` | `news` |
| `academic` | `paper` |
| `code` | `code` |
| `documentation` | `code` |
| `local` | `web` |
| `discussion` | `web` |
