import type { FetchedPageSummary, SearchResult } from "./types";
import type { SearchLane } from "./search-planner";

export type RankedSearchResult = SearchResult & {
  rankScore: number;
  rankReason: string;
  queryLane?: SearchLane;
};

export type SearchRankingOptions = {
  freshnessBoost?: boolean;
  qualityFilter?: boolean;
};

const RRF_RANK_CONSTANT = 60;
const LANE_WEIGHTS: Record<SearchLane, number> = {
  general: 1,
  primary: 1.1,
  recent: 1.05,
  academic: 1.1,
  opposing: 0.7,
};

const AUTHORITY_HOST_PATTERNS = [
  ".gov", ".edu", "who.int", "nih.gov", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
  "worldbank.org", "oecd.org", "un.org", "europa.eu", "arxiv.org", "wikipedia.org",
];

const LOW_VALUE_HOST_PATTERNS = [
  "pinterest.", "quora.com", "medium.com", "substack.com", "slideshare.net",
];

export function normalizeSearchUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "msclkid", "ref", "ref_src", "source"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return urlString.trim().toLowerCase();
  }
}

function normalizedContent(page?: FetchedPageSummary): string {
  const raw = page?.content ?? "";
  return raw
    .slice(0, 8_000)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/gi, "")
    .trim();
}

function hostname(urlString: string): string {
  try {
    return new URL(urlString).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/[\s\-_]+/)
      .map((t) => t.replace(/^\p{P}+|\p{P}+$/gu, ""))
      .filter((token) => token.length > 1),
  );
}

function queryCoverage(result: SearchResult, query: string): number {
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) return 0;
  const haystack = tokenize(`${result.title} ${result.snippet ?? ""}`);
  let hits = 0;
  for (const term of queryTerms) {
    if (haystack.has(term)) hits++;
  }
  return hits / queryTerms.size;
}

function authorityScore(host: string): number {
  if (!host) return 0;
  if (AUTHORITY_HOST_PATTERNS.some((pattern) => host.includes(pattern))) return 0.25;
  if (LOW_VALUE_HOST_PATTERNS.some((pattern) => host.includes(pattern))) return -0.15;
  return 0;
}

function isLowValueHost(host: string): boolean {
  return LOW_VALUE_HOST_PATTERNS.some((pattern) => host.includes(pattern));
}

function freshnessScore(result: SearchResult, enabled: boolean): number {
  if (!enabled || !result.publishedAt) return 0;
  const published = Date.parse(result.publishedAt);
  if (Number.isNaN(published)) return 0;
  const ageDays = (Date.now() - published) / 86_400_000;
  if (ageDays <= 30) return 0.18;
  if (ageDays <= 180) return 0.12;
  if (ageDays <= 730) return 0.06;
  return 0;
}

function laneScore(result: SearchResult, lane?: SearchLane): number {
  if (!lane) return 0;
  const host = hostname(result.url);
  const text = `${result.title} ${result.snippet ?? ""} ${result.url}`.toLowerCase();
  if (lane === "academic" && (result.sourceType === "arxiv" || host.includes(".edu") || text.includes("study") || text.includes("journal"))) return 0.2;
  if (lane === "primary" && (host.includes(".gov") || host.includes(".edu") || host.includes("who.int") || host.includes("oecd.org"))) return 0.2;
  if (lane === "recent" && /202[4-9]|latest|updated|news/.test(text)) return 0.12;
  if (lane === "opposing" && /critic|limitation|controvers|risk|challenge/.test(text)) return 0.12;
  return 0;
}

