import { Toggle } from "@/components/toggle";
import { CollapsibleSettingsSection } from "../collapsible-settings-section";
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
    <CollapsibleSettingsSection
      subsectionKey="webSearch:extraction"
      title="Content Extraction"
      description="Fetch full pages, timeouts, and local cache."
      keywords={["fetch", "readability", "cache", "timeout", "extract"]}
    >
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <Toggle
          label="Fetch and extract full page content"
          on={webSearchFetchEnabled}
          onChange={setWebSearchFetchEnabled}
        />
        <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
          When on, Veyra fetches each result page and extracts the readable
          article body using Mozilla Readability. Failures fall back to the
          search snippet and mark the source as unavailable.
        </p>
      </div>

      {webSearchFetchEnabled && (
        <>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-white">
                  Pages to fetch per search
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  Top N results to fetch. Higher values use more time and
                  context.
                </div>
              </div>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                {webSearchFetchCount}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={webSearchFetchCount}
              onChange={(e) => setWebSearchFetchCount(parseInt(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-white">
                  Per-page timeout (seconds)
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  How long to wait for a page before giving up.
                </div>
              </div>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                {webSearchPerPageTimeoutSecs}s
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={webSearchPerPageTimeoutSecs}
              onChange={(e) =>
                setWebSearchPerPageTimeoutSecs(parseInt(e.target.value))
              }
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>2s</span>
              <span>15s</span>
              <span>30s</span>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-white">
                  Characters per fetched page
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  Max characters extracted from each page. Readability text
                  is denser than raw HTML, so even small values give the AI
                  a lot of context.
                </div>
              </div>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                {(webSearchFetchMaxCharsPerSource / 1000).toFixed(0)}K
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={50000}
              step={1000}
              value={webSearchFetchMaxCharsPerSource}
              onChange={(e) =>
                setWebSearchFetchMaxCharsPerSource(parseInt(e.target.value))
              }
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1K</span>
              <span>25K</span>
              <span>50K</span>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[12.5px] font-medium text-white">Cache</div>
              <div className="font-mono text-[11.5px] text-[var(--color-text-dim)]">
                {cacheStats
                  ? `${cacheStats.entries} ${cacheStats.entries === 1 ? "entry" : "entries"} · ${(cacheStats.total_bytes / (1024 * 1024)).toFixed(2)} MB`
                  : "—"}
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-dim)]">
              Extracted pages are cached locally for 24 hours. The cache is
              capped at 50 MB; oldest entries are pruned first.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClearCache}
                disabled={clearingCache || !cacheStats || cacheStats.entries === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clearingCache ? "Clearing…" : "Clear cache"}
              </button>
              {clearError && (
                <span className="text-[11px] text-red-400">{clearError}</span>
              )}
            </div>
          </div>
        </>
      )}
    </CollapsibleSettingsSection>
  );
}
