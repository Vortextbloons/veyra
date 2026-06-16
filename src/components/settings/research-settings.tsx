import { useMemo, useState } from "react";
import { FlaskConical, Plus, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { ModelDropdown } from "./model-dropdown";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";
import {
  RESEARCH_DEPTH_PRESETS,
  resolveResearchProfile,
  type ResearchDepthProfile,
  type ResearchProfileOverride,
  profileFromBaseline,
} from "@/modules/research/research-config";
import { ResearchProfileKnobsEditor } from "@/modules/research/components/ResearchProfileKnobsEditor";
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
        description="Tweak each phase of the pipeline for this depth. Changes are saved per preset (Quick, Standard, etc.)."
        keywords={["knobs", "search", "validate", "audit", "synthesis", "arxiv", "wikipedia"]}
      >
        <ResearchProfileKnobsEditor
          depth={editingDepth}
          setDepth={setEditingDepth}
          hasOverrides={Object.keys(depthOverride).length > 0}
          resolved={editingResolved}
          onUpdate={updateOverride}
          onClear={clearDepthOverride}
          depthLabel={editingDepth}
          showDepthSelector={false}
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
