import type {
  SearchProvider,
  SearchInput,
  SearchResult,
  SearXNGProviderConfig,
} from "../types";
import { invokeSearchSearxng, invokeTestSearxngConnection } from "../tauri-commands";

function generateId(): string {
  return crypto.randomUUID();
}

function stripUtmParams(urlString: string): string {
  try {
    const url = new URL(urlString);
    const utmKeys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_source_platform",
      "utm_creative_format",
      "utm_marketing_tactic",
    ];
    for (const key of utmKeys) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function extractDisplayUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname + url.pathname.replace(/\/$/, "");
  } catch {
    return urlString;
  }
}

export class SearXNGProvider implements SearchProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "searxng" as const;
  private config: SearXNGProviderConfig;

  constructor(config: SearXNGProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const limit = input.limit ?? this.config.maxResults;
    const response = await invokeSearchSearxng(
      this.config.baseUrl,
      input.query,
      limit,
    );

    const seenUrls = new Set<string>();
    return response.results
      .filter((result) => {
        const normalized = result.url.trim().toLowerCase();
        if (!normalized || seenUrls.has(normalized)) return false;
        seenUrls.add(normalized);
        return true;
      })
      .map((result, index) => ({
      id: result.id || generateId(),
      title: result.title,
      url: stripUtmParams(result.url),
      displayUrl: extractDisplayUrl(result.url),
      snippet: result.snippet,
      providerId: this.id,
      engine: result.engine,
      score: result.score,
      rank: index + 1,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      return await invokeTestSearxngConnection(this.config.baseUrl);
    } catch (error) {
      console.error(`[SearXNGProvider] Connection test failed:`, error);
      return false;
    }
  }
}
