# Web Search Module

Optional web search capability via SearXNG (Docker) with direct ArXiv and Wikipedia API support. Used by both the chat tool and the research pipeline.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/web-search/types.ts` | Type definitions |
| `src/modules/web-search/orchestrator/SearchOrchestrator.ts` | Main search orchestrator |
| `src/modules/web-search/search-planner.ts` | Multi-query generation |
| `src/modules/web-search/search-ranker.ts` | Result deduplication and ranking |
| `src/modules/web-search/searxng-setup.ts` | Docker setup for SearXNG |
| `src/modules/web-search/providers/` | Provider implementations |
| `src/modules/web-search/tauri-commands.ts` | Tauri IPC for page fetching |

## Providers

| Provider | Description |
|----------|-------------|
| SearXNG | Self-hosted search via Docker container |
| ArXiv | Direct ArXiv API for academic papers |
| Wikipedia | Direct Wikipedia API |

## SearXNG Setup

### Requirements
- Docker Desktop installed and running
- SearXNG Docker container

### Auto-Setup
1. `searxng-setup.ts` checks Docker installation and daemon status
2. If the SearXNG container exists, it's auto-started
3. If not, Docker pulls and creates the container
4. The SearXNG URL must be **localhost** (SSRF protection)

### Security
- SearXNG URL is validated to be localhost-only
- Prevents server-side request forgery (SSRF) attacks

## How Search Works

### 1. Query Planning (`search-planner.ts`)
Generates multiple search queries from a single user query across different lanes:

| Lane | Purpose | Example |
|------|---------|---------|
| General | Standard search | "quantum computing applications" |
| Recent | Current year filter | "quantum computing 2025 applications" |
| Academic | Scholarly sources | "quantum computing applications research paper" |
| Primary | Government/data sources | "quantum computing applications site:gov" |
| Opposing | Criticism/limitations | "quantum computing limitations problems" |

### 2. Concurrent Execution
- Queries are executed concurrently (max 3 at a time)
- Each query hits the SearXNG API
- Results are collected and merged

### 3. Deduplication and Ranking (`search-ranker.ts`)
- Results are deduplicated by URL
- Ranked by relevance to the original query
- Source diversity is encouraged

### 4. Page Fetching
- Top results are fetched via Tauri IPC
- Content is extracted from HTML
- Fetch status is tracked per result

### 5. Context Bundle
Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata
- `summaries` — Page content summaries
- `diagnostics` — Timing and error info

## Chat Tool Integration

In chat, the `web_search` tool triggers search:
```json
{
  "query": "string",
  "numResults": 5
}
```

The tool has retry logic (up to 2 retries) and real-time UI updates showing:
- Search phase: querying sources
- Fetch phase: downloading content
- Reading phase: extracting text

## Research Pipeline Integration

The research module uses the search orchestrator with:
- Multiple queries per research step
- Source type filtering
- Higher fetch limits for thorough research

## Key Types

```typescript
type SearchProvider = 'searxng' | 'arxiv' | 'wikipedia'

interface SearchInput {
  query: string
  provider?: SearchProvider
  numResults?: number
  freshness?: string
}

interface SearchResult {
  url: string
  title: string
  snippet: string
  source: SearchProvider
  publishedDate?: string
}

interface SearchContextBundle {
  sources: SearchResult[]
  summaries: FetchedPageSummary[]
  diagnostics: SearchDiagnostics
}
```
