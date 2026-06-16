import type {
  SearchProvider,
  SearchInput,
  SearchResult,
  SearXNGProviderConfig,
} from "../types";
import { useConnectivityStore } from "@/stores/connectivity-store";
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

// Conservative blocklist: low-quality/spam TLDs and keyword patterns commonly
// found in junk results. Keep short and unambiguous to avoid false positives.
const SPAM_TLDS = [
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".xyz",
  ".top",
  ".click",
  ".loan",
  ".work",
  ".review",
  ".country",
  ".stream",
  ".download",
  ".racing",
];

const SPAM_KEYWORDS = [
  "porn",
  "casino",
  "viagra",
  "cialis",
  "pharmacy",
  "weight-loss",
  "payday-loan",
  "crypto-scam",
];

const MIN_SCORE_THRESHOLD = 0.1;

function isBlockedUrl(urlString: string): boolean {
  const lower = urlString.toLowerCase();
  for (const tld of SPAM_TLDS) {
    if (lower.includes(tld)) return true;
  }
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }
  return false;
}

function isLowQualityResult(opts: {
  title?: string;
  snippet?: string;
  score?: number;
}): boolean {
  const title = (opts.title ?? "").trim();
  const snippet = (opts.snippet ?? "").trim();
  const hasAnyText = title.length > 0 || snippet.length > 0;
  if (!hasAnyText) return true;
  if (typeof opts.score === "number" && opts.score > 0 && opts.score < MIN_SCORE_THRESHOLD) {
    return true;
  }
  return false;
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
    const allowExternal = useConnectivityStore.getState().effectiveConnectivity === "online";
    const response = await invokeSearchSearxng(
      this.config.baseUrl,
      input.query,
      limit,
      allowExternal,
      {
        timeRange: input.timeRange,
        categories: input.categories,
        safeSearch: input.safeSearch,
        language: input.language,
      },
    );

    const seenUrls = new Set<string>();
    return response.results
      .filter((result) => {
        const normalized = result.url.trim().toLowerCase();
        if (!normalized || seenUrls.has(normalized)) return false;
        if (isBlockedUrl(normalized)) return false;
        if (isLowQualityResult({ title: result.title, snippet: result.snippet, score: result.score })) {
          return false;
        }
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
