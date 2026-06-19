import type { StateCreator } from "zustand";

export type WebSearchSliceState = {
  defaultWebSearchEnabled: boolean;
  webSearchSearxngUrl: string;
  webSearchDefaultMode: "auto" | "always" | "off";
  webSearchMaxResults: number;
  webSearchTimeRange: "" | "day" | "week" | "month" | "year";
  webSearchCategories: string;
  webSearchSafeSearch: 0 | 1 | 2;
  webSearchContextTokenLimit: number;
  webSearchFetchEnabled: boolean;
  webSearchFetchCount: number;
  webSearchPerPageTimeoutSecs: number;
  webSearchFetchMaxCharsPerSource: number;
  advancedSearchBundleEnabled: boolean;
  advancedSearchMultiQueryEnabled: boolean;
  advancedSearchFusionEnabled: boolean;
  advancedSearchAdaptiveFallbackEnabled: boolean;
  advancedSearchFreshnessBoostEnabled: boolean;
  advancedSearchQualityFilterEnabled: boolean;
  bundleExtractDocx: boolean;
  bundleExtractPptx: boolean;
  bundleExtractXlsx: boolean;
  bundleExtractEpub: boolean;
  bundleWaybackFallback: boolean;
  bundleArxivSearch: boolean;
  bundleWikipediaSearch: boolean;
  searxngSetupError: string;
};

export type WebSearchSliceActions = {
  setDefaultWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchSearxngUrl: (url: string) => void;
  setWebSearchDefaultMode: (mode: "auto" | "always" | "off") => void;
  setWebSearchMaxResults: (n: number) => void;
  setWebSearchTimeRange: (range: "" | "day" | "week" | "month" | "year") => void;
  setWebSearchCategories: (categories: string) => void;
  setWebSearchSafeSearch: (level: 0 | 1 | 2) => void;
  setWebSearchContextTokenLimit: (n: number) => void;
  setWebSearchFetchEnabled: (enabled: boolean) => void;
  setWebSearchFetchCount: (n: number) => void;
  setWebSearchPerPageTimeoutSecs: (secs: number) => void;
  setWebSearchFetchMaxCharsPerSource: (n: number) => void;
  setAdvancedSearchBundleEnabled: (enabled: boolean) => void;
  setAdvancedSearchMultiQueryEnabled: (enabled: boolean) => void;
  setAdvancedSearchFusionEnabled: (enabled: boolean) => void;
  setAdvancedSearchAdaptiveFallbackEnabled: (enabled: boolean) => void;
  setAdvancedSearchFreshnessBoostEnabled: (enabled: boolean) => void;
  setAdvancedSearchQualityFilterEnabled: (enabled: boolean) => void;
  setBundleExtractDocx: (enabled: boolean) => void;
  setBundleExtractPptx: (enabled: boolean) => void;
  setBundleExtractXlsx: (enabled: boolean) => void;
  setBundleExtractEpub: (enabled: boolean) => void;
  setBundleWaybackFallback: (enabled: boolean) => void;
  setBundleArxivSearch: (enabled: boolean) => void;
  setBundleWikipediaSearch: (enabled: boolean) => void;
  setSearxngSetupError: (message: string) => void;
};

export const DEFAULT_WEB_SEARCH_STATE: WebSearchSliceState = {
  defaultWebSearchEnabled: false,
  webSearchSearxngUrl: "",
  webSearchDefaultMode: "auto",
  webSearchMaxResults: 8,
  webSearchTimeRange: "",
  webSearchCategories: "",
  webSearchSafeSearch: 0,
  webSearchContextTokenLimit: 4000,
  webSearchFetchEnabled: true,
  webSearchFetchCount: 5,
  webSearchPerPageTimeoutSecs: 8,
  webSearchFetchMaxCharsPerSource: 8000,
  advancedSearchBundleEnabled: true,
  advancedSearchMultiQueryEnabled: true,
  advancedSearchFusionEnabled: true,
  advancedSearchAdaptiveFallbackEnabled: true,
  advancedSearchFreshnessBoostEnabled: true,
  advancedSearchQualityFilterEnabled: true,
  bundleExtractDocx: true,
  bundleExtractPptx: true,
  bundleExtractXlsx: true,
  bundleExtractEpub: true,
  bundleWaybackFallback: true,
  bundleArxivSearch: true,
  bundleWikipediaSearch: true,
  searxngSetupError: "",
};

