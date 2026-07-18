import { normalizeSearchUrl } from "./search-ranker";
import type { SearchResult } from "./types";

export type SearchEvaluationLabels = {
  relevantUrls: string[];
  primaryUrls?: string[];
};

export type SearchQualityMetrics = {
  recallAt20: number;
  mrrAt10: number;
  ndcgAt10: number;
  primarySourceRate: number;
  duplicateRate: number;
};

export function evaluateSearchRanking(
  results: SearchResult[],
  labels: SearchEvaluationLabels,
): SearchQualityMetrics {
  const relevant = new Set(labels.relevantUrls.map(normalizeSearchUrl));
  const primary = new Set((labels.primaryUrls ?? []).map(normalizeSearchUrl));
  const top20 = results.slice(0, 20);
  const foundRelevant = new Set(top20.map((result) => normalizeSearchUrl(result.url)).filter((url) => relevant.has(url)));
  const firstRelevant = results.slice(0, 10).findIndex((result) => relevant.has(normalizeSearchUrl(result.url)));

  const gains: number[] = results.slice(0, 10).map((result) => relevant.has(normalizeSearchUrl(result.url)) ? 1 : 0);
  const dcg = gains.reduce<number>((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
  const idealCount = Math.min(10, relevant.size);
  let idealDcg = 0;
  for (let index = 0; index < idealCount; index++) idealDcg += 1 / Math.log2(index + 2);

  const normalized = results.map((result) => normalizeSearchUrl(result.url));
  const unique = new Set(normalized);
  const primaryCount = top20.filter((result) => primary.has(normalizeSearchUrl(result.url))).length;

  return {
    recallAt20: relevant.size > 0 ? foundRelevant.size / relevant.size : 1,
    mrrAt10: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0,
    ndcgAt10: idealDcg > 0 ? dcg / idealDcg : 1,
    primarySourceRate: top20.length > 0 ? primaryCount / top20.length : 0,
    duplicateRate: normalized.length > 0 ? (normalized.length - unique.size) / normalized.length : 0,
  };
}
