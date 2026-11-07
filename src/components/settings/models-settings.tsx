import { useEffect, useState } from "react";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ModelSettings } from "@/stores/settings-store";
import { AlertTriangle, Check, ChevronDown, Eye, Star } from "lucide-react";
import { SliderControl } from "@/components/ui/slider-control";
import { CloudProvidersSettings } from "@/components/settings/cloud-providers-settings";
import {
  EmptyState,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  settingsButtonClass,
  settingsTextareaClass,
} from "./settings-ui";

export function ModelsSettings() {
  const providers = useProviderStore((s) => s.providers);
  const cloudProviders = useProviderStore((s) => s.cloudProviders);
  const selectedProvider = useProviderStore((s) => s.selectedProvider);
  const models = useProviderStore((s) => s.models);
  const selectedModel = useProviderStore((s) => s.selectedModel);
  const connectionPhase = useProviderStore((s) => s.connectionPhase);
  const connectionError = useProviderStore((s) => s.connectionError);
  const reconnectProvider = useProviderStore((s) => s.reconnectProvider);
  const startProviderServer = useProviderStore((s) => s.startProviderServer);
  const setSelectedModel = useProviderStore((s) => s.setSelectedModel);

  const favoriteModels = useSettingsStore((s) => s.favoriteModels);
  const toggleFavoriteModel = useSettingsStore((s) => s.toggleFavoriteModel);

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
  const currentBaseUrl = cloudProviders.find((p) => p.id === selectedProvider)?.baseUrl;
  const isConnected = currentProvider?.status === "connected";
  const isConnecting = connectionPhase === "connecting";
  const favorites = models.filter((model) => favoriteModels.includes(model.id));

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Models"
        description="Connect providers, choose favorites, and tune how models sample and spend context."
        actions={
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] ${
              isConnected
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : isConnecting
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                  : "border-red-500/25 bg-red-500/10 text-red-300"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                isConnected
                  ? "bg-emerald-400"
                  : isConnecting
                    ? "animate-pulse bg-amber-400"
                    : "bg-red-400"
              }`}
            />
            {currentProvider?.name ?? "No provider"}
            <span className="opacity-60">
              {isConnecting ? "connecting" : isConnected ? "connected" : "disconnected"}
            </span>
          </span>
        }
      />

      <CloudProvidersSettings />

      <SettingsPanel title="Active provider">
        <SettingsCard>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-white">
                {currentProvider?.name ?? "Unknown provider"}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--color-text-dim)]">
                {currentBaseUrl ?? (selectedProvider === "lm-studio" ? "Local server on this machine" : "No endpoint configured")}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-text-dim)]">
                {selectedModel ? `Using ${selectedModel}` : "No model selected"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void reconnectProvider()}
                disabled={isConnecting}
                className={settingsButtonClass}
              >
                Reconnect
              </button>
              <button
                type="button"
                onClick={() => void startProviderServer()}
                disabled={isConnecting}
                className={settingsButtonClass}
              >
                Start server
              </button>
            </div>
          </div>
          {connectionError && (
            <div className="flex items-start gap-2 border-t border-red-500/20 bg-red-500/[0.07] px-5 py-3 text-[12.5px] leading-relaxed text-red-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{connectionError}</span>
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="Favorite models"
        description="Favorites stay at the top of the model picker in chat and in the override list below."
      >
        <SettingsCard>
          {favorites.length === 0 ? (
            <EmptyState
              icon={<Star className="size-5" />}
              title="No favorites yet"
              description="Star a model below, or from the model picker in chat."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {favorites.map((model) => (
                <div key={model.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-white">{model.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--color-text-dim)]">
                      {model.size && <span>{model.size}</span>}
                      {model.size && model.contextWindow && <span className="opacity-40">/</span>}
                      {model.contextWindow && <span>{formatWindow(model.contextWindow)} context</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${model.name} from favorites`}
                    onClick={() => toggleFavoriteModel(model.id)}
                    className="grid size-8 place-items-center rounded-lg text-amber-400 transition-colors hover:bg-white/[0.06]"
                  >
                    <Star className="size-4" fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="Global defaults"
        description="Applied to every model that has no override. Models decide how much of this they honor."
      >
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <SettingsCard>
            <div className="border-b border-[var(--color-border)] px-5 py-3">
              <p className="text-[13px] font-medium text-white">Sampling</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              <SliderControl
                label="Temperature"
                description="Lower is more focused, higher is more creative."
                value={defaultTemperature}
                onChange={setDefaultTemperature}
                min={0}
                max={2}
                step={0.05}
                formatValue={(n) => n.toFixed(2)}
              />
              <SliderControl
                label="Top-p"
                description="Nucleus sampling. 1.0 keeps the full distribution."
                value={defaultTopP}
                onChange={setDefaultTopP}
                min={0}
                max={1}
                step={0.05}
                formatValue={(n) => n.toFixed(2)}
              />
              <SliderControl
                label="Repetition penalty"
                description="1.0 applies no penalty; higher discourages repeats."
                value={defaultRepetitionPenalty}
                onChange={setDefaultRepetitionPenalty}
                min={1}
                max={2}
                step={0.05}
                formatValue={(n) => n.toFixed(2)}
              />
            </div>
          </SettingsCard>

          <SettingsCard>
            <div className="border-b border-[var(--color-border)] px-5 py-3">
              <p className="text-[13px] font-medium text-white">Output</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              <SliderControl
                label="Max output tokens"
                description="Upper bound on a single reply. 0 leaves it to the model."
                value={defaultMaxTokens}
                onChange={setDefaultMaxTokens}
                min={0}
                max={131072}
                step={64}
                formatValue={(n) => (n === 0 ? "Unlimited" : n.toLocaleString())}
              />
              <StopSequencesInput
                value={defaultStopSequences}
                onChange={setDefaultStopSequences}
              />
            </div>
          </SettingsCard>

          <SettingsCard>
            <div className="border-b border-[var(--color-border)] px-5 py-3">
              <p className="text-[13px] font-medium text-white">Context</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              <SliderControl
                label="Conversation context window"
                description="Auto uses the loaded model's own window."
                value={defaultContextLength}
                onChange={setDefaultContextLength}
                min={0}
                max={2097152}
                step={512}
                formatValue={(n) =>
                  n === 0 ? "Auto" : n >= 1024 ? formatWindow(n) : `${n}`
                }
              />
              <SliderControl
                label="Response reserve"
                description="Tokens kept free for the reply when budgeting context."
                value={defaultReservedOutputTokens}
                onChange={setDefaultReservedOutputTokens}
                min={256}
                max={131072}
                step={256}
                formatValue={(n) => n.toLocaleString()}
              />
            </div>
          </SettingsCard>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Per-model overrides"
        description={
          models.length > 0
            ? `${models.length} model${models.length === 1 ? "" : "s"} available from ${currentProvider?.name ?? "the active provider"}. Expand one to tune it.`
            : "Override global defaults for a single model."
        }
      >
        {models.length === 0 ? (
          <SettingsCard>
            <EmptyState
              title={isConnected ? "No models found" : "Connect a provider first"}
              description={
                isConnected
                  ? "Load a model in your provider, then reconnect to list it here."
                  : "Models from cloud providers and LM Studio appear here once connected."
              }
            />
          </SettingsCard>
        ) : (
          <SettingsCard>
            <div className="divide-y divide-[var(--color-border)]">
              {models.map((model) => (
                <ModelOverrideRow
                  key={model.id}
                  model={model}
                  isActive={model.id === selectedModel}
                  onSelect={() => setSelectedModel(model.id)}
                />
              ))}
            </div>
          </SettingsCard>
        )}
      </SettingsPanel>
    </div>
  );
}

