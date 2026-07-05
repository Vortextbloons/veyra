import { Toggle } from "@/components/toggle";
import { CollapsibleSettingsSection } from "../collapsible-settings-section";

const noopToggle = () => {};

function AdvancedSearchToggleRow({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/45 px-3 py-2">
      <Toggle label={label} on={on} onChange={onChange} />
      <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-text-dim)]">
        {description}
      </p>
    </div>
  );
}

interface AdvancedSearchBundleSectionProps {
  advancedSearchBundleEnabled: boolean;
  setAdvancedSearchBundleEnabled: (v: boolean) => void;
  advancedSearchMultiQueryEnabled: boolean;
  setAdvancedSearchMultiQueryEnabled: (v: boolean) => void;
  advancedSearchFusionEnabled: boolean;
  setAdvancedSearchFusionEnabled: (v: boolean) => void;
  advancedSearchAdaptiveFallbackEnabled: boolean;
  setAdvancedSearchAdaptiveFallbackEnabled: (v: boolean) => void;
  advancedSearchFreshnessBoostEnabled: boolean;
  setAdvancedSearchFreshnessBoostEnabled: (v: boolean) => void;
  advancedSearchQualityFilterEnabled: boolean;
  setAdvancedSearchQualityFilterEnabled: (v: boolean) => void;
  bundleExtractDocx: boolean;
  setBundleExtractDocx: (v: boolean) => void;
  bundleExtractPptx: boolean;
  setBundleExtractPptx: (v: boolean) => void;
  bundleExtractXlsx: boolean;
  setBundleExtractXlsx: (v: boolean) => void;
  bundleExtractEpub: boolean;
  setBundleExtractEpub: (v: boolean) => void;
  bundleWaybackFallback: boolean;
  setBundleWaybackFallback: (v: boolean) => void;
  bundleArxivSearch: boolean;
  setBundleArxivSearch: (v: boolean) => void;
  bundleWikipediaSearch: boolean;
  setBundleWikipediaSearch: (v: boolean) => void;
}

