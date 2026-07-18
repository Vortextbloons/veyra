# Web Search Integration

## Chat Tool Integration

In chat, the `web_search` tool triggers search with additional optional parameters:

```json
{
  "query": "string",
  "intent": "general | news | academic | code | documentation | local | discussion",
  "timeRange": "day | week | month | year",
  "language": "en-US",
  "safeSearch": 0,
  "page": 1
}
```

Parameters beyond `query` are optional. When omitted, the intent is inferred from the query text and routing is handled by `search-routing.ts`.

The tool has retry logic (up to 2 retries) and real-time UI updates showing:
- **Search phase**: querying sources
- **Fetch phase**: downloading content
- **Reading phase**: extracting text

## Research Pipeline Integration

The research module uses the search orchestrator with:
- Multiple queries per research step
- Source type filtering
- Higher fetch limits for thorough research
- Credibility scoring integration

## Direct Search Providers

`src/lib/direct-search-providers.ts` provides an alternative search path using Serper and Serpstack APIs that bypasses the full SearXNG orchestration for lightweight queries.
