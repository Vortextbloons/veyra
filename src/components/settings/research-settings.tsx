import { useMemo, useState } from "react";
import { FlaskConical, Plus, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "./model-dropdown";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";
import {
  RESEARCH_DEPTH_PRESETS,
  resolveResearchProfile,
  type ResearchDepthProfile,
  type ResearchProfileOverride,
  profileFromBaseline,
} from "@/modules/research/research-config";
import type { ResearchDepth } from "@/modules/research/research-types";
import type { ModelInfo } from "@/lib/chat-types";

const DEPTH_ORDER: ResearchDepth[] = ["quick", "standard", "deep", "exhaustive"];

const DEPTH_DESCRIPTIONS: Record<ResearchDepth, string> = {
  quick: "3 rounds, lightweight quality checks. Fast but capable.",
  standard: "5 rounds, source validation + verify. Balanced.",
  deep: "8 rounds, contradiction + gap follow-ups. Thorough.",
  exhaustive: "10 rounds, stricter source threshold, larger cap.",
};

const PRESET_BORDER: Record<ResearchDepth, string> = {
  quick: "border-emerald-500/30",
  standard: "border-blue-500/30",
  deep: "border-amber-500/30",
  exhaustive: "border-rose-500/30",
};

const PRESET_BG: Record<ResearchDepth, string> = {
  quick: "bg-emerald-500/10 text-emerald-300",
  standard: "bg-blue-500/10 text-blue-300",
  deep: "bg-amber-500/10 text-amber-300",
  exhaustive: "bg-rose-500/10 text-rose-300",
};

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

function modelOptionsFromProvider(models: ModelInfo[]): { id: string; name: string; contextWindow?: number; size?: string }[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    contextWindow: m.contextWindow,
    size: m.size,
  }));
}

