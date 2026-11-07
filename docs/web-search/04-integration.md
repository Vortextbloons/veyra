# Web Search Integration

## Chat tool integration

In chat, the `web_search` tool accepts:

```json
{
  "query": "string",
  "intent": "general | news | academic | code | documentation | local | discussion"
}
```

`intent` is optional. When omitted, DonSeTch infers it from the query.

The tool has retry logic (up to 2 retries) and real-time UI updates:

- **Search phase**: querying the local engine
- **Fetch phase**: downloading content
- **Reading phase**: extracting text

## Supplementary direct providers

`src/lib/direct-search-providers.ts` decides whether the ArXiv and Wikipedia APIs should run for a search. It requires the Advanced Search Bundle and the corresponding provider toggle, and chat narrows the choice by query intent (ArXiv for academic, Wikipedia for overview questions).
