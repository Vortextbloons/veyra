import type { FetchedPage } from "@/modules/web-search/tauri-commands";

/**
 * Evidence-level caching for research sources.
 *
 * Prevents redundant re-downloads and re-extractions when the same URL
 * is used across multiple research runs. Cache is in-memory with TTL.
 */

interface CacheEntry {
  pages: FetchedPage[];
  extractedAt: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 200;

class EvidenceCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return url.replace(/#.*$/, "");
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.extractedAt > this.ttl;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldest(): void {
    if (this.cache.size <= MAX_CACHE_ENTRIES) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.extractedAt < oldestTime) {
        oldestTime = entry.extractedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  /**
   * Get cached pages for a URL, or null if not cached / expired.
   */
  get(url: string): CacheEntry["pages"] | null {
    const key = this.normalizeUrl(url);
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.cache.delete(key);
      return null;
    }
    return entry.pages;
  }

  /**
   * Store pages for a URL.
   */
  set(url: string, pages: CacheEntry["pages"]): void {
    const key = this.normalizeUrl(url);
    this.cache.set(key, { pages, extractedAt: Date.now() });
    this.evictOldest();
  }

  /**
   * Check if a URL is cached (and not expired).
   */
  has(url: string): boolean {
    const key = this.normalizeUrl(url);
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get cache stats.
   */
  stats(): { size: number } {
    this.evictExpired();
    return { size: this.cache.size };
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }
}

/** Singleton evidence cache instance. */
export const evidenceCache = new EvidenceCache();
