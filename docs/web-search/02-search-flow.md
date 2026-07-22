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

`search-ranker.ts` handles:

- **URL normalization** — strips tracking params (`utm_*`, `fbclid`, `gclid`, etc.)
- **Content-based dedup** — when fetched content exceeds 300 chars, identical normalized content across hosts is collapsed
- **Title similarity dedup** — syndicated articles with ≥92% title token overlap across different hosts are collapsed
- **Reciprocal-rank fusion** — RRF with lane weights (`primary` 1.1, `recent` 1.05, `opposing` 0.7) and a rank constant of 60
- **Domain diversity** — max 2 results per domain before the results are diversified

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
