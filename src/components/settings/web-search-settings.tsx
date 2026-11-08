import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useWebSearchSettings } from "./hooks/use-web-search-settings";
import { SearchEngineSection } from "./sections/search-engine-section";
import { SearchParametersSection } from "./sections/search-parameters-section";
import { AdvancedSearchBundleSection } from "./sections/advanced-search-bundle-section";
import { ContentExtractionSection } from "./sections/content-extraction-section";
import { Toggle } from "@/components/toggle";
import {
  SettingRow,
  SettingsCallout,
  SettingsCard,
  SettingsPanel,
  SettingsRows,
} from "./settings-ui";

export function WebSearchSettings() {
  const settings = useWebSearchSettings();
  const { effectiveConnectivity } = useConnectivity();
  const isConnectivityOffline = effectiveConnectivity === "offline";

  return (
    <>
      {isConnectivityOffline && (
        <SettingsCallout tone="warning" title="Offline mode is active">
          Web search stays disabled while offline. Searches resume when connectivity returns.
        </SettingsCallout>
      )}

      <SettingsPanel
        title="Web search"
        description="Veyra searches with the bundled local engine, then reads the pages it finds."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Search by default"
              description="New chats start with web search on. Toggle it per chat from Chat settings, and the model decides when a search is actually needed."
            >
              <Toggle
                ariaLabel="Enable web search by default"
                on={settings.defaultWebSearchEnabled}
                onChange={settings.setDefaultWebSearchEnabled}
              />
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <SearchEngineSection
        engineStatus={settings.engineStatus}
        engineAction={settings.engineAction}
        engineError={settings.engineError}
        engineLogs={settings.engineLogs}
        onRestart={settings.handleRestartEngine}
        onLoadLogs={settings.handleLoadLogs}
      />

      <SearchParametersSection
        webSearchMaxResults={settings.webSearchMaxResults}
        setWebSearchMaxResults={settings.setWebSearchMaxResults}
        webSearchContextTokenLimit={settings.webSearchContextTokenLimit}
        setWebSearchContextTokenLimit={settings.setWebSearchContextTokenLimit}
      />

      <AdvancedSearchBundleSection
        advancedSearchBundleEnabled={settings.advancedSearchBundleEnabled}
        setAdvancedSearchBundleEnabled={settings.setAdvancedSearchBundleEnabled}
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
    </>
  );
}
