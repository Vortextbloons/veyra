import { RotateCcw } from "lucide-react";
import { Toggle } from "@/components/toggle";
import type { ResearchProfileOverride } from "../research-config";
import type { ResearchDepth } from "../research-types";

const DEPTH_ORDER: ResearchDepth[] = ["lightning", "quick", "standard", "deep", "exhaustive"];

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
  description,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  description?: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-white">{label}</div>
          {description && (
            <div className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">{description}</div>
          )}
        </div>
        <span className="shrink-0 rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format((min + max) / 2) : (min + max) / 2}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
            value === opt.value
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export type ResolvedResearchProfile = Required<ResearchProfileOverride>;

type Props = {
  depth: ResearchDepth;
  setDepth?: (d: ResearchDepth) => void;
  hasOverrides: boolean;
  resolved: ResolvedResearchProfile;
  onUpdate: (patch: Partial<ResearchProfileOverride>) => void;
  onClear: () => void;
  showDepthSelector?: boolean;
  /** When set, copy refers to this depth preset (settings). Omit for per-run overrides. */
  depthLabel?: string;
};

export function ResearchProfileKnobsEditor({
  depth,
  setDepth,
  hasOverrides,
  resolved,
  onUpdate,
  onClear,
  showDepthSelector = true,
  depthLabel,
}: Props) {
  const depthName = depthLabel ?? depth.charAt(0).toUpperCase() + depth.slice(1);
  return (
    <div className="space-y-3">
      {(showDepthSelector || hasOverrides || depthLabel) && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
          {showDepthSelector && setDepth ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--color-text-dim)]">Editing overrides for:</span>
              <select
                value={depth}
                onChange={(e) => setDepth(e.target.value as ResearchDepth)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[11.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              >
                {DEPTH_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ) : depthLabel ? (
            <span className="text-[11px] text-[var(--color-text-dim)]">
              Settings apply to the <span className="capitalize text-white">{depthName}</span> preset.
            </span>
          ) : (
            <span className="text-[11px] text-[var(--color-text-dim)]">
              Overrides apply to this run only.
            </span>
          )}
          {hasOverrides && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
            >
              <RotateCcw className="size-3" />
              Clear overrides
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
          Search & Sources
        </div>
        <div className="space-y-3">
          <Slider
            label="Max search rounds"
            description="How many plan-driven search passes run before extraction. Lower = faster, fewer sources."
            value={resolved.maxSearchRounds}
            min={1}
            max={12}
            step={1}
            onChange={(v) => onUpdate({ maxSearchRounds: v })}
          />
          <Slider
            label="Max sources"
            description="Total source cap across all rounds."
            value={resolved.maxSources}
            min={10}
            max={500}
            step={5}
            format={(v) => `${v}`}
            onChange={(v) => onUpdate({ maxSources: v })}
          />
          <Slider
            label="Max sources per round"
            description="New sources per individual search query before stopping."
            value={resolved.maxSourcesPerRound}
            min={5}
            max={40}
            step={1}
            onChange={(v) => onUpdate({ maxSourcesPerRound: v })}
          />
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Auto-expand search</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Run one extra broad query if under the source cap.
              </div>
            </div>
            <Toggle
              on={resolved.adaptiveDeepening}
              onChange={(v) => onUpdate({ adaptiveDeepening: v })}
            />
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <div>
                <div className="text-[12px] font-medium text-white">Min source quality</div>
                <div className="text-[10.5px] text-[var(--color-text-dim)]">
                  Sources with quality below this are skipped.
                </div>
              </div>
              <span className="rounded bg-[var(--color-panel)] px-2 py-0.5 font-mono text-[11.5px] text-white">
                {resolved.minSourceQuality}/5
              </span>
            </div>
            <Segmented
              value={String(resolved.minSourceQuality)}
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
                { value: "5", label: "5" },
              ]}
              onChange={(v) => onUpdate({ minSourceQuality: parseInt(v, 10) })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Source validation & extraction</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Validate each source's quality and extract structured evidence for stronger reports.
              </div>
            </div>
            <Toggle on={resolved.perSourceRead} onChange={(v) => onUpdate({ perSourceRead: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Direct ArXiv API search</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                {depthLabel
                  ? `For ${depthName} runs, supplement SearXNG with ArXiv abstracts. Requires Web Search bundle.`
                  : "Supplement SearXNG with ArXiv abstracts for this run. Requires Web Search bundle."}
              </div>
            </div>
            <Toggle
              on={resolved.directArxivSearch}
              onChange={(v) => onUpdate({ directArxivSearch: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Direct Wikipedia API search</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                {depthLabel
                  ? `For ${depthName} runs, supplement SearXNG with Wikipedia snippets. Requires Web Search bundle.`
                  : "Supplement SearXNG with Wikipedia snippets for this run. Requires Web Search bundle."}
              </div>
            </div>
            <Toggle
              on={resolved.directWikipediaSearch}
              onChange={(v) => onUpdate({ directWikipediaSearch: v })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
          Validation & Verification
        </div>
        <div className="space-y-3">
          <Slider
            label="Validation concurrency"
            description="How many source-quality checks run in parallel. 3 is safe; higher needs a strong GPU."
            value={resolved.validateConcurrency}
            min={1}
            max={8}
            step={1}
            onChange={(v) => onUpdate({ validateConcurrency: v })}
          />
          {resolved.perSourceRead && (
            <Slider
              label="Validation batch size"
              description="Sources per validation call. Higher values reduce API calls but may reduce per-source accuracy. 1 = most thorough."
              value={resolved.validateBatchSize}
              min={1}
              max={5}
              step={1}
              onChange={(v) => onUpdate({ validateBatchSize: v })}
            />
          )}
          {resolved.perSourceRead && (
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div>
              <div className="text-[12px] font-medium text-white">Validation reasoning</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Structured JSON scoring — off by default for speed and reliable parsing.
              </div>
              </div>
              <Toggle
                on={resolved.validateReasoning}
                onChange={(v) => onUpdate({ validateReasoning: v })}
              />
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Cross-source verification</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Re-check each high-confidence claim against the full evidence set.
              </div>
            </div>
            <Toggle
              on={resolved.crossSourceVerify}
              onChange={(v) => onUpdate({ crossSourceVerify: v })}
            />
          </div>
          {resolved.crossSourceVerify && (
            <>
              <Slider
                label="Verify batch size"
                description="Claims verified per AI call. 1 = one claim per call (most thorough); higher values share context for speed."
                value={resolved.verifyBatchSize}
                min={1}
                max={20}
                step={1}
                onChange={(v) => onUpdate({ verifyBatchSize: v })}
              />
              <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                <div>
              <div className="text-[12px] font-medium text-white">Verification reasoning</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Structured JSON verification — off by default; enable only if you want slower, deeper cross-checks.
              </div>
                </div>
                <Toggle
                  on={resolved.verifyReasoning}
                  onChange={(v) => onUpdate({ verifyReasoning: v })}
                />
              </div>
            </>
          )}
          {resolved.perSourceRead && (
            <Slider
              label="Extract batch size"
              description="Sources per extraction call. Higher values are faster; Veyra auto-shrinks excerpts and splits batches to stay within context limits."
              value={resolved.extractBatchSize}
              min={1}
              max={10}
              step={1}
              onChange={(v) => onUpdate({ extractBatchSize: v })}
            />
          )}
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Contradiction detection</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Pairwise check that verified claims don't contradict each other.
              </div>
            </div>
            <Toggle
              on={resolved.contradictionDetect}
              onChange={(v) => onUpdate({ contradictionDetect: v })}
            />
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div className="mb-1.5">
              <div className="text-[12px] font-medium text-white">Contradiction strategy</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Top-K checks the K most-confident claims; All-Pairs can grow very quickly and is capped below.
              </div>
            </div>
            <Segmented
              value={resolved.contradictionStrategy}
              options={[
                { value: "all_pairs", label: "All Pairs" },
                { value: "top_k", label: "Top-K" },
              ]}
              onChange={(v) => onUpdate({ contradictionStrategy: v as "all_pairs" | "top_k" })}
            />
          </div>
          <Slider
            label="Contradiction top-K"
            description="When strategy is Top-K, check the K most-confident claims against each other."
            value={resolved.contradictionTopK}
            min={10}
            max={200}
            step={5}
            onChange={(v) => onUpdate({ contradictionTopK: v })}
          />
          <Slider
            label="Max contradiction pairs"
            description="Hard cap on AI pair checks. 0 = unlimited and can be very slow on local models."
            value={resolved.contradictionMaxPairs}
            min={0}
            max={500}
            step={10}
            onChange={(v) => onUpdate({ contradictionMaxPairs: v })}
          />
          <Slider
            label="Contradiction min claims"
            description="Skip contradiction detection when fewer than N verified claims exist. 0 = always run."
            value={resolved.contradictionMinClaims}
            min={0}
            max={50}
            step={1}
            onChange={(v) => onUpdate({ contradictionMinClaims: v })}
          />
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
          Synthesis & Audit
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Extended reasoning</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Contradiction detection, gap analysis, outline, writing, and self-critique — on for Standard+; off on Quick.
              </div>
            </div>
            <Toggle
              on={resolved.synthesisReasoning}
              onChange={(v) => onUpdate({ synthesisReasoning: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Self-critique pass</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                After writing, the AI reviews the draft for gaps and weak sections, then rewrites up to 2 sections.
              </div>
            </div>
            <Toggle
              on={resolved.selfCritiquePass}
              onChange={(v) => onUpdate({ selfCritiquePass: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Citation audit reasoning</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Per-citation JSON audit — on for Deep/Exhaustive presets; off on Quick/Standard for speed.
              </div>
            </div>
            <Toggle
              on={resolved.auditReasoning}
              onChange={(v) => onUpdate({ auditReasoning: v })}
            />
          </div>
          <Slider
            label="Max citations to audit"
            description="Hard cap. Long reports audit only the first N citations. 0 = unlimited."
            value={resolved.auditMaxCitations}
            min={0}
            max={100}
            step={5}
            onChange={(v) => onUpdate({ auditMaxCitations: v })}
          />
          <Slider
            label="Citation audit concurrency"
            description="How many audit checks run in parallel."
            value={resolved.auditConcurrency}
            min={1}
            max={8}
            step={1}
            onChange={(v) => onUpdate({ auditConcurrency: v })}
          />
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Gap analysis & follow-up</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                After verification, identify missing aspects and search for them.
              </div>
            </div>
            <Toggle
              on={resolved.gapAnalysis}
              onChange={(v) => onUpdate({ gapAnalysis: v })}
            />
          </div>
          <Slider
            label="Max words per section"
            description="Upper bound for each report section. Larger values produce longer, more detailed sections."
            value={resolved.sectionMaxWords}
            min={150}
            max={3000}
            step={50}
            onChange={(v) => onUpdate({ sectionMaxWords: v })}
          />
          <Slider
            label="Max sections"
            description="Maximum number of sections in the report outline."
            value={resolved.maxSections}
            min={1}
            max={20}
            step={1}
            onChange={(v) => onUpdate({ maxSections: v })}
          />
        </div>
      </div>
    </div>
  );
}
