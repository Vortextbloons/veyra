/**
 * Resolve whether direct ArXiv / Wikipedia API calls should run for a search.
 *
 * Global toggles (Settings → Web Search) must be on. Research depth profiles can
 * further disable providers per preset (e.g. Quick skips slow/rate-limited APIs).
 */
export function resolveDirectSearchProviders(options: {
  advancedSearchBundleEnabled: boolean;
  bundleArxivSearch: boolean;
  bundleWikipediaSearch: boolean;
  /** Per-depth or per-run override. Omit for chat (defaults to enabled when global is on). */
  directArxivSearch?: boolean;
  directWikipediaSearch?: boolean;
}): { arxiv: boolean; wikipedia: boolean } {
  if (!options.advancedSearchBundleEnabled) {
    return { arxiv: false, wikipedia: false };
  }
  const arxivAllowed = options.directArxivSearch ?? true;
  const wikipediaAllowed = options.directWikipediaSearch ?? true;
  return {
    arxiv: options.bundleArxivSearch && arxivAllowed,
    wikipedia: options.bundleWikipediaSearch && wikipediaAllowed,
  };
}
