# Search Providers

| Provider | Description |
|----------|-------------|
| DonSeTch | Bundled local metasearch engine — primary provider |
| ArXiv | Direct ArXiv API for academic papers (optional) |
| Wikipedia | Direct Wikipedia API (optional) |

## Provider architecture

Each provider implements a common interface in `src/modules/web-search/providers/`:

- accepts search input (query, limit, intent)
- returns normalized `SearchResult` objects
- is selected by the orchestrator based on settings and research depth

## DonSeTch provider

`DonSeTchProvider` calls the Rust `web_search` command, which talks to the bundled engine over authenticated loopback MCP. The Rust supervisor owns:

- process start/stop and crash handling
- ephemeral port + bearer token
- rerank model seeding
- MCP session and result mapping

`DonSeTchProvider` only normalizes results: it strips tracking parameters, removes duplicate URLs, drops obvious spam domains, and maps `published_at` into `publishedAt`.

The engine returns ranked URLs, titles, snippets, and scores. It also reports `degraded` when some upstream engines are blocked or unavailable; this is passed through diagnostics rather than treated as a failure.

## ArXiv provider

Direct API access for academic paper searches. Returns paper metadata with links. Gated by `advancedSearchBundleEnabled`, `bundleArxivSearch`, and the active research depth.

## Wikipedia provider

Direct API access for encyclopedia searches. Returns article summaries and links. Gated by `advancedSearchBundleEnabled`, `bundleWikipediaSearch`, and the active research depth.
