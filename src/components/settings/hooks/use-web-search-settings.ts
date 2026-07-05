import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  invokeTestSearxngConnection,
  invokeClearWebFetchCache,
  invokeGetWebFetchCacheStats,
  type WebFetchCacheStats,
} from "@/modules/web-search/tauri-commands";
import {
  invokeCheckSearxngSetup,
  invokeStartSearxngContainer,
  invokeStopSearxngContainer,
  type SearxngSetupStatus,
} from "@/modules/web-search/searxng-setup";

export type TestStatus = "idle" | "testing" | "success" | "error";

export function useWebSearchSettings() {
  const defaultWebSearchEnabled = useSettingsStore((s) => s.defaultWebSearchEnabled);
  const setDefaultWebSearchEnabled = useSettingsStore((s) => s.setDefaultWebSearchEnabled);
  const webSearchSearxngUrl = useSettingsStore((s) => s.webSearchSearxngUrl);
  const setWebSearchSearxngUrl = useSettingsStore((s) => s.setWebSearchSearxngUrl);
  const webSearchDefaultMode = useSettingsStore((s) => s.webSearchDefaultMode);
  const searxngSetupError = useSettingsStore((s) => s.searxngSetupError);

  const webSearchMaxResults = useSettingsStore((s) => s.webSearchMaxResults);
  const setWebSearchMaxResults = useSettingsStore((s) => s.setWebSearchMaxResults);
  const webSearchTimeRange = useSettingsStore((s) => s.webSearchTimeRange);
  const setWebSearchTimeRange = useSettingsStore((s) => s.setWebSearchTimeRange);
  const webSearchCategories = useSettingsStore((s) => s.webSearchCategories);
  const setWebSearchCategories = useSettingsStore((s) => s.setWebSearchCategories);
  const webSearchSafeSearch = useSettingsStore((s) => s.webSearchSafeSearch);
  const setWebSearchSafeSearch = useSettingsStore((s) => s.setWebSearchSafeSearch);
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
  const advancedSearchMultiQueryEnabled = useSettingsStore((s) => s.advancedSearchMultiQueryEnabled);
  const setAdvancedSearchMultiQueryEnabled = useSettingsStore((s) => s.setAdvancedSearchMultiQueryEnabled);
  const advancedSearchFusionEnabled = useSettingsStore((s) => s.advancedSearchFusionEnabled);
  const setAdvancedSearchFusionEnabled = useSettingsStore((s) => s.setAdvancedSearchFusionEnabled);
  const advancedSearchAdaptiveFallbackEnabled = useSettingsStore((s) => s.advancedSearchAdaptiveFallbackEnabled);
  const setAdvancedSearchAdaptiveFallbackEnabled = useSettingsStore((s) => s.setAdvancedSearchAdaptiveFallbackEnabled);
  const advancedSearchFreshnessBoostEnabled = useSettingsStore((s) => s.advancedSearchFreshnessBoostEnabled);
  const setAdvancedSearchFreshnessBoostEnabled = useSettingsStore((s) => s.setAdvancedSearchFreshnessBoostEnabled);
  const advancedSearchQualityFilterEnabled = useSettingsStore((s) => s.advancedSearchQualityFilterEnabled);
  const setAdvancedSearchQualityFilterEnabled = useSettingsStore((s) => s.setAdvancedSearchQualityFilterEnabled);
  const bundleExtractDocx = useSettingsStore((s) => s.bundleExtractDocx);
  const setBundleExtractDocx = useSettingsStore((s) => s.setBundleExtractDocx);
  const bundleExtractPptx = useSettingsStore((s) => s.bundleExtractPptx);
  const setBundleExtractPptx = useSettingsStore((s) => s.setBundleExtractPptx);
  const bundleExtractXlsx = useSettingsStore((s) => s.bundleExtractXlsx);
  const setBundleExtractXlsx = useSettingsStore((s) => s.setBundleExtractXlsx);
  const bundleExtractEpub = useSettingsStore((s) => s.bundleExtractEpub);
  const setBundleExtractEpub = useSettingsStore((s) => s.setBundleExtractEpub);
  const bundleWaybackFallback = useSettingsStore((s) => s.bundleWaybackFallback);
  const setBundleWaybackFallback = useSettingsStore((s) => s.setBundleWaybackFallback);
  const bundleArxivSearch = useSettingsStore((s) => s.bundleArxivSearch);
  const setBundleArxivSearch = useSettingsStore((s) => s.setBundleArxivSearch);
  const bundleWikipediaSearch = useSettingsStore((s) => s.bundleWikipediaSearch);
  const setBundleWikipediaSearch = useSettingsStore((s) => s.setBundleWikipediaSearch);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string>("");
  const [cacheStats, setCacheStats] = useState<WebFetchCacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearError, setClearError] = useState<string>("");

  const [setupStatus, setSetupStatus] = useState<SearxngSetupStatus | null>(null);
  const [containerAction, setContainerAction] = useState<"idle" | "starting" | "stopping">("idle");
  const [containerError, setContainerError] = useState<string>("");

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await invokeCheckSearxngSetup();
      setSetupStatus(status);
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshSetupStatus(), 0);
    return () => window.clearTimeout(id);
  }, [refreshSetupStatus]);

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

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestError("");
    try {
      const ok = await invokeTestSearxngConnection(webSearchSearxngUrl);
      setTestStatus(ok ? "success" : "error");
      if (!ok) setTestError("Connection failed. Check the URL and try again.");
    } catch (e) {
      setTestStatus("error");
      setTestError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleStartContainer() {
    setContainerAction("starting");
    setContainerError("");
    try {
      const url = await invokeStartSearxngContainer();
      setWebSearchSearxngUrl(url);
      await refreshSetupStatus();
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    } finally {
      setContainerAction("idle");
    }
  }

  async function handleStopContainer() {
    setContainerAction("stopping");
    setContainerError("");
    try {
      await invokeStopSearxngContainer();
      await refreshSetupStatus();
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    } finally {
      setContainerAction("idle");
    }
  }

  const dockerInstalled = setupStatus?.docker_installed ?? false;
  const dockerDaemonRunning = setupStatus?.docker_daemon_running ?? false;
  const containerRunning = setupStatus?.container_running ?? false;
  const containerExists = setupStatus?.container_exists ?? false;
  const setupError = containerError || searxngSetupError;

  return {
    defaultWebSearchEnabled,
    setDefaultWebSearchEnabled,
    webSearchSearxngUrl,
    setWebSearchSearxngUrl,
    webSearchDefaultMode,
    webSearchMaxResults,
    setWebSearchMaxResults,
    webSearchTimeRange,
    setWebSearchTimeRange,
    webSearchCategories,
    setWebSearchCategories,
    webSearchSafeSearch,
    setWebSearchSafeSearch,
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
    advancedSearchMultiQueryEnabled,
    setAdvancedSearchMultiQueryEnabled,
    advancedSearchFusionEnabled,
    setAdvancedSearchFusionEnabled,
    advancedSearchAdaptiveFallbackEnabled,
    setAdvancedSearchAdaptiveFallbackEnabled,
    advancedSearchFreshnessBoostEnabled,
    setAdvancedSearchFreshnessBoostEnabled,
    advancedSearchQualityFilterEnabled,
    setAdvancedSearchQualityFilterEnabled,
    bundleExtractDocx,
    setBundleExtractDocx,
    bundleExtractPptx,
    setBundleExtractPptx,
    bundleExtractXlsx,
    setBundleExtractXlsx,
    bundleExtractEpub,
    setBundleExtractEpub,
    bundleWaybackFallback,
    setBundleWaybackFallback,
    bundleArxivSearch,
    setBundleArxivSearch,
    bundleWikipediaSearch,
    setBundleWikipediaSearch,
    testStatus,
    testError,
    cacheStats,
    clearingCache,
    clearError,
    dockerInstalled,
    dockerDaemonRunning,
    containerRunning,
    containerExists,
    setupError,
    containerAction,
    handleClearCache,
    handleTestConnection,
    handleStartContainer,
    handleStopContainer,
  };
}
