import { useState } from "react";
import { Check, KeyRound, Plus, Trash2 } from "lucide-react";
import { useProviderStore } from "@/stores/provider-store";
import {
  deleteCloudCredential,
  saveCloudCredential,
  type CloudProviderConfig,
} from "@/lib/providers/cloud-config";
import { validateCloudBaseUrl } from "@/lib/providers/openai-compatible-adapter";
import {
  SettingsCallout,
  SettingsCard,
  SettingsPanel,
  settingsButtonClass,
  settingsInputClass,
  settingsPrimaryButtonClass,
} from "./settings-ui";

export function CloudProvidersSettings() {
  const configs = useProviderStore((state) => state.cloudProviders);
  const upsert = useProviderStore((state) => state.upsertCloudProvider);
  const remove = useProviderStore((state) => state.removeCloudProvider);
  const reconnect = useProviderStore((state) => state.reconnectProvider);
  const [editing, setEditing] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (config: CloudProviderConfig) => {
    const urlError = validateCloudBaseUrl(config.baseUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    if (!apiKey.trim() && !config.hasCredential) {
      setError("Enter an API key.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (apiKey.trim()) await saveCloudCredential(config.id, apiKey.trim());
      upsert({ ...config, hasCredential: true });
      setApiKey("");
      setEditing(null);
      await reconnect(config.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save provider.");
    } finally {
      setBusy(false);
    }
  };

  const removeProvider = async (config: CloudProviderConfig) => {
    setBusy(true);
    try {
      await deleteCloudCredential(config.id);
      if (config.preset === "custom") remove(config.id);
      else upsert({ ...config, hasCredential: false });
    } finally {
      setBusy(false);
    }
  };

  const addCustom = () => {
    const id = `custom-${crypto.randomUUID()}`;
    upsert({
      id,
      preset: "custom",
      name: "Custom provider",
      baseUrl: "https://",
      manualModels: [],
      hasCredential: false,
    });
    setEditing(id);
    setApiKey("");
  };

  return (
    <SettingsPanel
      title="Cloud providers"
      description="Keys are stored in your operating system's credential vault, never in the app data."
      actions={
        <button type="button" onClick={addCustom} className={settingsButtonClass}>
          <Plus className="size-3.5" />
          Custom provider
        </button>
      }
    >
      {error && (
        <div className="mb-3">
          <SettingsCallout tone="danger">{error}</SettingsCallout>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {configs.map((config) =>
          editing === config.id ? (
            <div key={config.id} className="md:col-span-2 2xl:col-span-3">
              <SettingsCard>
                <ProviderEditor
                  config={config}
                  apiKey={apiKey}
                  busy={busy}
                  onKeyChange={setApiKey}
                  onChange={upsert}
                  onCancel={() => {
                    setEditing(null);
                    setError(null);
                  }}
                  onSave={() => void save(config)}
                />
              </SettingsCard>
            </div>
          ) : (
            <div
              key={config.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3"
            >
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                  config.hasCredential
                    ? "bg-emerald-500/12 text-emerald-300"
                    : "bg-white/[0.05] text-[var(--color-text-dim)]"
                }`}
              >
                {config.hasCredential ? (
                  <Check className="size-4" />
                ) : (
                  <KeyRound className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-white">{config.name}</p>
                  {!config.hasCredential && (
                    <span className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-dim)]">
                      no key
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[11.5px] text-[var(--color-text-dim)]">
                  {config.baseUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(config.id);
                  setApiKey("");
                  setError(null);
                }}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-[var(--color-focus)] transition-colors hover:bg-white/[0.06]"
              >
                Configure
              </button>
              {(config.hasCredential || config.preset === "custom") && (
                <button
                  type="button"
                  aria-label={`Remove ${config.name}`}
                  disabled={busy}
                  onClick={() => void removeProvider(config)}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ),
        )}
      </div>
    </SettingsPanel>
  );
}

function ProviderEditor({
  config,
  apiKey,
  busy,
  onKeyChange,
  onChange,
  onCancel,
  onSave,
}: {
  config: CloudProviderConfig;
  apiKey: string;
  busy: boolean;
  onKeyChange: (value: string) => void;
  onChange: (config: CloudProviderConfig) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const update = (partial: Partial<CloudProviderConfig>) => onChange({ ...config, ...partial });
  return (
    <div className="space-y-3 bg-black/20 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-[12px] text-[var(--color-text-dim)]">
          Name
          <input
            className={settingsInputClass}
            value={config.name}
            disabled={config.preset !== "custom"}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className="space-y-1.5 text-[12px] text-[var(--color-text-dim)]">
          API key
          <input
            className={settingsInputClass}
            type="password"
            autoComplete="off"
            placeholder={config.hasCredential ? "Leave blank to keep the saved key" : "Paste API key"}
            value={apiKey}
            onChange={(event) => onKeyChange(event.target.value)}
          />
        </label>
      </div>
      <label className="block space-y-1.5 text-[12px] text-[var(--color-text-dim)]">
        Base URL
        <input
          className={settingsInputClass}
          value={config.baseUrl}
          disabled={config.preset !== "custom"}
          onChange={(event) => update({ baseUrl: event.target.value })}
        />
      </label>
      <label className="block space-y-1.5 text-[12px] text-[var(--color-text-dim)]">
        Manual model IDs <span className="opacity-60">(comma separated)</span>
        <input
          className={settingsInputClass}
          placeholder="model-id, another-model"
          value={config.manualModels.join(", ")}
          onChange={(event) =>
            update({
              manualModels: event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      {config.preset === "opencode-zen" && (
        <p className="text-[12px] text-amber-300/80">
          Models are read from the OpenCode catalog. Free-tier models only work from the OpenCode
          client.
        </p>
      )}
      {config.preset === "opencode-go" && (
        <p className="text-[12px] text-amber-300/80">
          Models are read from the OpenCode Go catalog and need an active Go, Go Plus, or Go Teams
          subscription.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={settingsButtonClass}>
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={onSave} className={settingsPrimaryButtonClass}>
          {busy ? "Testing…" : "Save & test"}
        </button>
      </div>
    </div>
  );
}
