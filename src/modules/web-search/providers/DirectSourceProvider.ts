import type { SearchInput, SearchProvider, SearchResult } from "../types";

export type DirectSourceProviderConfig = {
  id: string;
  name: string;
  enabled: boolean;
  maxResults: number;
};

/**
 * Base for providers that call a dedicated Tauri command (arXiv, Wikipedia).
 * Subclasses only map the command response into `SearchResult`s.
 */
export abstract class DirectSourceProvider implements SearchProvider {
  readonly type = "direct_source" as const;
  readonly id: string;
  readonly name: string;
  private readonly enabled: boolean;
  private readonly maxResults: number;

  constructor(config: DirectSourceProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.maxResults = config.maxResults;
  }

  protected abstract fetchResults(query: string, limit: number): Promise<SearchResult[]>;

  async search(input: SearchInput): Promise<SearchResult[]> {
    if (!this.enabled) return [];
    try {
      return await this.fetchResults(input.query, input.limit ?? this.maxResults);
    } catch (error) {
      console.warn(`[${this.id}] search failed:`, error);
      return [];
    }
  }
}