function formatWindow(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)}K` : `${n}`;
}

function ModelOverrideRow({
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
  const favoriteModels = useSettingsStore((s) => s.favoriteModels);
  const toggleFavoriteModel = useSettingsStore((s) => s.toggleFavoriteModel);

  const override = modelOverrides[model.id];
  const resolved = getModelSettings(model.id);
  const isFavorite = favoriteModels.includes(model.id);

  const hasAnyCustom =
    !!override &&
    (override.temperature != null ||
      override.contextLength != null ||
      override.maxTokens != null ||
      override.topP != null ||
      override.repetitionPenalty != null ||
      (override.stopSequences && override.stopSequences.length > 0) ||
      override.reservedOutputTokens != null ||
      (override.systemPrompt && override.systemPrompt.length > 0));

  const update = (patch: ModelSettings) => {
    setModelOverride(model.id, { ...override, ...patch });
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full border ${
              isActive
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-focus)]"
                : "border-[var(--color-border-strong)] text-transparent"
            }`}
          >
            <Check className="size-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">{model.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
              {model.size && <span>{model.size}</span>}
              {model.contextWindow && <span>{formatWindow(model.contextWindow)} context</span>}
              {model.supportsImages && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3" /> vision
                </span>
              )}
              {hasAnyCustom && <span className="text-amber-400">custom</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={isFavorite ? `Unstar ${model.name}` : `Star ${model.name}`}
          onClick={() => toggleFavoriteModel(model.id)}
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/[0.06] ${
            isFavorite ? "text-amber-400" : "text-[var(--color-text-dim)]/60 hover:text-white"
          }`}
        >
          <Star className="size-3.5" fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          aria-label={`${expanded ? "Hide" : "Show"} ${model.name} overrides`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)] bg-black/20 px-5 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-[var(--color-text-dim)]">
              Values left alone follow the global defaults.
            </p>
            {hasAnyCustom && (
              <button type="button" onClick={() => clearModelOverride(model.id)} className={settingsButtonClass}>
                Reset overrides
              </button>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
            <SliderControl
              label="Temperature"
              description={`Global ${resolved.temperature.toFixed(2)}`}
              value={resolved.temperature}
              onChange={(v) => update({ temperature: v })}
              min={0}
              max={2}
              step={0.05}
              formatValue={(n) => n.toFixed(2)}
            />
            <SliderControl
              label="Top-p"
              description={`Global ${resolved.topP.toFixed(2)}`}
              value={resolved.topP}
              onChange={(v) => update({ topP: v })}
              min={0}
              max={1}
              step={0.05}
              formatValue={(n) => n.toFixed(2)}
            />
            <SliderControl
              label="Repetition penalty"
              description={`Global ${resolved.repetitionPenalty.toFixed(2)}`}
              value={resolved.repetitionPenalty}
              onChange={(v) => update({ repetitionPenalty: v })}
              min={1}
              max={2}
              step={0.05}
              formatValue={(n) => n.toFixed(2)}
            />
            <SliderControl
              label="Max output tokens"
              description={`Global ${resolved.maxTokens === 0 ? "unlimited" : resolved.maxTokens.toLocaleString()}`}
              value={resolved.maxTokens}
              onChange={(v) => update({ maxTokens: v })}
              min={0}
              max={131072}
              step={64}
              formatValue={(n) => (n === 0 ? "Unlimited" : n.toLocaleString())}
            />
            <SliderControl
              label="Context window"
              description={`Global ${resolved.contextLength === 0 ? "auto" : formatWindow(resolved.contextLength)}`}
              value={resolved.contextLength}
              onChange={(v) => update({ contextLength: v })}
              min={0}
              max={2097152}
              step={512}
              formatValue={(n) => (n === 0 ? "Auto" : formatWindow(n))}
            />
            <SliderControl
              label="Response reserve"
              description={`Global ${resolved.reservedOutputTokens.toLocaleString()}`}
              value={resolved.reservedOutputTokens}
              onChange={(v) => update({ reservedOutputTokens: v })}
              min={256}
              max={131072}
              step={256}
              formatValue={(n) => n.toLocaleString()}
            />
          </div>
          <div className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] font-medium text-white">System prompt override</p>
              <p className="text-[11.5px] text-[var(--color-text-dim)]">
                Replaces the Chat tab prompt for this model.
              </p>
            </div>
            <textarea
              value={override?.systemPrompt ?? ""}
              onChange={(e) => update({ systemPrompt: e.target.value || undefined })}
              rows={4}
              spellCheck={false}
              placeholder={
                resolved.systemPrompt
                  ? "Leave empty to use the Chat tab prompt"
                  : "No prompt set in Chat settings"
              }
              className={`${settingsTextareaClass} max-w-[980px]`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StopSequencesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (s: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));

  useEffect(() => {
    const timer = window.setTimeout(() => setDraft(value.join(", ")), 0);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-white">Stop sequences</p>
        <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
          {value.length} set
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--color-text-dim)]">
        Comma-separated strings that end a reply early.
      </p>
      <input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(
            event.target.value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean),
          );
        }}
        placeholder="</answer>, END"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors placeholder:text-[var(--color-text-dim)]/40 focus:border-[var(--color-accent)]/60"
      />
    </div>
  );
}
