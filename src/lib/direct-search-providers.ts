/**
 * Resolve whether direct ArXiv / Wikipedia API calls should run for a search.
 *
 * Global toggles (Settings → Web Search) must be on. Callers can further disable
 * a provider per search (e.g. chat only queries ArXiv for academic intent).
 */
export function resolveDirectSearchProviders(options: {
  advancedSearchBundleEnabled: boolean;
  bundleArxivSearch: boolean;
  bundleWikipediaSearch: boolean;
  /** Per-search override. Omit to default to the global toggle. */
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
