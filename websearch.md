# Web Search Feature Specification

## 1. Overview

This spec defines a modular web search feature for a local-first AI desktop app such as **Veyra Regenter**.

The feature allows the AI to search the web through a controlled tool system instead of giving the model direct internet access.

The system should support:

* free/community search through SearXNG
* optional paid search providers later
* direct-source connectors for higher-quality results
* page fetching
* readable text extraction
* source reranking
* citation building
* local caching
* AI-ready search summaries
* safe prompt injection with token limits

The core idea:

```text
AI asks to search
    ↓
App runs search provider
    ↓
App reranks results
    ↓
App fetches top pages
    ↓
App extracts readable text
    ↓
App builds cited search context
    ↓
AI answers using sources
```

The AI should never blindly trust search snippets. Search results should be treated as discovery. The app should fetch and inspect top pages before building an answer.

---

## 2. Goals

## 2.1 Main Goals

The web search feature should:

* let the AI access current web information
* work with free/self-hosted search providers
* support SearXNG as the default free provider
* allow optional providers like Brave Search later
* provide citations for AI answers
* cache results locally
* protect user privacy where possible
* avoid sending every chat message to web search
* keep web search separate from memory
* support local-first workflows

---

## 2.2 Non-Goals

The feature should not:

* scrape Google directly
* save every visited webpage into memory automatically
* trust snippets without opening sources
* run web search for every message
* expose API keys to the frontend
* inject large webpage content directly into the model context
* become tightly coupled to one search provider

---

## 3. Recommended Architecture

```text
Web Search Feature
├─ AI Tool Router
├─ Search Orchestrator
├─ Search Provider Adapters
│  ├─ SearXNG Provider
│  ├─ Brave Search Provider
│  ├─ Custom Search Provider
│  └─ Direct Source Providers
│
├─ Result Normalizer
├─ Result Deduplicator
├─ Result Reranker
├─ Page Fetcher
├─ Readability Extractor
├─ Source Summarizer
├─ Citation Builder
├─ Cache Layer
├─ Permission Layer
└─ Search UI
```

---

## 4. Search Flow

## 4.1 Basic Flow

```text
User asks a question
    ↓
AI decides web search is needed
    ↓
AI emits pseudo tool call
    ↓
App validates tool call
    ↓
Search orchestrator chooses provider
    ↓
Search provider returns results
    ↓
Results are normalized
    ↓
Duplicate URLs are removed
    ↓
Results are reranked
    ↓
Top pages are fetched
    ↓
Readable content is extracted
    ↓
Source snippets are summarized
    ↓
Citation bundle is created
    ↓
AI receives compact search context
    ↓
AI answers with citations
```

---

## 4.2 Example User Request

```text
What is the latest stable Tauri version and what changed recently?
```

The AI should call:

```json
{
  "tool": "web.search",
  "args": {
    "query": "latest stable Tauri version changelog",
    "mode": "technical",
    "freshness": "month",
    "limit": 8
  }
}
```

The app searches, fetches top sources, and returns:

```json
{
  "summary": "Search found official Tauri docs and release notes.",
  "sources": [
    {
      "id": "src_001",
      "title": "Tauri Releases",
      "url": "https://github.com/tauri-apps/tauri/releases",
      "snippet": "Relevant release information..."
    }
  ]
}
```

Then the AI answers using those sources.

---

## 5. Provider Strategy

The app should use a provider adapter system.

```ts
interface SearchProvider {
  id: string
  name: string
  type: "searxng" | "brave" | "custom" | "direct_source"

  search(input: SearchInput): Promise<SearchResult[]>
  testConnection?(): Promise<boolean>
}
```

This keeps the search system modular.

The rest of the app should not care whether results came from SearXNG, Brave, GitHub, Wikipedia, or another provider.

---

## 6. Search Providers

## 6.1 SearXNG Provider

SearXNG should be the default free/community search provider.

Supported configuration:

