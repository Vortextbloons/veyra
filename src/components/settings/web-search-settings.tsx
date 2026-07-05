import { CheckCircle, XCircle, Loader2, Shield } from "lucide-react";
import { Toggle } from "@/components/toggle";
import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useWebSearchSettings } from "./hooks/use-web-search-settings";
import { SearxngServerSection } from "./sections/searxng-server-section";
import { SearchParametersSection } from "./sections/search-parameters-section";
import { AdvancedSearchBundleSection } from "./sections/advanced-search-bundle-section";
import { ContentExtractionSection } from "./sections/content-extraction-section";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";

export function WebSearchSettings() {
  const settings = useWebSearchSettings();
  const { effectiveConnectivity } = useConnectivity();
  const isConnectivityOffline = effectiveConnectivity === "offline";

  return (
    <div className="space-y-8">
      {isConnectivityOffline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <Shield className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-[12.5px] font-medium text-amber-100">Offline mode is active</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-amber-100/80">
              Web search is disabled while offline. You can still configure SearXNG manually, but
              searches will not run until connectivity is restored.
            </p>
          </div>
        </div>
      )}

      <SearxngServerSection
        dockerInstalled={settings.dockerInstalled}
        dockerDaemonRunning={settings.dockerDaemonRunning}
        containerRunning={settings.containerRunning}
        containerExists={settings.containerExists}
        containerAction={settings.containerAction}
        setupError={settings.setupError}
        onStartContainer={settings.handleStartContainer}
        onStopContainer={settings.handleStopContainer}
      />

      <CollapsibleSettingsSection
        subsectionKey="webSearch:general"
        title="Web Search"
        description="Default on/off for new chats."
        keywords={["enable", "default", "toggle"]}
        defaultExpanded
      >
        <div className="flex flex-wrap gap-2">
          <Toggle
            label="Enable web search by default"
            on={settings.defaultWebSearchEnabled}
            onChange={settings.setDefaultWebSearchEnabled}
          />
        </div>
        <p className="text-[11px] text-[var(--color-text-dim)]">
          When on, new chats start with web search enabled. You can still turn
          web search on or off per chat from the tools panel.
        </p>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="webSearch:provider"
        title="SearXNG Provider"
        description="Instance URL and connection test."
        keywords={["url", "localhost", "connection", "test"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">
              SearXNG Instance URL
            </div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              {settings.containerRunning
                ? "Auto-configured from Docker. You can override this with a custom URL."
                : "Enter the URL of your SearXNG instance."}
            </div>
          </div>
          <input
            type="text"
            value={settings.webSearchSearxngUrl}
            onChange={(e) => settings.setWebSearchSearxngUrl(e.target.value)}
            placeholder="http://localhost:8888"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={settings.handleTestConnection}
            disabled={settings.testStatus === "testing" || !settings.webSearchSearxngUrl.trim()}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {settings.testStatus === "testing" ? "Testing…" : "Test Connection"}
          </button>

          {settings.testStatus === "testing" && (
            <Loader2 className="size-3.5 animate-spin text-[var(--color-text-dim)]" />
          )}
          {settings.testStatus === "success" && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle className="size-3.5" />
              Connected
            </span>
          )}
          {settings.testStatus === "error" && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <XCircle className="size-3.5" />
              {settings.testError}
            </span>
          )}
        </div>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="webSearch:mode"
        title="Search Mode"
        description="How the AI decides when to search."
        keywords={["auto", "always", "off", "mode"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-[12.5px] font-medium text-white">
            Auto When Needed
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            When web search is on for a chat, the AI decides when a search is
            needed. Use the right-panel toggle to enable or disable search for
            the current chat without changing this default.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            Current: {settings.webSearchDefaultMode}
          </div>
        </div>
      </CollapsibleSettingsSection>

      <SearchParametersSection
        webSearchMaxResults={settings.webSearchMaxResults}
        setWebSearchMaxResults={settings.setWebSearchMaxResults}
        webSearchTimeRange={settings.webSearchTimeRange}
        setWebSearchTimeRange={settings.setWebSearchTimeRange}
        webSearchCategories={settings.webSearchCategories}
        setWebSearchCategories={settings.setWebSearchCategories}
        webSearchSafeSearch={settings.webSearchSafeSearch}
        setWebSearchSafeSearch={settings.setWebSearchSafeSearch}
        webSearchContextTokenLimit={settings.webSearchContextTokenLimit}
        setWebSearchContextTokenLimit={settings.setWebSearchContextTokenLimit}
      />

      <AdvancedSearchBundleSection
        advancedSearchBundleEnabled={settings.advancedSearchBundleEnabled}
        setAdvancedSearchBundleEnabled={settings.setAdvancedSearchBundleEnabled}
        advancedSearchMultiQueryEnabled={settings.advancedSearchMultiQueryEnabled}
        setAdvancedSearchMultiQueryEnabled={settings.setAdvancedSearchMultiQueryEnabled}
        advancedSearchFusionEnabled={settings.advancedSearchFusionEnabled}
        setAdvancedSearchFusionEnabled={settings.setAdvancedSearchFusionEnabled}
        advancedSearchAdaptiveFallbackEnabled={settings.advancedSearchAdaptiveFallbackEnabled}
        setAdvancedSearchAdaptiveFallbackEnabled={settings.setAdvancedSearchAdaptiveFallbackEnabled}
        advancedSearchFreshnessBoostEnabled={settings.advancedSearchFreshnessBoostEnabled}
        setAdvancedSearchFreshnessBoostEnabled={settings.setAdvancedSearchFreshnessBoostEnabled}
        advancedSearchQualityFilterEnabled={settings.advancedSearchQualityFilterEnabled}
        setAdvancedSearchQualityFilterEnabled={settings.setAdvancedSearchQualityFilterEnabled}
        bundleExtractDocx={settings.bundleExtractDocx}
        setBundleExtractDocx={settings.setBundleExtractDocx}
        bundleExtractPptx={settings.bundleExtractPptx}
        setBundleExtractPptx={settings.setBundleExtractPptx}
        bundleExtractXlsx={settings.bundleExtractXlsx}
        setBundleExtractXlsx={settings.setBundleExtractXlsx}
        bundleExtractEpub={settings.bundleExtractEpub}
        setBundleExtractEpub={settings.setBundleExtractEpub}
        bundleWaybackFallback={settings.bundleWaybackFallback}
        setBundleWaybackFallback={settings.setBundleWaybackFallback}
        bundleArxivSearch={settings.bundleArxivSearch}
        setBundleArxivSearch={settings.setBundleArxivSearch}
        bundleWikipediaSearch={settings.bundleWikipediaSearch}
        setBundleWikipediaSearch={settings.setBundleWikipediaSearch}
      />

      <ContentExtractionSection
        webSearchFetchEnabled={settings.webSearchFetchEnabled}
        setWebSearchFetchEnabled={settings.setWebSearchFetchEnabled}
        webSearchFetchCount={settings.webSearchFetchCount}
        setWebSearchFetchCount={settings.setWebSearchFetchCount}
        webSearchPerPageTimeoutSecs={settings.webSearchPerPageTimeoutSecs}
        setWebSearchPerPageTimeoutSecs={settings.setWebSearchPerPageTimeoutSecs}
        webSearchFetchMaxCharsPerSource={settings.webSearchFetchMaxCharsPerSource}
        setWebSearchFetchMaxCharsPerSource={settings.setWebSearchFetchMaxCharsPerSource}
        cacheStats={settings.cacheStats}
        clearingCache={settings.clearingCache}
        clearError={settings.clearError}
        onClearCache={settings.handleClearCache}
      />
    </div>
  );
}