export function ResearchSettings() {
  const research = useSettingsStore((s) => s.research);
  const setResearchOverride = useSettingsStore((s) => s.setResearchOverride);
  const setResearchDepthOverride = useSettingsStore((s) => s.setResearchDepthOverride);
  const setResearchActiveProfile = useSettingsStore((s) => s.setResearchActiveProfile);
  const addCustomProfile = useSettingsStore((s) => s.addResearchCustomProfile);
  const deleteCustomProfile = useSettingsStore((s) => s.deleteResearchCustomProfile);
  const setDefaultDepth = useSettingsStore((s) => s.setResearchDefaultDepth);
  const setDefaultModelId = useSettingsStore((s) => s.setResearchDefaultModelId);
  const setLiteModel = useSettingsStore((s) => s.setResearchLiteModel);
  const resetResearch = useSettingsStore((s) => s.resetResearch);

  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);

  // The depth whose overrides we are currently editing.
  const [editingDepth, setEditingDepth] = useState<ResearchDepth>(
    research.activeProfileId === "custom" || !DEPTH_ORDER.includes(research.activeProfileId as ResearchDepth)
      ? "standard"
      : (research.activeProfileId as ResearchDepth),
  );

  // Effective profile values for the depth being edited.
  const editingBaseline = useMemo(
    () => RESEARCH_DEPTH_PRESETS[editingDepth].baseline,
    [editingDepth],
  );
  const depthOverride = research.depthOverrides[editingDepth] ?? {};

  // Resolved view (for display purposes).
  const editingResolved = useMemo(
    () => resolveResearchProfile({ ...research, override: {} }, editingDepth),
    [research, editingDepth],
  );

  function updateOverride(patch: Partial<ResearchProfileOverride>) {
    setResearchDepthOverride(editingDepth, { ...depthOverride, ...patch });
  }

  function clearDepthOverride() {
    setResearchDepthOverride(editingDepth, {});
  }

  function handleResetAll() {
    if (window.confirm("Reset all Research settings to defaults?")) {
      resetResearch();
      setEditingDepth("standard");
    }
  }

  function handleSaveAsCustomProfile() {
    const name = window.prompt("Name for this custom profile:", "My Research");
    if (!name?.trim()) return;
    const id = `custom_${Date.now().toString(36)}`;
    const baseline: ResearchProfileOverride = editingResolved;
    const profile = profileFromBaseline(
      id,
      name.trim(),
      `Custom profile saved from the ${editingDepth} preset.`,
      { ...editingBaseline, ...baseline },
    );
    addCustomProfile(profile);
  }

  function loadCustomProfile(profile: ResearchDepthProfile) {
    setResearchActiveProfile(profile.id);
    setResearchOverride({ ...profile.baseline });
  }

  const liteModelOptions = useMemo(
    () => models.filter((m) => m.id).map((m) => ({ ...m, id: m.id })),
    [models],
  );

  return (
    <div className="space-y-8">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <FlaskConical className="size-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white">Research AI Depth</div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
              Tune how thorough, how parallel, and how "smart" each research run is. Lower
              values make runs faster; higher values produce deeper reports. The four depth
              presets below set baselines that the per-knob settings override.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <RotateCcw className="size-3" />
          Reset all
        </button>
      </div>

      {/* Depth preset picker */}
      <CollapsibleSettingsSection
        subsectionKey="research:presets"
        title="Depth Preset"
        description="The four built-in depth levels. Pick one as a starting baseline."
        keywords={["quick", "standard", "deep", "exhaustive", "preset"]}
        defaultExpanded
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {DEPTH_ORDER.map((depth) => {
            const active = research.activeProfileId === depth;
            return (
              <button
                key={depth}
                type="button"
                onClick={() => {
                  setResearchActiveProfile(depth);
                  setEditingDepth(depth);
                }}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? `border-[var(--color-accent)] bg-[var(--color-accent-soft)]`
                    : `${PRESET_BORDER[depth]} bg-[var(--color-bg)] hover:border-white/20`
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="text-[12.5px] font-semibold capitalize text-white">
                    {depth}
                  </div>
                  {active && (
                    <span
                      className={`rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wide ${PRESET_BG[depth]}`}
                    >
                      Active
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] leading-relaxed text-[var(--color-text-dim)]">
                  {DEPTH_DESCRIPTIONS[depth]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom profiles */}
        {research.customProfiles.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              Custom profiles
            </div>
            <div className="space-y-1.5">
              {research.customProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => loadCustomProfile(profile)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Sparkles className="size-3.5 shrink-0 text-violet-300" />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-white">
                        {profile.name}
                      </div>
                      <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
                        {profile.description}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete custom profile "${profile.name}"?`)) {
                        deleteCustomProfile(profile.id);
                      }
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded text-red-300 transition-colors hover:bg-red-500/10"
                    title="Delete custom profile"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={handleSaveAsCustomProfile}
            className="flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11.5px] font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
          >
            <Plus className="size-3" />
            Save current settings as a custom profile
          </button>
        </div>
      </CollapsibleSettingsSection>

      {/* Per-depth editing */}
      <CollapsibleSettingsSection
        subsectionKey="research:knobs"
        title={`Per-Knob Settings — ${editingDepth.charAt(0).toUpperCase() + editingDepth.slice(1)} preset`}
        description="Tweak each phase of the pipeline. Changes are saved automatically to the active preset."
        keywords={["knobs", "search", "validate", "audit", "synthesis"]}
      >
        <DepthOverrideEditor
          depth={editingDepth}
          setDepth={setEditingDepth}
          depthOverride={depthOverride}
          resolved={editingResolved}
          onUpdate={updateOverride}
          onClear={clearDepthOverride}
        />
      </CollapsibleSettingsSection>

      {/* Defaults (pre-fill for new dialog) */}
      <CollapsibleSettingsSection
        subsectionKey="research:defaults"
        title="Defaults"
        description="Pre-fills for the New Research dialog. Per-run, you can still pick something different."
        keywords={["default", "model", "depth"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-white">Default depth</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Pre-selects this depth in the New Research dialog.
              </div>
            </div>
          </div>
          <Segmented
            value={research.defaultDepth}
            options={DEPTH_ORDER.map((d) => ({
              value: d,
              label: d.charAt(0).toUpperCase() + d.slice(1),
            }))}
            onChange={(v) => setDefaultDepth(v as ResearchDepth)}
          />
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white">Default model</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Pre-selects this model in the New Research dialog. Leave empty to use the
                current chat model.
              </div>
            </div>
            <span className="shrink-0 rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
              {providers.find((p) => p.id === providers[0]?.id)?.name ?? ""}
            </span>
          </div>
          <ModelDropdown
            models={modelOptionsFromProvider(models)}
            value={research.defaultModelId ?? ""}
            onChange={(v) => setDefaultModelId(v || null)}
            placeholder="(use current chat model)"
          />
        </div>
      </CollapsibleSettingsSection>

      {/* Lite model picker */}
      <CollapsibleSettingsSection
        subsectionKey="research:liteModel"
        title="Lite Model (Optional)"
        description="Use a smaller model for repetitive, per-source tasks (validation, contradiction, audit) while keeping the main model for planning, extraction, and synthesis. Speeds up runs substantially on slow hardware."
        keywords={["lite", "model", "fast"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white">Lite model</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                When set, validation/contradiction/audit use this model. Leave empty to use
                the main model for everything.
              </div>
            </div>
            {research.liteModelId && (
              <span className="flex items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <Sparkles className="size-3" />
                Lite active
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
            <select
              value={research.liteModelProviderId}
              onChange={(e) => {
                const newProvider = e.target.value;
                setLiteModel("", newProvider);
              }}
              className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[12px] text-white focus:border-[var(--color-border-strong)] focus:outline-none"
            >
              <option value="">(any provider)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ModelDropdown
              models={modelOptionsFromProvider(liteModelOptions.length ? liteModelOptions : models)}
              value={research.liteModelId}
              onChange={(v) => setLiteModel(v, research.liteModelProviderId)}
              placeholder="(disabled — use main model)"
            />
          </div>
        </div>
      </CollapsibleSettingsSection>
    </div>
  );
}

function DepthOverrideEditor({
  depth,
  setDepth,
  depthOverride,
  resolved,
  onUpdate,
  onClear,
}: {
  depth: ResearchDepth;
  setDepth: (d: ResearchDepth) => void;
  depthOverride: ResearchProfileOverride;
  resolved: ReturnType<typeof resolveResearchProfile>;
  onUpdate: (patch: Partial<ResearchProfileOverride>) => void;
  onClear: () => void;
}) {
  const hasOverrides = Object.keys(depthOverride).length > 0;

  return (
    <div className="space-y-3">
      {/* Depth selector for which preset's overrides to edit */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
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

      {/* Search & Sources */}
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
              <div className="text-[12px] font-medium text-white">Adaptive deepening</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Issue one broad query after the last round to fill the source cap.
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
              <div className="text-[12px] font-medium text-white">Per-source deep read</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Enable source validation and per-source extraction for higher-quality reports.
              </div>
            </div>
            <Toggle on={resolved.perSourceRead} onChange={(v) => onUpdate({ perSourceRead: v })} />
          </div>
        </div>
      </div>

      {/* Validation & Verification */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
          Validation & Verification
        </div>
        <div className="space-y-3">
          <Slider
            label="Per-source AI concurrency"
            description="How many source-quality checks run in parallel. 3 is safe; higher needs a strong GPU."
            value={resolved.validateConcurrency}
            min={1}
            max={8}
            step={1}
            onChange={(v) => onUpdate({ validateConcurrency: v })}
          />
          {resolved.perSourceRead && (
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div>
                <div className="text-[12px] font-medium text-white">Use reasoning for source validation</div>
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
                  <div className="text-[12px] font-medium text-white">Use reasoning for verification</div>
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

      {/* Synthesis & Audit */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
          Synthesis & Audit
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Use reasoning for synthesis</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Report outline and section prose — on for Standard+ depths; off on Quick for speed.
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
                After writing, the AI reviews the draft for gaps and weak sections, then rewrites up to 2 sections. Adds ~10-15s.
              </div>
            </div>
            <Toggle
              on={resolved.selfCritiquePass}
              onChange={(v) => onUpdate({ selfCritiquePass: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <div>
              <div className="text-[12px] font-medium text-white">Use reasoning for citation audit</div>
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
            onChange={(v: number) => onUpdate({ sectionMaxWords: v })}
          />
          <Slider
            label="Max sections"
            description="Maximum number of sections in the report outline."
            value={resolved.maxSections}
            min={1}
            max={20}
            step={1}
            onChange={(v: number) => onUpdate({ maxSections: v })}
          />
        </div>
      </div>
    </div>
  );
}

// Trailing visual flourish.
