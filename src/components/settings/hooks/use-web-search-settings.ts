import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  invokeClearWebFetchCache,
  invokeGetSearchEngineLogs,
  invokeGetSearchEngineStatus,
  invokeGetWebFetchCacheStats,
  invokeRestartSearchEngine,
  type SearchEngineStatus,
  type WebFetchCacheStats,
} from "@/modules/web-search/tauri-commands";

export function useWebSearchSettings() {
  const defaultWebSearchEnabled = useSettingsStore((s) => s.defaultWebSearchEnabled);
  const setDefaultWebSearchEnabled = useSettingsStore((s) => s.setDefaultWebSearchEnabled);

  const webSearchMaxResults = useSettingsStore((s) => s.webSearchMaxResults);
  const setWebSearchMaxResults = useSettingsStore((s) => s.setWebSearchMaxResults);
  const webSearchContextTokenLimit = useSettingsStore((s) => s.webSearchContextTokenLimit);
  const setWebSearchContextTokenLimit = useSettingsStore((s) => s.setWebSearchContextTokenLimit);
  const webSearchFetchEnabled = useSettingsStore((s) => s.webSearchFetchEnabled);
  const setWebSearchFetchEnabled = useSettingsStore((s) => s.setWebSearchFetchEnabled);
  const webSearchFetchCount = useSettingsStore((s) => s.webSearchFetchCount);
  const setWebSearchFetchCount = useSettingsStore((s) => s.setWebSearchFetchCount);
  const webSearchPerPageTimeoutSecs = useSettingsStore((s) => s.webSearchPerPageTimeoutSecs);
  const setWebSearchPerPageTimeoutSecs = useSettingsStore((s) => s.setWebSearchPerPageTimeoutSecs);
  const webSearchFetchMaxCharsPerSource = useSettingsStore((s) => s.webSearchFetchMaxCharsPerSource);
  const setWebSearchFetchMaxCharsPerSource = useSettingsStore((s) => s.setWebSearchFetchMaxCharsPerSource);
  const advancedSearchBundleEnabled = useSettingsStore((s) => s.advancedSearchBundleEnabled);
  const setAdvancedSearchBundleEnabled = useSettingsStore((s) => s.setAdvancedSearchBundleEnabled);
  const bundleWaybackFallback = useSettingsStore((s) => s.bundleWaybackFallback);
  const setBundleWaybackFallback = useSettingsStore((s) => s.setBundleWaybackFallback);
  const bundleArxivSearch = useSettingsStore((s) => s.bundleArxivSearch);
  const setBundleArxivSearch = useSettingsStore((s) => s.setBundleArxivSearch);
  const bundleWikipediaSearch = useSettingsStore((s) => s.bundleWikipediaSearch);
  const setBundleWikipediaSearch = useSettingsStore((s) => s.setBundleWikipediaSearch);

  const [cacheStats, setCacheStats] = useState<WebFetchCacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearError, setClearError] = useState<string>("");

  const [engineStatus, setEngineStatus] = useState<SearchEngineStatus | null>(null);
  const [engineAction, setEngineAction] = useState<"idle" | "restarting">("idle");
  const [engineError, setEngineError] = useState<string>("");
  const [engineLogs, setEngineLogs] = useState<string>("");

  const refreshEngineStatus = useCallback(async () => {
    try {
      const status = await invokeGetSearchEngineStatus();
      setEngineStatus(status);
      setEngineError("");
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshEngineStatus(), 0);
    const interval = window.setInterval(() => {
      void refreshEngineStatus();
    }, 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshEngineStatus]);

  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await invokeGetWebFetchCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshCacheStats(), 0);
    return () => window.clearTimeout(id);
  }, [refreshCacheStats]);

  async function handleClearCache() {
    setClearingCache(true);
    setClearError("");
    try {
      await invokeClearWebFetchCache();
      await refreshCacheStats();
    } catch (e) {
      setClearError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearingCache(false);
    }
  }

  async function handleRestartEngine() {
    setEngineAction("restarting");
    setEngineError("");
    setEngineLogs("");
    try {
      const status = await invokeRestartSearchEngine();
      setEngineStatus(status);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
      await refreshEngineStatus();
    } finally {
      setEngineAction("idle");
    }
  }

  async function handleLoadLogs() {
    try {
      setEngineLogs(await invokeGetSearchEngineLogs());
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    defaultWebSearchEnabled,
    setDefaultWebSearchEnabled,
    webSearchMaxResults,
    setWebSearchMaxResults,
    webSearchContextTokenLimit,
    setWebSearchContextTokenLimit,
    webSearchFetchEnabled,
    setWebSearchFetchEnabled,
    webSearchFetchCount,
    setWebSearchFetchCount,
    webSearchPerPageTimeoutSecs,
    setWebSearchPerPageTimeoutSecs,
    webSearchFetchMaxCharsPerSource,
    setWebSearchFetchMaxCharsPerSource,
    advancedSearchBundleEnabled,
    setAdvancedSearchBundleEnabled,
    bundleWaybackFallback,
    setBundleWaybackFallback,
    bundleArxivSearch,
    setBundleArxivSearch,
    bundleWikipediaSearch,
    setBundleWikipediaSearch,
    cacheStats,
    clearingCache,
    clearError,
    handleClearCache,
    engineStatus,
    engineAction,
    engineError,
    engineLogs,
    refreshEngineStatus,
    handleRestartEngine,
    handleLoadLogs,
  };
}
