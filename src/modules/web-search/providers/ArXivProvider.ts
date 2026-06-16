import { invokeSearchArxiv } from "../tauri-commands";
import type { SearchInput, SearchResult } from "../types";
import type { SearchProvider } from "../types";

export type ArXivProviderConfig = {
  id: string;
  name: string;
  enabled: boolean;
  maxResults: number;
};

export class ArXivProvider implements SearchProvider {
  id: string;
  name: string;
  type = "direct_source" as const;
  private enabled: boolean;
  private maxResults: number;

  constructor(config: ArXivProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.maxResults = config.maxResults;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    if (!this.enabled) return [];

    const limit = input.limit ?? this.maxResults;
    try {
      const response = await invokeSearchArxiv(input.query, limit);
      return response.results.map((r, i) => ({
        id: r.id || `arxiv_${i}`,
        title: r.title,
        url: r.url,
        snippet: r.snippet || r.summary.slice(0, 300),
        providerId: this.id,
        engine: "arxiv",
        score: 1.0 - i * 0.1,
        rank: i + 1,
        sourceType: "arxiv" as const,
      }));
    } catch (error) {
      console.warn("[arxiv-provider] search failed:", error);
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await invokeSearchArxiv("test", 1);
      return response.result_count >= 0;
    } catch {
      return false;
    }
  }
}