export function dedupeAndRankSearchResults(
  entries: Array<{ result: SearchResult; query: string; lane?: SearchLane; providerOrder: number }>,
  fetchedByUrl: Map<string, FetchedPageSummary> = new Map(),
  maxResults = 10,
  options: SearchRankingOptions = {},
): RankedSearchResult[] {
  const hostCache = new Map<string, string>();
  const getHost = (url: string): string => {
    let h = hostCache.get(url);
    if (h === undefined) { h = hostname(url); hostCache.set(url, h); }
    return h;
  };
  const normContentCache = new Map<string, string>();
  const getNormContent = (url: string): string => {
    let nc = normContentCache.get(url);
    if (nc === undefined) { nc = normalizedContent(fetchedByUrl.get(url)); normContentCache.set(url, nc); }
    return nc;
  };
  const tokenCache = new Map<string, Set<string>>();
  const getTokens = (text: string): Set<string> => {
    let t = tokenCache.get(text);
    if (t === undefined) { t = tokenize(text); tokenCache.set(text, t); }
    return t;
  };

  const prep = entries.map((entry) => ({
    entry,
    normUrl: normalizeSearchUrl(entry.result.url),
    normContent: getNormContent(entry.result.url),
    host: getHost(entry.result.url),
    titleTokens: getTokens(entry.result.title),
  }));

  const byUrl = new Map<string, Array<typeof entries[0]>>();
  const contentToKey = new Map<string, string>();
  const groupMetas: Array<{ key: string; host: string; tokens: Set<string> }> = [];

  for (const p of prep) {
    let key = p.normUrl;

    if (p.normContent.length >= 300) {
      const existing = contentToKey.get(p.normContent);
      if (existing) { key = existing; } else { contentToKey.set(p.normContent, key); }
    } else {
      for (const g of groupMetas) {
        if (g.host === p.host) continue;
        let intersection = 0;
        for (const t of p.titleTokens) if (g.tokens.has(t)) intersection++;
        if (intersection / (p.titleTokens.size + g.tokens.size - intersection) >= 0.92) {
          key = g.key;
          break;
        }
      }
    }

    const list = byUrl.get(key) || [];
    list.push(p.entry);
    byUrl.set(key, list);

    if (!groupMetas.some((g) => g.key === key)) {
      groupMetas.push({ key, host: p.host, tokens: p.titleTokens });
    }
  }

  const domainCounts = new Map<string, number>();
  const ranked = [...byUrl.values()].map((group) => {
    const best = group[0];
    const result = best.result;
    const host = getHost(result.url);
    const fetch = fetchedByUrl.get(result.url);
    const providerCount = new Set(group.map((item) => item.result.providerId || item.result.engine || "unknown")).size;
    const laneCount = new Set(group.map((item) => item.lane || "general")).size;
    const reciprocalRank = group.reduce((sum, item) => {
      const rank = Math.max(1, item.result.rank ?? item.providerOrder + 1);
      return sum + (LANE_WEIGHTS[item.lane ?? "general"] / (RRF_RANK_CONSTANT + rank));
    }, 0) * 20;
    const coverage = Math.max(...group.map((item) => queryCoverage(item.result, item.query)));
    const extractionBoost = fetch?.status === "ok" ? 0.15 : fetch ? -0.08 : 0;
    const freshnessBoost = freshnessScore(result, options.freshnessBoost !== false);
    const score = reciprocalRank +
      providerCount * 0.12 +
      laneCount * 0.08 +
      coverage * 0.3 +
      authorityScore(host) +
      freshnessBoost +
      extractionBoost +
      Math.max(...group.map((item) => laneScore(item.result, item.lane)));
    const reasons = [
      providerCount > 1 ? `${providerCount} providers` : result.engine || result.providerId,
      laneCount > 1 ? `${laneCount} query lanes` : best.lane || "general",
      coverage > 0.5 ? "strong term match" : "partial term match",
      authorityScore(host) > 0 ? "authority domain" : "",
      freshnessBoost > 0 ? "recent source" : "",
      fetch?.status === "ok" ? "content extracted" : "",
    ].filter(Boolean);
    return {
      ...result,
      rankScore: score,
      rankReason: reasons.join("; "),
      queryLane: best.lane,
    } satisfies RankedSearchResult;
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);
  const qualityFiltered = options.qualityFilter !== false && ranked.length > maxResults
    ? ranked.filter((result) => !isLowValueHost(getHost(result.url)))
    : ranked;
  const candidates = qualityFiltered.length >= Math.max(3, Math.ceil(maxResults * 0.75)) ? qualityFiltered : ranked;
  const diversified: RankedSearchResult[] = [];
  for (const result of candidates) {
    const host = getHost(result.url);
    const count = domainCounts.get(host) ?? 0;
    if (count >= 2 && diversified.length >= Math.ceil(maxResults / 2)) continue;
    domainCounts.set(host, count + 1);
    diversified.push({ ...result, rank: diversified.length + 1 });
    if (diversified.length >= maxResults) break;
  }

  return diversified;
}
