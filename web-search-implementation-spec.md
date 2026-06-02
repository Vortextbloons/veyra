# Web Search Implementation Spec — Phase 1 (MVP)

## Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| HTTP transport | Rust Tauri command (`reqwest`) | Keeps Tauri HTTP scope tight; allows URL validation at the Rust boundary; matches existing `memory_commands.rs` pattern |
| Trigger behavior | Auto When Needed (B2) — model emits pseudo tool call; app parses, searches, re-prompts | Faithful to spec §24.1 default; model decides when search is needed |
| Toggle placement | Right-panel only (C1) — existing stub in `right-panel.tsx` wired to settings store | Minimal new UI; toggle is visible while in chat; no Composer duplication |
| Settings tab | New "Tools" tab in settings page — Web Search is the first tool section | Extensible for future tools (file tools, code tools, etc.) |
| MVP provider | User-configured SearXNG URL only | No bundled SearXNG; no other providers in Phase 1 |
| Memory interaction | Memory is never sent to search queries; search results are never written to memory | Privacy requirement from spec §21 |

## Scope

### In scope (Phase 1)
- `SearchProvider` interface (mirrors existing `ProviderAdapter` pattern)
- `SearXNGProvider` implementation (SearXNG JSON API only)
- Search orchestrator with result normalization
- `web.search` pseudo tool definition (format from spec §8)
- Tauri Rust command for HTTP fetch (`web_search_searxng`) with URL validation
- TypeScript wrapper for the Tauri command
- Settings: `webSearchEnabled`, `webSearchSearxngUrl`
- Settings UI: "Tools" tab with Web Search section (URL field, test connection button)
- Chat: right-panel Web Search toggle wired to settings store
- Prompt integration: `<veyra_web_search>` system-prompt block listing normalized results
- Pseudo tool-call detection in chat orchestrator (model emits `{"tool":"web.search","args":{"query":"..."}}`)
- Re-prompting: after search, model receives results and generates final answer
- Error handling for: invalid URL, non-200 status, JSON parse failure, network timeout

### Out of scope (deferred)
- Page fetching, readability, citations (Phase 2)
- Reranking, search modes, freshness, deduplication (Phase 3)
- Direct providers — GitHub, Wikipedia, npm, etc. (Phase 4)
- Cache tables, search history, debug panel (Phase 5)
- Memory interaction (never in Phase 1)

## Behavior Rules (from websearch.md)

1. Web search is **OFF** by default.
2. Memory is **never** sent to the search query.
3. Search results are **never** written to memory.
4. The right-panel toggle reflects the global `webSearchEnabled` setting.
5. The SearXNG URL is read from the settings store at search time.
6. Allowed protocols for the base URL: `http`, `https`. Private IPs and metadata-service IPs are blocked at the Rust boundary.
7. The system prompt hint is injected only when web search is enabled.
8. The model decides when to search via pseudo tool call — the app does not auto-search every turn.
9. After a search, the model receives a compact `<veyra_web_search>` context block and generates the final answer with source URLs inline.

## Pseudo Tool-Call Format (spec §8)

The model emits this in its assistant response:

```json
{"tool": "web.search", "args": {"query": "search terms here"}}
```

The orchestrator:
1. Detects the JSON block in the assistant response.
2. Extracts the query string.
3. Runs the search via the SearXNGProvider.
4. Commits a "Searching the web..." status message.
5. Builds a `<veyra_web_search>` context block from results.
6. Re-prompts the model with the search context appended to the system prompt.
7. Streams the final answer to the user.

## System Prompt Hint (injected when web search is enabled)

```
<veyra_web_search_hint>
You have access to web search. When the user's question requires current information
you do not have, emit a tool call in this exact JSON format:

{"tool": "web.search", "args": {"query": "your search query here"}}

Do NOT answer from the search results yourself — the app will handle the search and
return results to you. Use web search only when genuinely needed. Do not search for
trivial or timeless questions.
</veyra_web_search_hint>
```

## Acceptance Criteria (Phase 1)

1. Settings page shows a "Tools" tab with a Web Search section.
2. The Tools tab lets the user enter a SearXNG URL and click "Test Connection"; the button reports success/failure.
3. The right-panel Web Search toggle reads from and writes to `webSearchEnabled` in the settings store and persists across reloads.
4. When web search is enabled, the system prompt sent to the model includes a `<veyra_web_search_hint>` block.
5. When the model emits `{"tool":"web.search","args":{"query":"..."}}` in its response, the orchestrator detects it, runs the search, and re-prompts with results.
6. Search results are normalized into `{id, title, url, snippet, providerId, rank}` format.
7. The `<veyra_web_search>` context block lists up to 5 results with title, URL, and snippet, capped at 1500 tokens.
8. When web search is disabled, no hint is injected and no HTTP call is made.
9. The Rust command validates the URL (rejects `file://`, `javascript:`, `data:`; rejects private IPs and localhost for non-local SearXNG URLs).
10. Error messages from the Rust command are clear and surface in the UI (not silent failures).
11. The build (`npm run build`), lint (`npm run lint`), and `cargo check` pass with no new errors.
12. No memory data is included in search queries.

## Phase Roadmap

| Phase | Focus | Key Deliverables |
|---|---|---|
| **1 (now)** | MVP SearXNG Search | Provider, orchestrator, tool, settings, toggle, pseudo tool-call detection, re-prompting |
| 2 | Page Fetching & Citations | Page fetcher, readability extraction, citation builder, source drawer |
| 3 | Reranking & Modes | Deduplication, reranking, search modes (general/technical/news), freshness |
| 4 | Direct Source Providers | GitHub, Wikipedia, npm/PyPI, Stack Exchange providers |
| 5 | Advanced UX | Debug panel, search history, cache management, per-project settings |
