import { CollapsibleSettingsSection } from "../collapsible-settings-section";

interface SearchParametersSectionProps {
  webSearchMaxResults: number;
  setWebSearchMaxResults: (v: number) => void;
  webSearchTimeRange: string;
  setWebSearchTimeRange: (v: "" | "day" | "week" | "month" | "year") => void;
  webSearchCategories: string;
  setWebSearchCategories: (v: string) => void;
  webSearchSafeSearch: number;
  setWebSearchSafeSearch: (v: 0 | 1 | 2) => void;
  webSearchContextTokenLimit: number;
  setWebSearchContextTokenLimit: (v: number) => void;
}

export function SearchParametersSection({
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
}: SearchParametersSectionProps) {
  return (
    <CollapsibleSettingsSection
      subsectionKey="webSearch:parameters"
      title="Search Parameters"
      description="Results, time range, categories, and context limits."
      keywords={["results", "time", "category", "safe", "tokens"]}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-white">Results per search</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                How many websites to fetch per search query (1–10).
              </div>
            </div>
            <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
              {webSearchMaxResults}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={webSearchMaxResults}
            onChange={(e) => setWebSearchMaxResults(parseInt(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
            <span>1</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">Time range</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Limit search results to a specific time period.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "Any time" },
              { value: "day", label: "Past 24 hours" },
              { value: "week", label: "Past week" },
              { value: "month", label: "Past month" },
              { value: "year", label: "Past year" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWebSearchTimeRange(opt.value as "" | "day" | "week" | "month" | "year")}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  webSearchTimeRange === opt.value
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">Categories</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Filter by search category. Leave empty for general search.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "General" },
              { value: "news", label: "News" },
              { value: "science", label: "Science" },
              { value: "it", label: "IT" },
              { value: "images", label: "Images" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWebSearchCategories(opt.value)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  webSearchCategories === opt.value
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">Safe search</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Filter explicit content from search results.
            </div>
          </div>
          <div className="flex gap-2">
            {[
              { value: 0, label: "Off" },
              { value: 1, label: "Moderate" },
              { value: 2, label: "Strict" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWebSearchSafeSearch(opt.value as 0 | 1 | 2)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  webSearchSafeSearch === opt.value
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
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
