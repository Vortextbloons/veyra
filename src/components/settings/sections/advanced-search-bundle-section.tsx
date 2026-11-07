import { Toggle } from "@/components/toggle";
import {
  SettingRow,
  SettingsCard,
  SettingsPanel,
  SettingsRows,
} from "../settings-ui";

const noopToggle = () => {};

function SourceToggle({
  label,
  description,
  on,
  onChange,
  locked = false,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: (enabled: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.05] bg-black/20 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-white">{label}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
          {description}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle ariaLabel={label} on={on} onChange={onChange} disabled={locked} />
      </div>
    </div>
  );
}

interface AdvancedSearchBundleSectionProps {
  advancedSearchBundleEnabled: boolean;
  setAdvancedSearchBundleEnabled: (v: boolean) => void;
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
    <SettingsPanel
      title="Sources and extraction"
      description="Dedicated handlers for document types that plain page parsing reads badly, plus recovery and direct sources."
    >
      <SettingsCard>
        <SettingsRows>
          <SettingRow
            label="Advanced source bundle"
            description="Extract YouTube transcripts, PDFs, Office documents, and EPUB files from search results."
          >
            <Toggle
              ariaLabel="Advanced source bundle"
              on={advancedSearchBundleEnabled}
              onChange={setAdvancedSearchBundleEnabled}
            />
          </SettingRow>
        </SettingsRows>

        {advancedSearchBundleEnabled && (
          <>
            <div className="grid gap-2 border-t border-[var(--color-border)] p-3 md:grid-cols-2 2xl:grid-cols-3">
              <SourceToggle
                label="YouTube transcripts"
                description="Reads public captions when a result is a video."
                on
                onChange={noopToggle}
                locked
              />
              <SourceToggle
                label="PDF text extraction"
                description="Pulls readable text out of PDF documents."
                on
                onChange={noopToggle}
                locked
              />
              <SourceToggle
                label="Word documents"
                description="Extracts text from DOCX files."
                on={bundleExtractDocx}
                onChange={setBundleExtractDocx}
              />
              <SourceToggle
                label="PowerPoint slides"
                description="Extracts slide text from PPTX files."
                on={bundleExtractPptx}
                onChange={setBundleExtractPptx}
              />
              <SourceToggle
                label="Excel spreadsheets"
                description="Reads cell data from XLSX files."
                on={bundleExtractXlsx}
                onChange={setBundleExtractXlsx}
              />
              <SourceToggle
                label="EPUB books"
                description="Extracts text from EPUB e-books."
                on={bundleExtractEpub}
                onChange={setBundleExtractEpub}
              />
              <SourceToggle
                label="Wayback Machine fallback"
                description="Tries an Internet Archive copy when a page fails to load."
                on={bundleWaybackFallback}
                onChange={setBundleWaybackFallback}
              />
              <SourceToggle
                label="ArXiv papers"
                description="Adds academic abstracts directly from ArXiv."
                on={bundleArxivSearch}
                onChange={setBundleArxivSearch}
              />
              <SourceToggle
                label="Wikipedia articles"
                description="Adds full article text directly from Wikipedia."
                on={bundleWikipediaSearch}
                onChange={setBundleWikipediaSearch}
              />
            </div>
            <p className="border-t border-[var(--color-border)] px-5 py-3 text-[12px] text-[var(--color-text-dim)]">
              YouTube and PDF handling are always on. ArXiv and Wikipedia supplement the local
              engine with direct API calls.
            </p>
          </>
        )}
      </SettingsCard>
    </SettingsPanel>
  );
}
