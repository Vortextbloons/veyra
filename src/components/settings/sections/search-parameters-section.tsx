import { CollapsibleSettingsSection } from "../collapsible-settings-section";

interface SearchParametersSectionProps {
  webSearchMaxResults: number;
  setWebSearchMaxResults: (v: number) => void;
  webSearchContextTokenLimit: number;
  setWebSearchContextTokenLimit: (v: number) => void;
}

export function SearchParametersSection({
  webSearchMaxResults,
  setWebSearchMaxResults,
  webSearchContextTokenLimit,
  setWebSearchContextTokenLimit,
}: SearchParametersSectionProps) {
  return (
    <CollapsibleSettingsSection
      subsectionKey="webSearch:parameters"
      title="Search Parameters"
      description="Results and context limits."
      keywords={["results", "tokens", "budget"]}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-white">Results per search</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                How many ranked results to return per search (1–12).
              </div>
            </div>
            <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
              {webSearchMaxResults}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={webSearchMaxResults}
            onChange={(e) => setWebSearchMaxResults(parseInt(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
            <span>1</span>
            <span>6</span>
            <span>12</span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-white">Search result token budget</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Max tokens from search results injected into the AI context.
              </div>
            </div>
            <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
              {webSearchContextTokenLimit}
            </span>
          </div>
          <input
            type="range"
            min={500}
            max={8000}
            step={250}
            value={webSearchContextTokenLimit}
            onChange={(e) => setWebSearchContextTokenLimit(parseInt(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
            <span>500</span>
            <span>4000</span>
            <span>8000</span>
          </div>
        </div>
      </div>
    </CollapsibleSettingsSection>
  );
}
