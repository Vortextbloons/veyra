import { Toggle } from "@/components/toggle";
import { SliderControl } from "@/components/ui/slider-control";
import {
  SettingRow,
  SettingsCard,
  SettingsPanel,
  SettingsRows,
  settingsButtonClass,
} from "../settings-ui";
import type { WebFetchCacheStats } from "@/modules/web-search/tauri-commands";

interface ContentExtractionSectionProps {
  webSearchFetchEnabled: boolean;
  setWebSearchFetchEnabled: (v: boolean) => void;
  webSearchFetchCount: number;
  setWebSearchFetchCount: (v: number) => void;
  webSearchPerPageTimeoutSecs: number;
  setWebSearchPerPageTimeoutSecs: (v: number) => void;
  webSearchFetchMaxCharsPerSource: number;
  setWebSearchFetchMaxCharsPerSource: (v: number) => void;
  cacheStats: WebFetchCacheStats | null;
  clearingCache: boolean;
  clearError: string;
  onClearCache: () => void;
}

export function ContentExtractionSection({
  webSearchFetchEnabled,
  setWebSearchFetchEnabled,
  webSearchFetchCount,
  setWebSearchFetchCount,
  webSearchPerPageTimeoutSecs,
  setWebSearchPerPageTimeoutSecs,
  webSearchFetchMaxCharsPerSource,
  setWebSearchFetchMaxCharsPerSource,
  cacheStats,
  clearingCache,
  clearError,
  onClearCache,
}: ContentExtractionSectionProps) {
  return (
    <SettingsPanel
      title="Page reading"
      description="Opening result pages gives the model real content instead of search snippets."
    >
      <SettingsCard>
        <SettingsRows>
          <SettingRow
            label="Read full pages"
            description="Fetches each result and extracts the readable article body. Failed pages fall back to the snippet."
          >
            <Toggle
              ariaLabel="Read full pages"
              on={webSearchFetchEnabled}
              onChange={setWebSearchFetchEnabled}
            />
          </SettingRow>
        </SettingsRows>

        {webSearchFetchEnabled && (
          <div className="space-y-5 border-t border-[var(--color-border)] px-5 py-4">
            <div className="grid gap-5 md:grid-cols-3">
              <SliderControl
                label="Pages per search"
                description="Top results opened each search."
                value={webSearchFetchCount}
                onChange={setWebSearchFetchCount}
                min={1}
                max={10}
                step={1}
                formatValue={(n) => `${n}`}
              />
              <SliderControl
                label="Page timeout"
                description="Seconds to wait before giving up."
                value={webSearchPerPageTimeoutSecs}
                onChange={setWebSearchPerPageTimeoutSecs}
                min={2}
                max={30}
                step={1}
                formatValue={(n) => `${n}s`}
              />
              <SliderControl
                label="Characters per page"
                description="Cap on extracted text per page."
                value={webSearchFetchMaxCharsPerSource}
                onChange={setWebSearchFetchMaxCharsPerSource}
                min={1000}
                max={50000}
                step={1000}
                formatValue={(n) => `${(n / 1000).toFixed(0)}K`}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white">Local page cache</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
              {cacheStats
                ? `${cacheStats.entries} ${cacheStats.entries === 1 ? "page" : "pages"} · ${(cacheStats.total_bytes / (1024 * 1024)).toFixed(2)} MB · kept 24 hours, capped at 50 MB`
                : "Extracted pages are kept for 24 hours, capped at 50 MB."}
            </p>
            {clearError && <p className="mt-1 text-[12px] text-red-300">{clearError}</p>}
          </div>
          <button
            type="button"
            onClick={onClearCache}
            disabled={clearingCache || !cacheStats || cacheStats.entries === 0}
            className={settingsButtonClass}
          >
            {clearingCache ? "Clearing…" : "Clear cache"}
          </button>
        </div>
      </SettingsCard>
    </SettingsPanel>
  );
}
