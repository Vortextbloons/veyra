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
- General web search queries
- Date-filtered searches for recency
- Result parsing and normalization

## ArXiv Provider

Direct API access for academic paper searches. Returns paper metadata with links.

## Wikipedia Provider

Direct API access for encyclopedia searches. Returns article summaries and links.
