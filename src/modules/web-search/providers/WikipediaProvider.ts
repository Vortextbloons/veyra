import { invokeSearchWikipedia } from "../tauri-commands";
import type { SearchResult } from "../types";
import { DirectSourceProvider } from "./DirectSourceProvider";

export class WikipediaProvider extends DirectSourceProvider {
  protected async fetchResults(query: string, limit: number): Promise<SearchResult[]> {
    return (await invokeSearchWikipedia(query, limit)).results.map((result, index) => ({
      id: result.id || `wiki_${index}`,
      title: result.title,
      url: result.url,
      snippet: result.extract || result.snippet,
      providerId: this.id,
      engine: "wikipedia",
      score: 1.0 - index * 0.1,
      rank: index + 1,
      sourceType: "wikipedia" as const,
    }));
  }
}
