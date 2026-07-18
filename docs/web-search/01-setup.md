# Web Search Setup

Optional web search capability via SearXNG (Docker) with direct ArXiv and Wikipedia API support. Used by both the chat tool and the research pipeline.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/web-search/types.ts` | Type definitions |
| `src/modules/web-search/orchestrator/SearchOrchestrator.ts` | Main search orchestrator |
| `src/modules/web-search/search-planner.ts` | Multi-query generation |
| `src/modules/web-search/search-ranker.ts` | Result deduplication and ranking (RRF, content/title dedup) |
| `src/modules/web-search/search-routing.ts` | Intent-based category/engine routing |
| `src/modules/web-search/passage-ranker.ts` | Lexical passage ranking from fetched pages |
| `src/modules/web-search/search-evaluation.ts` | Retrieval quality metrics (recall, MRR, nDCG) |
| `src/modules/web-search/searx-capabilities-service.ts` | SearXNG `/config` capabilities with caching |
| `src/modules/web-search/searxng-setup.ts` | Docker setup for SearXNG |
| `src/modules/web-search/providers/` | Provider implementations |
| `src/modules/web-search/tauri-commands.ts` | Tauri IPC for page fetching and capabilities |

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
