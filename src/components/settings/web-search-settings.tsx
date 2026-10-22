import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useWebSearchSettings } from "./hooks/use-web-search-settings";
import { SearchEngineSection } from "./sections/search-engine-section";
import { SearchParametersSection } from "./sections/search-parameters-section";
import { AdvancedSearchBundleSection } from "./sections/advanced-search-bundle-section";
import { ContentExtractionSection } from "./sections/content-extraction-section";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";
import { Toggle } from "@/components/toggle";

export function WebSearchSettings() {
  const settings = useWebSearchSettings();
  const { effectiveConnectivity } = useConnectivity();
  const isConnectivityOffline = effectiveConnectivity === "offline";

  return (
    <div className="space-y-8">
      {isConnectivityOffline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-[12.5px] font-medium text-amber-100">Offline mode is active</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-amber-100/80">
              Web search is disabled while offline. Searches resume when connectivity returns.
            </p>
          </div>
        </div>
      )}

      <SearchEngineSection
        engineStatus={settings.engineStatus}
        engineAction={settings.engineAction}
        engineError={settings.engineError}
        engineLogs={settings.engineLogs}
        onRestart={settings.handleRestartEngine}
        onLoadLogs={settings.handleLoadLogs}
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
          web search on or off per chat from the composer toolbar.
        </p>
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
            needed. Use the web search button in the composer to enable or
            disable search for the current chat without changing this default.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            Current: {settings.webSearchDefaultMode}
          </div>
        </div>
      </CollapsibleSettingsSection>

      <SearchParametersSection
        webSearchMaxResults={settings.webSearchMaxResults}
        setWebSearchMaxResults={settings.setWebSearchMaxResults}
        webSearchContextTokenLimit={settings.webSearchContextTokenLimit}
        setWebSearchContextTokenLimit={settings.setWebSearchContextTokenLimit}
      />

      <AdvancedSearchBundleSection
        advancedSearchBundleEnabled={settings.advancedSearchBundleEnabled}
        setAdvancedSearchBundleEnabled={settings.setAdvancedSearchBundleEnabled}
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
