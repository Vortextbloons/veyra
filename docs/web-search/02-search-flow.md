# Web Search Flow

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
- Each query hits the SearXNG API
- Results are collected and merged

## Deduplication and Ranking

`search-ranker.ts` handles:
- URL-based deduplication
- Relevance ranking against the original query
- Source diversity encouragement

## Page Fetching

- Top results are fetched via Tauri IPC
- Content is extracted from HTML
- Fetch status is tracked per result

## Context Bundle

Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata
- `summaries` — Page content summaries
- `diagnostics` — Timing and error info