export function AdvancedSearchBundleSection({
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
}: AdvancedSearchBundleSectionProps) {
  return (
    <CollapsibleSettingsSection
      subsectionKey="webSearch:bundle"
      title="Advanced Search Bundle"
      description="Optional extractors for non-HTML sources (YouTube transcripts, PDF text, Office documents, EPUB, and direct API providers)."
      keywords={["youtube", "transcript", "pdf", "bundle", "advanced", "docx", "epub", "arxiv", "wikipedia"]}
    >
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <Toggle
          label="Enable Advanced Search Bundle"
          on={advancedSearchBundleEnabled}
          onChange={setAdvancedSearchBundleEnabled}
        />
        <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
          When on, search results from YouTube, PDF, Office documents, and
          EPUB files are extracted using dedicated handlers. Wayback Machine
          fallback recovers content from failed fetches. Direct API providers
          (ArXiv, Wikipedia) supplement SearXNG results.
        </p>
      </div>

      {advancedSearchBundleEnabled && (
        <>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-3">
              <div className="text-[12.5px] font-medium text-white">Search Intelligence</div>
              <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
                Controls how Veyra expands, ranks, and cleans up result sets before sources are injected into chat.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <AdvancedSearchToggleRow
                label="Multi-query expansion"
                on={advancedSearchMultiQueryEnabled}
                onChange={setAdvancedSearchMultiQueryEnabled}
                description="Runs broad, recent, academic, primary-source, and opposing-view query variants."
              />
              <AdvancedSearchToggleRow
                label="Result fusion and reranking"
                on={advancedSearchFusionEnabled}
                onChange={setAdvancedSearchFusionEnabled}
                description="Deduplicates results, boosts authority/extraction success, and diversifies domains."
              />
              <AdvancedSearchToggleRow
                label="Adaptive fallback searches"
                on={advancedSearchAdaptiveFallbackEnabled}
                onChange={setAdvancedSearchAdaptiveFallbackEnabled}
                description="Broadens weak searches when too few usable results come back."
              />
              <AdvancedSearchToggleRow
                label="Freshness boost"
                on={advancedSearchFreshnessBoostEnabled}
                onChange={setAdvancedSearchFreshnessBoostEnabled}
                description="Gives recently published sources a small lift without hiding older authority pages."
              />
              <AdvancedSearchToggleRow
                label="Quality domain filter"
                on={advancedSearchQualityFilterEnabled}
                onChange={setAdvancedSearchQualityFilterEnabled}
                description="Suppresses low-signal domains when enough better alternatives are available."
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-3">
              <div className="text-[12.5px] font-medium text-white">Content Sources</div>
              <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
                Enables richer extraction for result types that normal webpage parsing does not handle well.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <AdvancedSearchToggleRow
                label="YouTube transcripts"
                on={true}
                onChange={noopToggle}
                description="Always available. Extracts public captions/transcripts when present."
              />
              <AdvancedSearchToggleRow
                label="PDF text extraction"
                on={true}
                onChange={noopToggle}
                description="Always available. Extracts text from PDF documents."
              />
              <AdvancedSearchToggleRow
                label="DOCX documents"
                on={bundleExtractDocx}
                onChange={setBundleExtractDocx}
                description="Extracts text from Word documents."
              />
              <AdvancedSearchToggleRow
                label="PowerPoint presentations"
                on={bundleExtractPptx}
                onChange={setBundleExtractPptx}
                description="Extracts slide text from presentations."
              />
              <AdvancedSearchToggleRow
                label="Excel spreadsheets"
                on={bundleExtractXlsx}
                onChange={setBundleExtractXlsx}
                description="Extracts readable cell data from spreadsheets."
              />
              <AdvancedSearchToggleRow
                label="EPUB books"
                on={bundleExtractEpub}
                onChange={setBundleExtractEpub}
                description="Extracts text from EPUB e-books."
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-3">
              <div className="text-[12.5px] font-medium text-white">Recovery and Direct Sources</div>
              <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
                Adds fallback retrieval and direct provider results that supplement SearXNG.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <AdvancedSearchToggleRow
                label="Wayback Machine fallback"
                on={bundleWaybackFallback}
                onChange={setBundleWaybackFallback}
                description="Tries an Internet Archive copy when a page fails to load."
              />
              <AdvancedSearchToggleRow
                label="ArXiv academic search"
                on={bundleArxivSearch}
                onChange={setBundleArxivSearch}
                description="Includes paper abstracts via ArXiv when allowed by the active research depth."
              />
              <AdvancedSearchToggleRow
                label="Wikipedia search"
                on={bundleWikipediaSearch}
                onChange={setBundleWikipediaSearch}
                description="Includes article content from Wikipedia when allowed by the active research depth."
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 text-[12.5px] font-medium text-white">
              Active Capabilities
            </div>
            <ul className="space-y-1 text-[11px] text-[var(--color-text-dim)]">
              <li>• YouTube videos → captions/transcripts</li>
              <li>• PDF documents → text extraction</li>
              {advancedSearchMultiQueryEnabled && <li>• Multi-query expansion for broader coverage</li>}
              {advancedSearchFusionEnabled && <li>• Result fusion, authority boosts, and domain diversification</li>}
              {advancedSearchAdaptiveFallbackEnabled && <li>• Adaptive fallback when searches are sparse</li>}
              {advancedSearchFreshnessBoostEnabled && <li>• Freshness boost for recently published sources</li>}
              {advancedSearchQualityFilterEnabled && <li>• Quality domain filtering when alternatives are available</li>}
              {bundleExtractDocx && <li>• DOCX documents → text extraction</li>}
              {bundleExtractPptx && <li>• PowerPoint presentations → slide text</li>}
              {bundleExtractXlsx && <li>• Excel spreadsheets → cell data</li>}
              {bundleExtractEpub && <li>• EPUB books → text extraction</li>}
              {bundleWaybackFallback && <li>• Wayback Machine fallback for failed fetches</li>}
              {bundleArxivSearch && <li>• ArXiv direct API for academic papers</li>}
              {bundleWikipediaSearch && <li>• Wikipedia direct API for article content</li>}
            </ul>
          </div>
        </>
      )}
    </CollapsibleSettingsSection>
  );
}