```ts
type SearXNGProviderConfig = {
  id: string
  name: string
  baseUrl: string
  enabled: boolean

  defaultCategory?: "general" | "news" | "images" | "science" | "it"
  jsonEnabled: boolean

  timeoutMs: number
  maxResults: number
}
```

Example config:

```json
{
  "id": "searxng_local",
  "name": "Local SearXNG",
  "baseUrl": "http://localhost:8080",
  "enabled": true,
  "jsonEnabled": true,
  "timeoutMs": 10000,
  "maxResults": 10
}
```

The request should look like:

```text
GET /search?q=<query>&format=json
```

Optional parameters:

```text
categories
language
time_range
safesearch
pageno
```

The app should support both:

```text
/search
/
```

depending on the configured instance.

---

## 6.2 Public SearXNG Instance

The app may allow users to add a public SearXNG instance.

This should be labeled as experimental.

```text
Free Community Search
Results may be slower, rate-limited, or unavailable depending on the public instance.
```

Recommended behavior:

* let user enter a SearXNG URL
* test if JSON output works
* warn if JSON is disabled
* fallback to HTML parsing only if explicitly enabled
* allow disabling the provider

---

## 6.3 Local SearXNG

The best free setup is local/self-hosted SearXNG.

User setup options:

```text
Option A: User enters existing local SearXNG URL
Option B: App offers advanced sidecar setup later
Option C: App provides docs for Docker-based setup
```

For the MVP, do not bundle SearXNG directly. Just support connecting to it.

---

## 6.4 Brave Search Provider

Brave Search can be added later as an optional official API provider.

Configuration:

```ts
type BraveSearchProviderConfig = {
  id: string
  name: string
  apiKey: string
  enabled: boolean
  timeoutMs: number
  maxResults: number
}
```

This should be optional because it requires an API key.

---

## 6.5 Custom Search Provider

Allow advanced users to connect any OpenAI-style or custom search endpoint.

```ts
type CustomSearchProviderConfig = {
  id: string
  name: string
  endpoint: string
  method: "GET" | "POST"
  headers?: Record<string, string>
  queryParamName?: string
  resultMapping?: CustomResultMapping
}
```

This lets power users integrate their own search services.

---

## 6.6 Direct Source Providers

Direct source providers improve result quality for specific tasks.

Recommended direct providers:

```text
GitHub Search
Stack Exchange Search
Wikipedia Search
npm Package Search
PyPI Package Search
MDN Search
Rust Docs Search
Tauri Docs Search
arXiv Search
Hacker News Search
```

For technical questions, these are often better than general search.

Example:

```text
Query: "Tauri sidecar permissions"
Use:
- Tauri docs direct search
- GitHub issues
- SearXNG fallback
```

---

## 7. Search Modes

The app should support search modes.

```ts
type SearchMode =
  | "general"
  | "technical"
  | "news"
  | "docs"
  | "code"
  | "academic"
  | "shopping_disabled"
```

Recommended behavior:

```text
General:
Use SearXNG general web results.

Technical:
Prefer official docs, GitHub, Stack Overflow, package registries, then web.

News:
Prefer recent sources and sort by freshness.

Docs:
Prefer official documentation domains.

Code:
Prefer GitHub, docs, package registries.

Academic:
Prefer arXiv, Semantic Scholar if added, official PDFs, university pages.
```

---

## 8. Pseudo Tool Calling

Some local models may not support real tool calling. The app should support pseudo tool calls.

The AI can emit structured JSON:

```json
{
  "tool": "web.search",
  "args": {
    "query": "SearXNG Search API JSON format",
    "mode": "technical",
    "freshness": "year",
    "limit": 8
  }
}
```

The app validates the tool call, runs the search, and returns results to the model.

---

## 9. Tool Definitions

## 9.1 web.search

Searches the web and returns normalized results.

```ts
type WebSearchInput = {
  query: string

  mode?: SearchMode

  freshness?:
    | "any"
    | "day"
    | "week"
    | "month"
    | "year"

  limit?: number
  language?: string
  region?: string

  allowedDomains?: string[]
  blockedDomains?: string[]

  fetchTopPages?: boolean
  summarizeSources?: boolean
}
```

