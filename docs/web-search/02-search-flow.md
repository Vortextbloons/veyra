# Web Search Flow

## Intent Routing

`search-routing.ts` resolves search intent before query execution. The model can supply an explicit `intent`, or it's inferred from the query text:

| Intent | Trigger Keywords |
|--------|-----------------|
| news | latest, today, breaking, current events |
| academic | study, paper, research, journal, arxiv, pubmed |
| code | error, stack trace, typescript, python, rust, github |
| documentation | docs, documentation, reference, manual |
| local | near me, directions, map |
| discussion | reddit, forum, opinions |

The router maps each intent to SearXNG categories and engine hints, filtered against the instance's live capabilities from `SearxCapabilities`.

## Capability Discovery

On each search, `searx-capabilities-service.ts` fetches the SearXNG `/config` endpoint to discover available engines, categories, and locales. Results are cached for 10 minutes with request deduplication. This enables adapter-free routing: Veyra automatically adapts to any SearXNG instance's installed engines.

## Query Planning

`search-planner.ts` generates multiple search queries from a single user query across different lanes:

| Lane | Purpose | Example |
|------|---------|---------|
| General | Standard search | "quantum computing applications" |
| Recent | Current year filter | "quantum computing 2025 applications" |
| Academic | Scholarly sources | "quantum computing applications research paper" |
| Primary | Government/data sources | "quantum computing applications site:gov" |
| Opposing | Criticism/limitations | "quantum computing limitations problems" |

## Concurrent Execution

- Queries are executed concurrently (max 3 at a time)
- Each query hits the SearXNG API with routing parameters (categories, engines, page, language, safe search)
- ArXiv and Wikipedia direct searches run in parallel when applicable

## Deduplication and Ranking

`search-ranker.ts` applies a multi-stage pipeline: URL canonicalization, deduplication, Reciprocal Rank Fusion (RRF), scoring, and domain diversification.

### URL Canonicalization

`normalizeSearchUrl()` maps variant URLs to a canonical key before deduplication:

- Strips tracking parameters: `utm_*`, `fbclid`, `gclid`, `msclkid`, `ref`, `ref_src`, `source`
- Removes URL fragments (`#section`)
- Normalizes trailing slashes (strips `/` suffix)
- Lowercases the entire URL
- Note: remaining query parameters are not sorted, so `?a=1&b=2` and `?b=2&a=1` produce different keys

The `hostname()` helper separately strips `www.` and lowercases the host. Redirects are not followed (disabled in the fetch client for SSRF safety); the Wayback Machine fallback recovers content when the original URL fails.

### Deduplication

Three strategies collapse duplicates, applied in priority order:

1. **Canonical URL key** — normalized URLs map to the same group
2. **Content-based** — when fetched content exceeds 300 characters, identical normalized content across different hosts is collapsed
3. **Title similarity** — syndicated articles with ≥92% Jaccard token overlap across different hosts are collapsed

### Reciprocal Rank Fusion (RRF)

Each deduplicated group receives an RRF score:

```
score = Σ(weight / (K + rank)) × 20
```

Where `K = 60` and per-lane weights:

| Lane | Weight |
|------|--------|
| primary | 1.1 |
| academic | 1.1 |
| recent | 1.05 |
| general | 1.0 |
| opposing | 0.7 |

A result appearing across multiple queries and lanes accumulates a higher RRF score. Because RRF operates on rank position rather than raw provider scores, it is resistant to incomparable or unscaled scores from different search engines.

### Composite Score

Final ranking combines RRF with additional signals:

- **Multi-provider bonus** (+0.12 per provider)
- **Multi-lane bonus** (+0.08 per lane)
- **Query term coverage** (×0.3, ratio of query tokens matched in title/snippet)
- **Authority boost** (+0.25 for `.gov`, `.edu`, WHO, NIH, World Bank, UN, etc.; –0.15 for Pinterest, Quora, Medium, Substack, SlideShare)
- **Freshness boost** (+0.18 ≤30 days, +0.12 ≤180 days, +0.06 ≤2 years)
- **Extraction boost** (+0.15 if content was successfully fetched; –0.08 if fetch failed)
- **Lane relevance score** (up to +0.2 for domain/content matching the query lane)

### Domain Diversity

After scoring, results are diversified by domain. A domain may contribute at most 2 results, and this cap only applies once half the desired result count (`ceil(maxResults / 2)`) is already placed — so top-ranked results are never excluded. Low-value domains (Medium, Quora, etc.) are filtered earlier if there are enough candidates.

## Passage Ranking

After pages are fetched, `passage-ranker.ts` splits each page into blocks, scores them against the query via lexical overlap, and returns the top passages (default 3, max 1600 chars each). Passages include heading context and character offsets for provenance. The context bundle uses passages instead of raw page content when available.

## Page Fetching

- Top results are fetched via Tauri IPC
- Content is extracted from HTML, with Wayback Machine fallback
- Fetch status is tracked per result

## Speed Preset

Callers can override the user's search-speed preset at runtime via `speedPreset` in `RunSearchOptions`:

| Preset | Effect |
|--------|--------|
| `"fast"` | Skips page fetching, returns up to 3 snippet-only results, disables multi-query fusion and adaptive fallback |
| `"normal"` | Full-quality search respecting user settings for fetch, fusion, ranking, and capabilities |

The research pipeline uses `"normal"` for background and gap-phase searches to ensure complete source collection, regardless of the user's configured speed preset.

## Context Bundle

Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata and ranked passages
- `summaries` — Page content summaries
- `diagnostics` — Timing, routing decisions, capability availability
