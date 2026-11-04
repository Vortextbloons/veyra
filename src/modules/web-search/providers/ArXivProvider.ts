import { invokeSearchArxiv } from "../tauri-commands";
import type { SearchResult } from "../types";
import { DirectSourceProvider } from "./DirectSourceProvider";

export class ArXivProvider extends DirectSourceProvider {
  protected async fetchResults(query: string, limit: number): Promise<SearchResult[]> {
    return (await invokeSearchArxiv(query, limit)).results.map((result, index) => ({
      id: result.id || `arxiv_${index}`,
      title: result.title,
      url: result.url,
      snippet: result.snippet || result.summary.slice(0, 300),
      providerId: this.id,
      engine: "arxiv",
      score: 1.0 - index * 0.1,
      rank: index + 1,
      sourceType: "arxiv" as const,
    }));
  }
}