Output:

```ts
type WebSearchOutput = {
  query: string
  providerId: string

  results: SearchResult[]

  fetchedSources?: FetchedSource[]
  searchSummary?: string

  createdAt: string
}
```

---

## 9.2 web.fetch

Fetches a specific URL.

```ts
type WebFetchInput = {
  url: string

  extractReadableText?: boolean
  maxBytes?: number
  timeoutMs?: number
}
```

Output:

```ts
type WebFetchOutput = {
  url: string
  finalUrl: string

  statusCode: number
  contentType: string

  title?: string
  text?: string
  html?: string

  fetchedAt: string
}
```

---

## 9.3 web.read

Fetches and extracts readable article content.

```ts
type WebReadInput = {
  url: string

  maxTokens?: number
  includeTitle?: boolean
  includeExcerpt?: boolean
}
```

Output:

```ts
type WebReadOutput = {
  url: string
  title?: string
  excerpt?: string
  readableText: string
  tokenCount: number
}
```

---

## 9.4 web.search_and_read

Convenience tool that searches, reranks, fetches, and extracts top sources.

```ts
type WebSearchAndReadInput = {
  query: string
  mode?: SearchMode
  freshness?: "any" | "day" | "week" | "month" | "year"

  searchLimit?: number
  readLimit?: number
  maxTokensPerSource?: number

  allowedDomains?: string[]
  blockedDomains?: string[]
}
```

This is the main tool the AI should usually use.

---

## 10. Data Models

## 10.1 SearchResult

```ts
type SearchResult = {
  id: string

  title: string
  url: string
  displayUrl?: string

  snippet?: string

  providerId: string
  engine?: string

  publishedAt?: string
  fetchedAt?: string

  score?: number
  rank?: number

  sourceType?:
    | "webpage"
    | "docs"
    | "news"
    | "github"
    | "wikipedia"
    | "pdf"
    | "forum"
    | "package"
}
```

---

## 10.2 FetchedSource

```ts
type FetchedSource = {
  id: string

  url: string
  finalUrl: string

  title?: string
  author?: string
  siteName?: string

  contentType: string
  statusCode: number

  rawHtml?: string
  readableText?: string
  excerpt?: string

  tokenCount: number

  fetchedAt: string
}
```

---

## 10.3 SourceSummary

```ts
type SourceSummary = {
  sourceId: string

  title: string
  url: string

  summary: string
  keyClaims: string[]

  usefulScore: number

  supportsAnswer: boolean
}
```

---

## 10.4 Citation

```ts
type Citation = {
  id: string

  sourceId: string
  url: string
  title: string

  quote?: string
  paraphrase?: string

  usedFor: string
}
```

---

## 11. Database Tables

## 11.1 search_providers

