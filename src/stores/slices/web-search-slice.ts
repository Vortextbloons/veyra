import type { StateCreator } from "zustand";

export type WebSearchSliceState = {
  defaultWebSearchEnabled: boolean;
  webSearchDefaultMode: "auto" | "always" | "off";
  webSearchMaxResults: number;
  webSearchContextTokenLimit: number;
  webSearchFetchEnabled: boolean;
  webSearchFetchCount: number;
  webSearchPerPageTimeoutSecs: number;
  webSearchFetchMaxCharsPerSource: number;
  webSearchSpeedPreset: "normal" | "fast";
  advancedSearchBundleEnabled: boolean;
  bundleExtractDocx: boolean;
  bundleExtractPptx: boolean;
  bundleExtractXlsx: boolean;
  bundleExtractEpub: boolean;
  bundleWaybackFallback: boolean;
  bundleArxivSearch: boolean;
  bundleWikipediaSearch: boolean;
};

export type WebSearchSliceActions = {
  setDefaultWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchMaxResults: (n: number) => void;
  setWebSearchContextTokenLimit: (n: number) => void;
  setWebSearchFetchEnabled: (enabled: boolean) => void;
  setWebSearchFetchCount: (n: number) => void;
  setWebSearchPerPageTimeoutSecs: (secs: number) => void;
  setWebSearchFetchMaxCharsPerSource: (n: number) => void;
  setWebSearchSpeedPreset: (preset: "normal" | "fast") => void;
  setAdvancedSearchBundleEnabled: (enabled: boolean) => void;
  setBundleExtractDocx: (enabled: boolean) => void;
  setBundleExtractPptx: (enabled: boolean) => void;
  setBundleExtractXlsx: (enabled: boolean) => void;
  setBundleExtractEpub: (enabled: boolean) => void;
  setBundleWaybackFallback: (enabled: boolean) => void;
  setBundleArxivSearch: (enabled: boolean) => void;
  setBundleWikipediaSearch: (enabled: boolean) => void;
};

export const DEFAULT_WEB_SEARCH_STATE: WebSearchSliceState = {
  defaultWebSearchEnabled: false,
  webSearchDefaultMode: "auto",
  webSearchMaxResults: 8,
  webSearchContextTokenLimit: 4000,
  webSearchFetchEnabled: true,
  webSearchFetchCount: 5,
  webSearchPerPageTimeoutSecs: 8,
  webSearchFetchMaxCharsPerSource: 8000,
  webSearchSpeedPreset: "normal",
  advancedSearchBundleEnabled: true,
  bundleExtractDocx: true,
  bundleExtractPptx: true,
  bundleExtractXlsx: true,
  bundleExtractEpub: true,
  bundleWaybackFallback: true,
  bundleArxivSearch: true,
  bundleWikipediaSearch: true,
};

export type WebSearchSlice = WebSearchSliceState & WebSearchSliceActions;

export const createWebSearchSlice: StateCreator<WebSearchSlice, [], [], WebSearchSlice> = (set) => ({
  ...DEFAULT_WEB_SEARCH_STATE,
  setDefaultWebSearchEnabled: (defaultWebSearchEnabled) => set({ defaultWebSearchEnabled }),
  setWebSearchMaxResults: (webSearchMaxResults) => set({ webSearchMaxResults }),
  setWebSearchContextTokenLimit: (webSearchContextTokenLimit) =>
    set({ webSearchContextTokenLimit }),
  setWebSearchFetchEnabled: (webSearchFetchEnabled) => set({ webSearchFetchEnabled }),
  setWebSearchFetchCount: (webSearchFetchCount) => set({ webSearchFetchCount }),
  setWebSearchPerPageTimeoutSecs: (webSearchPerPageTimeoutSecs) =>
    set({ webSearchPerPageTimeoutSecs }),
  setWebSearchFetchMaxCharsPerSource: (webSearchFetchMaxCharsPerSource) =>
    set({ webSearchFetchMaxCharsPerSource }),
  setWebSearchSpeedPreset: (webSearchSpeedPreset) => set({ webSearchSpeedPreset }),
  setAdvancedSearchBundleEnabled: (advancedSearchBundleEnabled) =>
    set({ advancedSearchBundleEnabled }),
  setBundleExtractDocx: (bundleExtractDocx) => set({ bundleExtractDocx }),
  setBundleExtractPptx: (bundleExtractPptx) => set({ bundleExtractPptx }),
  setBundleExtractXlsx: (bundleExtractXlsx) => set({ bundleExtractXlsx }),
  setBundleExtractEpub: (bundleExtractEpub) => set({ bundleExtractEpub }),
  setBundleWaybackFallback: (bundleWaybackFallback) => set({ bundleWaybackFallback }),
  setBundleArxivSearch: (bundleArxivSearch) => set({ bundleArxivSearch }),
  setBundleWikipediaSearch: (bundleWikipediaSearch) => set({ bundleWikipediaSearch }),
});
