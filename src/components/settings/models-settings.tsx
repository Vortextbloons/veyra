import { useState } from "react";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ModelSettings } from "@/stores/settings-store";
import {
  RefreshCw,
  Play,
  Check,
  AlertTriangle,
  Eye,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { ModelIcon } from "@/components/model-icon";

export function ModelsSettings() {
  const providers = useProviderStore((s) => s.providers);
  const selectedProvider = useProviderStore((s) => s.selectedProvider);
  const models = useProviderStore((s) => s.models);
  const selectedModel = useProviderStore((s) => s.selectedModel);
  const connectionPhase = useProviderStore((s) => s.connectionPhase);
  const connectionError = useProviderStore((s) => s.connectionError);
  const reconnectProvider = useProviderStore((s) => s.reconnectProvider);
  const startProviderServer = useProviderStore((s) => s.startProviderServer);
  const setSelectedModel = useProviderStore((s) => s.setSelectedModel);

  const defaultTemperature = useSettingsStore((s) => s.defaultTemperature);
  const setDefaultTemperature = useSettingsStore((s) => s.setDefaultTemperature);
  const defaultContextLength = useSettingsStore((s) => s.defaultContextLength);
  const setDefaultContextLength = useSettingsStore((s) => s.setDefaultContextLength);
  const defaultMaxTokens = useSettingsStore((s) => s.defaultMaxTokens);
  const setDefaultMaxTokens = useSettingsStore((s) => s.setDefaultMaxTokens);
  const defaultTopP = useSettingsStore((s) => s.defaultTopP);
  const setDefaultTopP = useSettingsStore((s) => s.setDefaultTopP);
  const defaultRepetitionPenalty = useSettingsStore((s) => s.defaultRepetitionPenalty);
  const setDefaultRepetitionPenalty = useSettingsStore((s) => s.setDefaultRepetitionPenalty);
  const defaultStopSequences = useSettingsStore((s) => s.defaultStopSequences);
  const setDefaultStopSequences = useSettingsStore((s) => s.setDefaultStopSequences);
  const defaultReservedOutputTokens = useSettingsStore((s) => s.defaultReservedOutputTokens);
  const setDefaultReservedOutputTokens = useSettingsStore((s) => s.setDefaultReservedOutputTokens);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const isConnected = currentProvider?.status === "connected";
  const isConnecting = connectionPhase === "connecting";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Provider
        </h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <div
              className={`grid size-9 place-items-center rounded-lg ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isConnecting
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-red-500/15 text-red-400"
              }`}
            >
              <ProviderIcon providerId={currentProvider?.icon ?? ""} className="size-4" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-white">
                {currentProvider?.name ?? "Unknown"}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={`size-1.5 rounded-full ${
                    isConnected
                      ? "bg-emerald-400"
                      : isConnecting
                        ? "animate-pulse bg-amber-400"
                        : "bg-red-400"
                  }`}
                />
                <span
                  className={
                    isConnected
                      ? "text-emerald-300"
                      : isConnecting
                        ? "text-amber-300"
                        : "text-red-300"
                  }
                >
                  {isConnecting
                    ? "Connecting..."
                    : isConnected
                      ? "Connected"
                      : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          {connectionError && (
            <div className="mb-3 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[11.5px] text-red-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{connectionError}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reconnectProvider()}
              disabled={isConnecting}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3 ${isConnecting ? "animate-spin" : ""}`}
              />
              Reconnect
            </button>
            <button
              type="button"
              onClick={() => void startProviderServer()}
              disabled={isConnecting}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1.5 text-[11.5px] text-indigo-300 transition-colors hover:bg-[var(--color-accent)]/20 disabled:opacity-50"
            >
              <Play className="size-3" />
              Start server
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Global Defaults
        </h2>
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/70">
              Sampling
            </h3>
            <div className="space-y-3">
              <SliderControl
                label="Temperature"
                description="Controls randomness. Lower = more focused, higher = more creative."
                value={defaultTemperature}
                onChange={setDefaultTemperature}
                min={0}
                max={2}
                step={0.05}
                format={(n) => n.toFixed(2)}
              />
              <SliderControl
                label="Repetition Penalty"
                description="Penalizes repeated tokens. 1.0 = no penalty, higher = less repetition."
                value={defaultRepetitionPenalty}
                onChange={setDefaultRepetitionPenalty}
                min={1}
                max={2}
                step={0.05}
                format={(n) => n.toFixed(2)}
              />
              <SliderControl
                label="Top-p"
                description="Nucleus sampling. Limits token selection to the most probable set. 1.0 = disabled."
                value={defaultTopP}
                onChange={setDefaultTopP}
                min={0}
                max={1}
                step={0.05}
                format={(n) => n.toFixed(2)}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/70">
              Output
            </h3>
            <div className="space-y-3">
              <SliderControl
                label="Max output tokens"
                description="Cap on response length. 0 = unlimited."
                value={defaultMaxTokens}
                onChange={setDefaultMaxTokens}
                min={0}
                max={8192}
                step={64}
                format={(n) => (n === 0 ? "Unlimited" : n.toLocaleString())}
              />
              <StopSequencesInput
                value={defaultStopSequences}
                onChange={setDefaultStopSequences}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/70">
              Context
            </h3>
            <div className="space-y-3">
              <SliderControl
                label="Context length"
                description="Maximum token window for conversations. Lower values save memory."
                value={defaultContextLength}
                onChange={setDefaultContextLength}
                min={512}
                max={131072}
                step={512}
                format={(n) =>
                  n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)}K` : `${n}`
                }
              />
              <SliderControl
                label="Reserved output tokens"
                description="Tokens reserved for the model's response when calculating context budget."
                value={defaultReservedOutputTokens}
                onChange={setDefaultReservedOutputTokens}
                min={256}
                max={8192}
                step={256}
                format={(n) => n.toLocaleString()}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Per-Model Overrides
        </h2>
        <p className="mb-3 text-[12px] text-[var(--color-text-dim)]">
          Override global defaults for specific models. Models without overrides use the global values.
        </p>
        {models.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-8 text-center">
            <ModelIcon modelId="" className="mx-auto mb-2 size-5 text-[var(--color-text-dim)]" />
            <p className="text-[12px] text-[var(--color-text-dim)]">
              {isConnected
                ? "No models found. Load a model in your provider."
                : "Connect to a provider to see available models."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((m) => (
              <ModelOverrideCard
                key={m.id}
                model={m}
                isActive={m.id === selectedModel}
                onSelect={() => setSelectedModel(m.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ModelOverrideCard({
  model,
  isActive,
  onSelect,
}: {
  model: { id: string; name: string; contextWindow?: number; size?: string; supportsImages?: boolean };
  isActive: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const modelOverrides = useSettingsStore((s) => s.modelOverrides);
  const setModelOverride = useSettingsStore((s) => s.setModelOverride);
  const clearModelOverride = useSettingsStore((s) => s.clearModelOverride);
  const getModelSettings = useSettingsStore((s) => s.getModelSettings);

  const override = modelOverrides[model.id];
  const hasOverride = !!override;
  const resolved = getModelSettings(model.id);

  const update = (patch: ModelSettings) => {
    setModelOverride(model.id, { ...override, ...patch });
  };

  const handleReset = () => {
    clearModelOverride(model.id);
  };

  const hasAnyCustom = hasOverride && (
    override?.temperature != null ||
    override?.contextLength != null ||
    override?.maxTokens != null ||
    override?.topP != null ||
    override?.repetitionPenalty != null ||
    (override?.stopSequences && override.stopSequences.length > 0) ||
    override?.reservedOutputTokens != null ||
    (override?.systemPrompt && override.systemPrompt.length > 0)
  );

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isActive
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]"
          : "border-[var(--color-border)] bg-[var(--color-panel)]"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div
            className={`grid size-8 shrink-0 place-items-center rounded-md ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "bg-white/[0.04] text-[var(--color-text-dim)]"
            }`}
          >
            <ModelIcon modelId={model.id} className="size-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-[12.5px] font-medium ${
                isActive ? "text-white" : "text-[var(--color-text)]"
              }`}
            >
              {model.name}
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
              {model.size && <span className="font-mono">{model.size}</span>}
              {model.contextWindow && (
                <>
                  <span className="opacity-50">&middot;</span>
                  <span className="font-mono">
                    {model.contextWindow >= 1000
                      ? `${(model.contextWindow / 1000).toFixed(model.contextWindow % 1000 ? 1 : 0)}K`
                      : model.contextWindow}{" "}
                    ctx
                  </span>
                </>
              )}
              {model.supportsImages && (
                <>
                  <span className="opacity-50">&middot;</span>
                  <span className="flex items-center gap-0.5">
                    <Eye className="size-3" />
                    Vision
                  </span>
                </>
              )}
              {hasAnyCustom && (
                <>
                  <span className="opacity-50">&middot;</span>
                  <span className="text-amber-400">Custom</span>
                </>
              )}
            </div>
          </div>
          {isActive && (
            <Check className="size-4 shrink-0 text-[var(--color-accent)]" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)]/50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-dim)]">
              Overrides global defaults for this model
            </span>
            {hasAnyCustom && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <RotateCcw className="size-2.5" />
                Reset
              </button>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/60">
                Sampling
              </h4>
              <div className="space-y-3">
                <SliderControl
                  label="Temperature"
                  description={`Default: ${getModelSettings(model.id).temperature.toFixed(2)}`}
                  value={resolved.temperature}
                  onChange={(v) => update({ temperature: v })}
                  min={0}
                  max={2}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                />
                <SliderControl
                  label="Repetition Penalty"
                  description={`Default: ${getModelSettings(model.id).repetitionPenalty.toFixed(2)}`}
                  value={resolved.repetitionPenalty}
                  onChange={(v) => update({ repetitionPenalty: v })}
                  min={1}
                  max={2}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                />
                <SliderControl
                  label="Top-p"
                  description={`Default: ${getModelSettings(model.id).topP.toFixed(2)}`}
                  value={resolved.topP}
                  onChange={(v) => update({ topP: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/60">
                Output
              </h4>
              <div className="space-y-3">
                <SliderControl
                  label="Max output tokens"
                  description={`Default: ${getModelSettings(model.id).maxTokens === 0 ? "Unlimited" : getModelSettings(model.id).maxTokens.toLocaleString()}`}
                  value={resolved.maxTokens}
                  onChange={(v) => update({ maxTokens: v })}
                  min={0}
                  max={8192}
                  step={64}
                  format={(n) => (n === 0 ? "Unlimited" : n.toLocaleString())}
                />
                <StopSequencesInput
                  value={resolved.stopSequences}
                  onChange={(v) => update({ stopSequences: v })}
                  defaultValue={getModelSettings(model.id).stopSequences}
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/60">
                Context
              </h4>
              <div className="space-y-3">
                <SliderControl
                  label="Context length"
                  description={`Default: ${getModelSettings(model.id).contextLength >= 1024 ? `${(getModelSettings(model.id).contextLength / 1024).toFixed(getModelSettings(model.id).contextLength % 1024 ? 1 : 0)}K` : getModelSettings(model.id).contextLength}`}
                  value={resolved.contextLength}
                  onChange={(v) => update({ contextLength: v })}
                  min={512}
                  max={131072}
                  step={512}
                  format={(n) =>
                    n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)}K` : `${n}`
                  }
                />
                <SliderControl
                  label="Reserved output tokens"
                  description={`Default: ${getModelSettings(model.id).reservedOutputTokens.toLocaleString()}`}
                  value={resolved.reservedOutputTokens}
                  onChange={(v) => update({ reservedOutputTokens: v })}
                  min={256}
                  max={8192}
                  step={256}
                  format={(n) => n.toLocaleString()}
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]/60">
                System Prompt
              </h4>
              <textarea
                value={override?.systemPrompt ?? ""}
                onChange={(e) => update({ systemPrompt: e.target.value || undefined })}
                rows={4}
                placeholder={`Default: ${getModelSettings(model.id).systemPrompt || "(global setting)"}`}
                className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[11px] leading-relaxed text-white placeholder:text-[var(--color-text-dim)]/40 focus:border-[var(--color-accent)]/40 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderControl({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[12px] font-medium text-white">{label}</div>
        <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white">
          {format(value)}
        </span>
      </div>
      <p className="mb-2 text-[10.5px] text-[var(--color-text-dim)]">{description}</p>
      <div className="relative">
        <div className="h-1.5 rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function StopSequencesInput({
  value,
  onChange,
  defaultValue,
}: {
  value: string[];
  onChange: (s: string[]) => void;
  defaultValue?: string[];
}) {
  const [draft, setDraft] = useState(value.join(", "));

  const handleBlur = () => {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange(parsed);
  };

  const placeholder = defaultValue && defaultValue.length > 0
    ? `Default: ${defaultValue.join(", ")}`
    : "e.g. </s>, Human:, Assistant:";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[12px] font-medium text-white">Stop sequences</div>
        {value.length > 0 && (
          <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white">
            {value.length}
          </span>
        )}
      </div>
      <p className="mb-2 text-[10.5px] text-[var(--color-text-dim)]">
        Comma-separated strings that stop generation.
      </p>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBlur(); } }}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 font-mono text-[11px] text-white placeholder:text-[var(--color-text-dim)]/40 focus:border-[var(--color-accent)]/40 focus:outline-none"
      />
    </div>
  );
}
