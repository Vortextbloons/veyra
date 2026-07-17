# Web Search Integration

## Chat Tool Integration

In chat, the `web_search` tool triggers search:

```json
{
  "query": "string",
  "numResults": 5
}
```

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
