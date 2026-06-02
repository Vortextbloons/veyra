import { useSettingsStore } from "@/stores/settings-store";
import { SearXNGProvider } from "../providers/SearXNGProvider";
import type { SearchContextBundle, SearXNGProviderConfig } from "../types";

export const WEB_SEARCH_SYSTEM_HINT = `<veyra_web_search_hint>
You have access to web search. When the user's question requires current information
you do not have, emit a tool call in this exact JSON format:

{"tool": "web.search", "args": {"query": "your search query here"}}

Do NOT answer from the search results yourself — the app will handle the search and
return results to you. Use web search only when genuinely needed. Do not search for
trivial or timeless questions.
</veyra_web_search_hint>`;

const MAX_CONTEXT_TOKENS = 2500;

export async function runSearch(query: string): Promise<SearchContextBundle> {
  const settings = useSettingsStore.getState();
  const baseUrl = settings.webSearchSearxngUrl;

  if (!baseUrl || baseUrl.trim() === "") {
    throw new Error(
      "No SearXNG URL configured. Please set a SearXNG instance URL in Settings → Tools → Web Search.",
    );
  }

  const config: SearXNGProviderConfig = {
    id: "searxng-default",
    name: "SearXNG",
    baseUrl: baseUrl.trim(),
    enabled: true,
    jsonEnabled: true,
    timeoutMs: 10000,
    maxResults: 8,
  };

  const provider = new SearXNGProvider(config);
  const results = await provider.search({ query, limit: 8 });

  if (results.length === 0) {
    throw new Error(
      "SearXNG returned no results. The instance may be starting up — try again in a few seconds.",
    );
  }

  const sources = results.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    snippet: r.snippet ?? "",
  }));

  const summary = `Search found ${results.length} results for: ${query}`;

  const fullText = `Search results for: "${query}"\n\n` +
    sources
      .map(
        (s, i) =>
          `Source ${i + 1}: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`,
      )
      .join("\n\n");

  const tokenCount = Math.ceil(fullText.length / 4);

  return {
    query,
    summary,
    sources,
    tokenCount,
  };
}

export function buildSearchContextBlock(bundle: SearchContextBundle): string {
  const header = `<veyra_web_search>\nSearch results for: "${bundle.query}"\n\n`;
  const footer = `\n</veyra_web_search>`;

  const maxContentTokens = MAX_CONTEXT_TOKENS - Math.ceil((header.length + footer.length) / 4);

  const lines: string[] = [];
  let usedTokens = 0;

  for (let i = 0; i < bundle.sources.length; i++) {
    const source = bundle.sources[i];
    const block = `Source ${i + 1}: ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`;
    const blockTokens = Math.ceil(block.length / 4);

    if (usedTokens + blockTokens > maxContentTokens) {
      const remaining = maxContentTokens - usedTokens;
      if (remaining > 20) {
        lines.push(block.slice(0, remaining * 4));
      }
      break;
    }

    lines.push(block);
    usedTokens += blockTokens;
  }

  return header + lines.join("\n\n") + footer;
}
