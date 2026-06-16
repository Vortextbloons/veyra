import { useState, useEffect } from "react";
import {
  X,
  FlaskConical,
  Loader2,
  Zap,
  Target,
  Telescope,
  Infinity as InfinityIcon,
  AlertCircle,
  ChevronDown,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useResearchStore } from "../research-store";
import { enqueueResearchRunJob, type ResearchRunOverride } from "../research-runtime";
import { invokeTestSearxngConnection } from "@/modules/web-search/tauri-commands";
import { resolveResearchProfileForRun } from "../research-config";
import { ResearchProfileKnobsEditor } from "./ResearchProfileKnobsEditor";
import type { ResearchDepth } from "../research-types";

const DEPTH_OPTIONS: {
  value: ResearchDepth;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "quick",
    label: "Quick",
    description: "3 rounds, lighter evidence pass",
    icon: <Zap className="size-4" />,
  },
  {
    value: "standard",
    label: "Standard",
    description: "5 rounds, source validation + verify",
    icon: <Target className="size-4" />,
  },
  {
    value: "deep",
    label: "Deep",
    description: "8 rounds, verify + gap follow-ups",
    icon: <Telescope className="size-4" />,
  },
  {
    value: "exhaustive",
    label: "Exhaustive",
    description: "10 rounds, stricter source threshold",
    icon: <InfinityIcon className="size-4" />,
  },
];

const DEPTH_BADGE: Record<ResearchDepth, string> = {
  quick: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  standard: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  deep: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  exhaustive: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

type Props = {
  onClose: () => void;
};

async function runResearchPreflight(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (useConnectivityStore.getState().effectiveConnectivity === "offline") {
    return {
      ok: false,
      error: "Web search is unavailable in Offline mode. Disable Offline mode in Settings → Connectivity.",
    };
  }

  const searxngUrl = useSettingsStore.getState().webSearchSearxngUrl.trim();
  if (!searxngUrl) {
    return {
      ok: false,
      error: "SearXNG URL is not configured. Open Settings → Tools → Web Search to set a SearXNG instance URL.",
    };
  }

  try {
    await invokeTestSearxngConnection(searxngUrl);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Web search pre-flight failed: ${detail}`,
    };
  }
}

export function NewResearchDialog({ onClose }: Props) {
  const researchConfig = useSettingsStore((s) => s.research);
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>(researchConfig.defaultDepth);
  const [isStarting, setIsStarting] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perRunOverrides, setPerRunOverrides] = useState<Record<ResearchDepth, ResearchRunOverride>>({
    quick: {},
    standard: {},
    deep: {},
    exhaustive: {},
  });

  const createRun = useResearchStore((s) => s.createRun);
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const selectedModel = useProviderStore((s) => s.selectedModel);
  const selectedProvider = useProviderStore((s) => s.selectedProvider);
  const [runModelOverride, setRunModelOverride] = useState("");
  const fallbackRunModel = researchConfig.defaultModelId || selectedModel || models[0]?.id || "";
  const runModel = models.some((model) => model.id === runModelOverride)
    ? runModelOverride
    : fallbackRunModel;

  const perRunOverride = perRunOverrides[depth] ?? {};
  const resolvedPreview = resolveResearchProfileForRun(researchConfig, depth, perRunOverride);

  const canStart = question.trim().length > 0 && !isStarting;
  const hasOverrides = Object.keys(perRunOverride).length > 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleStart = async () => {
    if (!canStart) return;
    setPreflightError(null);
    setIsStarting(true);
    try {
      const preflight = await runResearchPreflight();
      if (!preflight.ok) {
        setPreflightError(preflight.error);
        return;
      }

      const run = await createRun({
        question: question.trim(),
        depth,
        modelUsed: runModel || selectedModel,
        providerId: selectedProvider,
      });

      const override = Object.keys(perRunOverride).length > 0 ? perRunOverride : undefined;
      enqueueResearchRunJob(run, "start", override);

      if (!useSettingsStore.getState().researchFirstRunNoticeDismissed) {
        useSettingsStore.getState().setResearchFirstRunNoticeDismissed(true);
      }

      onClose();
    } catch (err) {
      console.error("Failed to start research:", err);
      setPreflightError(
        err instanceof Error ? err.message : "Failed to start research.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  function setOverride(patch: ResearchRunOverride) {
    setPerRunOverrides((prev) => ({ ...prev, [depth]: { ...prev[depth], ...patch } }));
  }

  function clearOverride() {
    setPerRunOverrides((prev) => ({ ...prev, [depth]: {} }));
  }

  const liteActive = !!researchConfig.liteModelId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <FlaskConical className="size-4" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">
              New Research
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Research question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to research?"
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey && canStart) handleStart();
                if (e.key === "Escape") onClose();
              }}
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--color-text)]">
              Research depth
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DEPTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                    depth === opt.value
                      ? `border-[var(--color-accent)] bg-[var(--color-accent-soft)]`
                      : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-white/20"
                  }`}
                >
                  <div
                    className={`mt-0.5 ${
                      depth === opt.value
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-text-dim)]"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`flex items-center gap-1.5 text-[12px] font-medium ${
                        depth === opt.value ? "text-white" : "text-[var(--color-text)]"
                      }`}
                    >
                      {opt.label}
                      {depth === opt.value && (
                        <span
                          className={`rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wide ${DEPTH_BADGE[opt.value]}`}
                        >
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[var(--color-text-dim)]">
                      {opt.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Model
            </label>
            <div className="flex items-center gap-2">
              <select
                value={runModel}
                onChange={(e) => setRunModelOverride(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {models.length === 0 && (
                  <option value="">No models available</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-[var(--color-text-dim)]">
                {providers.find((p) => p.id === selectedProvider)?.name ??
                  selectedProvider}
              </span>
            </div>
            {liteActive && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-violet-300">
                <Sparkles className="size-3" />
                Lite model is configured in Settings → Research and will be used
                for validation, contradiction, and audit.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="size-3.5 text-[var(--color-text-dim)]" />
                <div>
                  <div className="text-[12px] font-medium text-white">
                    Advanced (per-run override)
                  </div>
                  <div className="text-[10.5px] text-[var(--color-text-dim)]">
                    Tweak the {depth} preset for this run only. Open Settings → Research
                    for global defaults.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasOverrides && (
                  <span className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-[var(--color-accent)]">
                    Overridden
                  </span>
                )}
                <ChevronDown
                  className={`size-3.5 text-[var(--color-text-dim)] transition-transform ${
                    showAdvanced ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
            {showAdvanced && (
              <div className="border-t border-[var(--color-border)] p-3">
                <ResearchProfileKnobsEditor
                  depth={depth}
                  hasOverrides={hasOverrides}
                  resolved={resolvedPreview}
                  onUpdate={setOverride}
                  onClear={clearOverride}
                  showDepthSelector={false}
                />
              </div>
            )}
          </div>
        </div>

        {preflightError && (
          <div className="mx-6 mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Cannot start research</div>
              <div className="mt-0.5 text-[11.5px] text-red-200/85">{preflightError}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStarting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <FlaskConical className="size-4" />
                Start Research
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