```sql
CREATE TABLE search_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,

  config_json TEXT NOT NULL,

  enabled INTEGER DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 11.2 search_queries

```sql
CREATE TABLE search_queries (
  id TEXT PRIMARY KEY,

  query TEXT NOT NULL,
  mode TEXT,
  freshness TEXT,

  provider_id TEXT NOT NULL,

  result_count INTEGER DEFAULT 0,

  created_at TEXT NOT NULL,

  FOREIGN KEY (provider_id) REFERENCES search_providers(id)
);
```

---

## 11.3 search_results_cache

```sql
CREATE TABLE search_results_cache (
  id TEXT PRIMARY KEY,

  query_hash TEXT NOT NULL,
  provider_id TEXT NOT NULL,

  query TEXT NOT NULL,
  results_json TEXT NOT NULL,

  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## 11.4 fetched_pages_cache

```sql
CREATE TABLE fetched_pages_cache (
  id TEXT PRIMARY KEY,

  url TEXT NOT NULL,
  final_url TEXT,

  title TEXT,
  content_type TEXT,
  status_code INTEGER,

  readable_text TEXT,
  excerpt TEXT,

  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## 11.5 source_summaries_cache

```sql
CREATE TABLE source_summaries_cache (
  id TEXT PRIMARY KEY,

  source_url TEXT NOT NULL,
  source_hash TEXT NOT NULL,

  summary TEXT NOT NULL,
  key_claims_json TEXT,

  model_id TEXT,

  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## 12. Search Orchestrator

The search orchestrator controls the full search pipeline.

```ts
interface SearchOrchestrator {
  search(input: WebSearchInput): Promise<WebSearchOutput>
  fetch(input: WebFetchInput): Promise<WebFetchOutput>
  read(input: WebReadInput): Promise<WebReadOutput>
  searchAndRead(input: WebSearchAndReadInput): Promise<SearchReadBundle>
}
```

Search and read flow:

```text
1. Check cache
2. Choose providers
3. Run provider searches
4. Normalize results
5. Remove duplicates
6. Rerank results
7. Fetch top pages
8. Extract readable text
9. Summarize sources
10. Build citation bundle
11. Return compact context to AI
```

---

## 13. Result Normalization

Every provider returns different fields. Normalize all results into one shape.

Required normalized fields:

```text
title
url
snippet
providerId
rank
```

Optional fields:

```text
publishedAt
engine
sourceType
score
```

---

## 14. Deduplication

Remove duplicate results before reranking.

Duplicate signals:

```text
same canonical URL
same final URL after redirects
same title and domain
same page path with tracking params removed
```

Tracking params to strip:

```text
utm_source
utm_medium
utm_campaign
utm_term
utm_content
fbclid
gclid
mc_cid
mc_eid
```

---

## 15. Reranking

Reranking improves search quality before the AI reads sources.

## 15.1 General Reranking Formula

```ts
score =
  titleMatch * 0.20 +
  snippetMatch * 0.15 +
  semanticSimilarity * 0.25 +
  domainQuality * 0.15 +
  freshness * 0.10 +
  sourceTypeBoost * 0.10 +
  previousUsefulness * 0.05
```

---

## 15.2 Technical Search Ranking

For technical searches, prefer:

```text
1. Official docs
2. Official GitHub repositories
3. Package registry pages
4. GitHub issues/discussions
5. Stack Overflow / Stack Exchange
6. Maintainer blogs
7. Community tutorials
8. Random SEO pages
```

---

## 15.3 News Search Ranking

For news searches, prefer:

```text
1. Recent publish date
2. Reputable source
3. Direct reporting
4. Multiple independent confirmations
5. Avoid duplicate syndicated articles
```

---

## 16. Page Fetching

Search results are not enough. The app should fetch top pages.

Recommended defaults:

```ts
const fetchDefaults = {
  searchLimit: 8,
  readLimit: 4,
  timeoutMs: 10000,
  maxBytes: 2_000_000,
  maxTokensPerSource: 1200
}
```

Fetcher rules:

```text
Respect robots and site access restrictions where applicable.
Set a clear user agent.
Follow redirects.
Limit content size.
Reject dangerous protocols.
Avoid fetching local network URLs unless user explicitly allows it.
Do not execute page scripts.
Do not download large binary files by default.
```

Allowed protocols:

```text
https
http
```

Blocked by default:

```text
file
ftp
localhost
private IP ranges
data
javascript
chrome
```

---

## 17. Readability Extraction

After fetching HTML, extract readable content.

The extractor should return:

```text
title
byline if available
excerpt
main readable text
site name if available
```

If Readability fails, fallback to:

```text
HTML text extraction
metadata title/snippet
search result snippet
```

Do not send full raw HTML to the model unless in debug mode.

---

## 18. AI Search Context Bundle

The model should receive a compact bundle, not raw pages.

```ts
type SearchContextBundle = {
  query: string

  summary: string

  sources: {
    id: string
    title: string
    url: string
    excerpt: string
    keyPoints: string[]
  }[]

  warnings?: string[]

  tokenCount: number
}
```

Example:

```text
Search context for: "Tauri sidecar permissions"

Source 1: Tauri Sidecar Docs
URL: https://...
Key points:
- Tauri supports sidecar binaries.
- Sidecars need permissions to execute or spawn.
- Node.js sidecars can be packaged for desktop apps.

Source 2: ...
```

---

## 19. Citations

The AI should cite sources when using web search.

Citation rules:

```text
Cite claims based on web results.
Prefer primary sources.
Do not cite irrelevant sources.
Use multiple sources for disputed or recent claims.
Do not cite search snippets if page content was fetched successfully.
If only snippets were available, mark the source as snippet-only.
```

---

## 20. Cache System

Caching makes free search feel faster and more reliable.

Cache these:

```text
search query results
fetched pages
readability text
source summaries
domain quality scores
failed fetch attempts
```

Recommended TTLs:

```ts
const cacheTTL = {
  searchResults: "6 hours",
  fetchedPages: "24 hours",
  sourceSummaries: "7 days",
  technicalDocs: "7 days",
  newsResults: "1 hour",
  failedFetch: "30 minutes"
}
```

The user should be able to clear the search cache.

---

## 21. Privacy

Privacy rules:

```text
Do not search the web for every message.
Ask or clearly indicate when web search is being used.
Do not include private memory in search queries unless needed.
Redact sensitive information from search queries when possible.
Keep API keys in secure backend storage.
Do not expose API keys to frontend React code.
Let users disable web search entirely.
```

---

## 22. Safety and Security

## 22.1 URL Safety

Before fetching a URL, validate it.

Block:

```text
localhost
127.0.0.1
0.0.0.0
private LAN IPs
metadata service IPs
file:// URLs
javascript: URLs
data: URLs
```

This prevents SSRF-style issues.

---

## 22.2 Content Safety

The app should not execute remote scripts.

The fetcher should:

```text
Fetch HTML as text.
Parse content safely.
Extract readable text.
Never run page JavaScript.
Never load remote scripts in app UI.
Sanitize any rendered HTML.
```

---

## 22.3 Download Safety

By default:

```text
Do not download large files.
Do not auto-open downloads.
Do not execute downloaded files.
Ask before fetching PDFs or large documents.
```

---

## 23. UI Specification

## 23.1 Search Settings Page

```text
Settings
└─ Web Search
   ├─ Enable Web Search
   ├─ Default Search Provider
   ├─ SearXNG URL
   ├─ Test Connection
   ├─ Search Mode Defaults
   ├─ Cache Settings
   ├─ Privacy Settings
   └─ Advanced Provider Settings
```

---

## 23.2 Chat UI

In chat, web search should appear as a simple toggle:

```text
[ Web Search ○/● ]
```

When active:

```text
Searching the web...
Reading 4 sources...
Answering with citations...
```

The UI should show a small source drawer:

```text
Sources Used
├─ Source title
├─ URL
├─ short reason used
└─ open link
```

---

## 23.3 Search Debug Panel

Advanced users can open a debug panel.

Show:

```text
Original query
Provider used
Raw result count
Deduped result count
Fetched pages
Failed fetches
Reranking scores
Final sources
Cache hits/misses
```

Hide this from normal users by default.

---

## 24. Settings Presets

## 24.1 Simple Presets

```text
Off:
No web search.

Ask First:
AI asks before searching.

Auto When Needed:
AI searches when current info is needed.

Always Available:
Web search toggle stays visible and enabled.
```

Recommended default:

```text
Auto When Needed
```

---

## 24.2 Search Quality Presets

```text
Fast:
Search only, no page fetch unless needed.

Balanced:
Search + fetch top 3 pages.

Deep:
Search + fetch top 5-8 pages + summarize sources.

Technical:
Prefer official docs and source repositories.
```

Recommended default:

```text
Balanced
```

---

## 25. Prompt Integration

The search context should be inserted separately from memory.

Prompt order:

```text
1. System prompt
2. Relevant app/project settings
3. Relevant memory pack
4. Web search context bundle
5. Recent conversation
6. Current user message
```

Rules:

```text
Memory and web search are separate systems.
Do not save search results into memory automatically.
Only save search findings if the user asks or if it becomes a project decision.
Keep web context token-limited.
Prefer fetched source content over snippets.
```

---

## 26. Token Budgets

Recommended budgets:

```ts
const webSearchBudgets = {
  fast: {
    maxSources: 3,
    maxTokensPerSource: 500,
    totalSearchContextTokens: 1500
  },

  balanced: {
    maxSources: 4,
    maxTokensPerSource: 900,
    totalSearchContextTokens: 3000
  },

  deep: {
    maxSources: 8,
    maxTokensPerSource: 1200,
    totalSearchContextTokens: 7000
  }
}
```

Default:

```text
Balanced
```

---

## 27. Error Handling

The search system should handle:

```text
provider offline
invalid provider URL
JSON disabled
timeout
rate limit
blocked request
failed page fetch
unsupported content type
empty results
duplicate results
bad source quality
```

Example user-facing errors:

```text
Web search provider is unavailable.
SearXNG responded, but JSON output is disabled.
I found results, but could not open the top pages.
Search timed out. Try again or switch provider.
```

---

## 28. MVP Build Plan

## Version 0.1 — Basic SearXNG Search

Build:

* Search provider interface
* SearXNG provider
* settings field for SearXNG URL
* test connection button
* `web.search` pseudo tool
* normalized search results
* basic chat integration

Skip:

* page fetching
* reranking
* source summaries
* direct source providers

---

## Version 0.2 — Page Fetching and Citations

Build:

* page fetcher
* readable text extraction
* source context bundle
* citation builder
* source drawer in chat
* cache fetched pages

---

## Version 0.3 — Reranking and Search Modes

Build:

* result reranker
* technical mode
* docs mode
* freshness options
* domain quality scoring
* deduplication

---

## Version 0.4 — Direct Source Providers

Build:

* GitHub provider
* Wikipedia provider
* npm/PyPI provider
* Stack Exchange provider
* official docs domain boosting

---

## Version 0.5 — Advanced Search UX

Build:

* search debug panel
* search history
* source quality indicators
* cache management
* per-project web search settings
* custom provider support

---

## 29. Recommended File Structure

```text
src/
├─ modules/
│  └─ web-search/
│     ├─ providers/
│     │  ├─ SearchProvider.ts
│     │  ├─ SearXNGProvider.ts
│     │  ├─ BraveSearchProvider.ts
│     │  ├─ CustomSearchProvider.ts
│     │  └─ direct/
│     │     ├─ GitHubProvider.ts
│     │     ├─ WikipediaProvider.ts
│     │     └─ PackageRegistryProvider.ts
│     │
│     ├─ orchestrator/
│     │  ├─ SearchOrchestrator.ts
│     │  ├─ ResultNormalizer.ts
│     │  ├─ ResultDeduplicator.ts
│     │  ├─ ResultReranker.ts
│     │  └─ CitationBuilder.ts
│     │
│     ├─ fetcher/
│     │  ├─ PageFetcher.ts
│     │  ├─ ReadabilityExtractor.ts
│     │  └─ UrlSafety.ts
│     │
│     ├─ cache/
│     │  ├─ SearchCache.ts
│     │  └─ PageCache.ts
│     │
│     ├─ tools/
│     │  ├─ webSearchTool.ts
│     │  ├─ webFetchTool.ts
│     │  └─ webSearchAndReadTool.ts
│     │
│     └─ ui/
│        ├─ WebSearchSettings.tsx
│        ├─ SearchSourceDrawer.tsx
│        └─ SearchDebugPanel.tsx
```

---

## 30. Final Product Behavior

The final web search feature should feel simple to the user:

```text
User turns on Web Search.
User asks a current question.
The app searches.
The app reads sources.
The AI answers with citations.
The user can inspect sources.
```

Internally, it should be modular and safe:

```text
Tool call
→ provider adapter
→ normalized results
→ reranking
→ page reading
→ source summaries
→ citations
→ token-limited AI context
```

This gives the app a strong web search system without locking it to one provider or requiring paid APIs from the start.
