# Web Search Flow

## One query, intent-aware

`SearchOrchestrator.runSearch()` sends a single query to the bundled DonSeTch engine. Veyra's previous multi-query expansion, RRF fusion, and adaptive fallback pipeline has been removed; DonSeTch performs its own multi-engine consensus, semantic reranking, and authority placement internally.

The model can supply an explicit `intent`, or omit it and let the engine infer one. Veyra maps its intent names to DonSeTch intents:

| Veyra intent | DonSeTch intent | Adds |
|--------------|-----------------|------|
| `general` | `web` | General web results |
| `news` | `news` | Google News, Hacker News |
| `academic` | `paper` | Google Scholar, arXiv |
| `code` | `code` | GitHub, Hacker News, Stack Exchange, MDN |
| `documentation` | `code` | GitHub, Hacker News, Stack Exchange, MDN |
| `local` | `web` | General web results |
| `discussion` | `web` | General web results |

There is no category/engine routing, time-range filter, safe-search level, language parameter, or pagination in the engine API. Those controls were removed from Settings and the tool schema.

## Supplementary providers

When the Advanced Search Bundle is enabled, ArXiv and Wikipedia direct APIs run in parallel with DonSeTch and are merged by URL. Research depth profiles can disable either provider per run.

## Deduplication

Results are merged in order (DonSeTch, ArXiv, Wikipedia) and deduplicated by a normalized URL key:

- hostname lowercased and `www.` stripped
- fragment removed
- trailing slash removed
- query string preserved

The result list is capped at the user's "Results per search" setting (1–12).

## Page fetching

- Top results are fetched through Tauri IPC (`fetch_and_extract_pages`).
- HTML, PDF, Office documents, EPUB, and YouTube transcripts use the existing extraction handlers.
- Wayback Machine fallback is available when enabled.
- Fetch status is tracked per source.

## Passage ranking

After fetching, `passage-ranker.ts` splits each page into blocks, scores them against the query, and returns the top passages with heading context and offsets. The context bundle prefers passages over raw page content.

## Speed preset

| Preset | Effect |
|--------|--------|
| `"fast"` | Skips page fetching, returns up to 3 snippet-only results, disables direct ArXiv/Wikipedia providers |
| `"normal"` | Full-quality search respecting user settings |

The research pipeline uses `"normal"` for background and gap-phase searches.

## Diagnostics

`SearchContextBundle.diagnostics` reports:

- the single executed query
- per-provider result counts
- `degraded` when DonSeTch reports unavailable upstream engines