export type WebSearchSlice = WebSearchSliceState & WebSearchSliceActions;

export const createWebSearchSlice: StateCreator<WebSearchSlice, [], [], WebSearchSlice> = (set) => ({
  ...DEFAULT_WEB_SEARCH_STATE,
  setDefaultWebSearchEnabled: (defaultWebSearchEnabled) => set({ defaultWebSearchEnabled }),
  setWebSearchSearxngUrl: (webSearchSearxngUrl) => set({ webSearchSearxngUrl }),
  setWebSearchDefaultMode: (webSearchDefaultMode) => set({ webSearchDefaultMode }),
  setWebSearchMaxResults: (webSearchMaxResults) => set({ webSearchMaxResults }),
  setWebSearchTimeRange: (webSearchTimeRange) => set({ webSearchTimeRange }),
  setWebSearchCategories: (webSearchCategories) => set({ webSearchCategories }),
  setWebSearchSafeSearch: (webSearchSafeSearch) => set({ webSearchSafeSearch }),
  setWebSearchContextTokenLimit: (webSearchContextTokenLimit) => set({ webSearchContextTokenLimit }),
  setWebSearchFetchEnabled: (webSearchFetchEnabled) => set({ webSearchFetchEnabled }),
  setWebSearchFetchCount: (webSearchFetchCount) => set({ webSearchFetchCount }),
  setWebSearchPerPageTimeoutSecs: (webSearchPerPageTimeoutSecs) =>
    set({ webSearchPerPageTimeoutSecs }),
  setWebSearchFetchMaxCharsPerSource: (webSearchFetchMaxCharsPerSource) =>
    set({ webSearchFetchMaxCharsPerSource }),
  setAdvancedSearchBundleEnabled: (advancedSearchBundleEnabled) =>
    set({ advancedSearchBundleEnabled }),
  setAdvancedSearchMultiQueryEnabled: (advancedSearchMultiQueryEnabled) =>
    set({ advancedSearchMultiQueryEnabled }),
  setAdvancedSearchFusionEnabled: (advancedSearchFusionEnabled) =>
    set({ advancedSearchFusionEnabled }),
  setAdvancedSearchAdaptiveFallbackEnabled: (advancedSearchAdaptiveFallbackEnabled) =>
    set({ advancedSearchAdaptiveFallbackEnabled }),
  setAdvancedSearchFreshnessBoostEnabled: (advancedSearchFreshnessBoostEnabled) =>
    set({ advancedSearchFreshnessBoostEnabled }),
  setAdvancedSearchQualityFilterEnabled: (advancedSearchQualityFilterEnabled) =>
    set({ advancedSearchQualityFilterEnabled }),
  setBundleExtractDocx: (bundleExtractDocx) => set({ bundleExtractDocx }),
  setBundleExtractPptx: (bundleExtractPptx) => set({ bundleExtractPptx }),
  setBundleExtractXlsx: (bundleExtractXlsx) => set({ bundleExtractXlsx }),
  setBundleExtractEpub: (bundleExtractEpub) => set({ bundleExtractEpub }),
  setBundleWaybackFallback: (bundleWaybackFallback) => set({ bundleWaybackFallback }),
  setBundleArxivSearch: (bundleArxivSearch) => set({ bundleArxivSearch }),
  setBundleWikipediaSearch: (bundleWikipediaSearch) => set({ bundleWikipediaSearch }),
  setSearxngSetupError: (searxngSetupError) => set({ searxngSetupError }),
});
