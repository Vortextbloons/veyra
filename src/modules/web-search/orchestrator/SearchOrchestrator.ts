import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSettingsStore } from "@/stores/settings-store";
import { estimateTokens } from "@/lib/context";
import { SearXNGProvider } from "../providers/SearXNGProvider";
import type { SearchContextBundle, SearXNGProviderConfig } from "../types";

const ALLOWED_SEARCH_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

let activeSearch: Promise<SearchContextBundle> | null = null;

function validateSearchBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("Invalid SearXNG URL. Use a full http or https URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SearXNG URL must use http or https.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_SEARCH_HOSTS.has(host)) {
    throw new Error("SearXNG URL must point to localhost (127.0.0.1 or localhost).");
  }
}

export async function runSearch(query: string, signal?: AbortSignal): Promise<SearchContextBundle> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (useConnectivityStore.getState().effectiveConnectivity === "offline") {
    throw new Error("Web search is unavailable in Offline mode.");
  }

  const settings = useSettingsStore.getState();
  const baseUrl = settings.webSearchSearxngUrl;

  if (!baseUrl || baseUrl.trim() === "") {
    throw new Error(
      "No SearXNG URL configured. Please set a SearXNG instance URL in Settings → Tools → Web Search.",
    );
  }

  validateSearchBaseUrl(baseUrl);

  const run = async (): Promise<SearchContextBundle> => {
    const maxResults = settings.webSearchMaxResults ?? 8;
    const config: SearXNGProviderConfig = {
      id: "searxng-default",
      name: "SearXNG",
      baseUrl: baseUrl.trim(),
      enabled: true,
      jsonEnabled: true,
      timeoutMs: 10000,
      maxResults,
    };

    const provider = new SearXNGProvider(config);
    const results = await provider.search({
      query,
      limit: maxResults,
      timeRange: settings.webSearchTimeRange || undefined,
      categories: settings.webSearchCategories || undefined,
    });

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

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

    const tokenCount = estimateTokens(fullText);

    return {
      query,
      summary,
      sources,
      tokenCount,
    };
  };

  const pending = run().finally(() => {
    if (activeSearch === pending) activeSearch = null;
  });
  activeSearch = pending;
  return pending;
}

export function buildSearchContextBlock(bundle: SearchContextBundle): string {
  const settings = useSettingsStore.getState();
  const maxContextTokens = settings.webSearchContextTokenLimit ?? 2500;

  const header = `<veyra_web_search>\nSearch results for: "${bundle.query}"\n\n`;
  const footer = `\n</veyra_web_search>`;

  const maxContentTokens = maxContextTokens - estimateTokens(header + footer);

  const lines: string[] = [];
  let usedTokens = 0;

  for (let i = 0; i < bundle.sources.length; i++) {
    const source = bundle.sources[i];
    const block = `Source ${i + 1}: ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`;
    const blockTokens = estimateTokens(block);

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
