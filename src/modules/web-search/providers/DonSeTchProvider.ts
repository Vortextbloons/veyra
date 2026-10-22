import type { SearchInput, SearchProvider, SearchResult } from "../types";
import { invokeWebSearch } from "../tauri-commands";

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

function isBlockedUrl(urlString: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlString).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const tld of SPAM_TLDS) {
    const suffix = tld.slice(1);
    if (hostname === suffix || hostname.endsWith(`.${suffix}`)) return true;
  }
  const lower = urlString.toLowerCase();
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }
  return false;
}

function isLowQualityResult(result: { title?: string; snippet?: string }): boolean {
  return (result.title ?? "").trim().length === 0 && (result.snippet ?? "").trim().length === 0;
}

function extractDisplayUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname + url.pathname.replace(/\/$/, "");
  } catch {
    return urlString;
  }
}

export type DonSeTchProviderConfig = {
  id: string;
  name: string;
  maxResults: number;
};

/**
 * Search provider backed by the bundled DonSeTch process.
 * The Rust supervisor owns its lifecycle; this class only maps results.
 */
export class DonSeTchProvider implements SearchProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "donsetch" as const;
  private config: DonSeTchProviderConfig;
  private degraded = false;

  constructor(config: DonSeTchProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  /** True when DonSeTch reported that some upstream engines were unavailable. */
  get isDegraded(): boolean {
    return this.degraded;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const limit = input.limit ?? this.config.maxResults;
    const response = await invokeWebSearch(input.query, limit, input.intent);
    this.degraded = response.degraded;

    const seenUrls = new Set<string>();
    return response.results
      .filter((result) => {
        const normalized = result.url.trim().toLowerCase();
        if (!normalized || seenUrls.has(normalized)) return false;
        if (isBlockedUrl(normalized)) return false;
        if (isLowQualityResult(result)) return false;
        seenUrls.add(normalized);
        return true;
      })
      .slice(0, limit)
      .map((result, index) => ({
        id: result.id,
        title: result.title,
        url: stripUtmParams(result.url),
        displayUrl: extractDisplayUrl(result.url),
        snippet: result.snippet,
        providerId: this.id,
        engine: result.engine,
        publishedAt: result.published_at ?? undefined,
        score: result.score,
        rank: index + 1,
        fetchedAt: new Date().toISOString(),
      }));
  }
}
