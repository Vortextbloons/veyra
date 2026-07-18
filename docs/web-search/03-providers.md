# Search Providers

| Provider | Description |
|----------|-------------|
| SearXNG | Self-hosted search via Docker container — primary provider |
| ArXiv | Direct ArXiv API for academic papers |
| Wikipedia | Direct Wikipedia API |

## Provider Architecture

Each provider implements a common interface in `src/modules/web-search/providers/`:
- Accepts search input (query, num results, freshness)
- Returns normalized `SearchResult` objects
- Providers are selected based on availability and search context

## SearXNG Provider

The primary provider. Requires a running Docker container on localhost. Handles:
- General web search queries with intent-based category/engine routing
- Date-filtered searches for recency (`timeRange` parameter)
- Paginated results (`page` parameter)
- Language/locale filtering
- Safe search levels (0 off, 1 moderate, 2 strict)
- Result parsing and normalization
- Capability discovery via `get_searxng_capabilities` Tauri command (fetches `/config`)

## ArXiv Provider

Direct API access for academic paper searches. Returns paper metadata with links.

## Wikipedia Provider

Direct API access for encyclopedia searches. Returns article summaries and links.
