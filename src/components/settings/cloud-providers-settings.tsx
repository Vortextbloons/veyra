import { useState } from "react";
import { Check, KeyRound, Plus, Trash2 } from "lucide-react";
import { useProviderStore } from "@/stores/provider-store";
import {
  deleteCloudCredential,
  saveCloudCredential,
  type CloudProviderConfig,
} from "@/lib/providers/cloud-config";
import { validateCloudBaseUrl } from "@/lib/providers/openai-compatible-adapter";

const inputClass = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[12px] text-white outline-none transition-colors focus:border-[var(--color-accent)]/60";

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
    if (urlError) { setError(urlError); return; }
    if (!apiKey.trim() && !config.hasCredential) { setError("Enter an API key."); return; }
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
    upsert({ id, preset: "custom", name: "Custom provider", baseUrl: "https://", manualModels: [], hasCredential: false });
    setEditing(id);
    setApiKey("");
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Cloud providers</h2>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">Keys stay in your operating system credential vault.</p>
        </div>
        <button type="button" onClick={addCustom} className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:text-white">
          <Plus className="size-3" /> Custom
        </button>
      </div>
      {error && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>}
      <div className="space-y-2">
        {configs.map((config) => editing === config.id ? (
          <ProviderEditor key={config.id} config={config} apiKey={apiKey} busy={busy} onKeyChange={setApiKey} onChange={upsert} onCancel={() => { setEditing(null); setError(null); }} onSave={() => void save(config)} />
        ) : (
          <div key={config.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
            <div className={`grid size-8 place-items-center rounded-md ${config.hasCredential ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-[var(--color-text-dim)]"}`}>
              {config.hasCredential ? <Check className="size-3.5" /> : <KeyRound className="size-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-white">{config.name}</div>
              <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">{config.baseUrl}</div>
            </div>
            <button type="button" onClick={() => { setEditing(config.id); setApiKey(""); setError(null); }} className="rounded-md px-2 py-1 text-[11px] text-indigo-300 hover:bg-white/5">Configure</button>
            {(config.hasCredential || config.preset === "custom") && <button type="button" disabled={busy} onClick={() => void removeProvider(config)} className="rounded-md p-1.5 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-3.5" /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderEditor({ config, apiKey, busy, onKeyChange, onChange, onCancel, onSave }: {
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
    <div className="space-y-3 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-panel)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[11px] text-[var(--color-text-dim)]">Name<input className={inputClass} value={config.name} disabled={config.preset !== "custom"} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="space-y-1 text-[11px] text-[var(--color-text-dim)]">API key<input className={inputClass} type="password" autoComplete="off" placeholder={config.hasCredential ? "Leave blank to keep existing key" : "Paste API key"} value={apiKey} onChange={(event) => onKeyChange(event.target.value)} /></label>
      </div>
      <label className="block space-y-1 text-[11px] text-[var(--color-text-dim)]">Base URL<input className={inputClass} value={config.baseUrl} disabled={config.preset !== "custom"} onChange={(event) => update({ baseUrl: event.target.value })} /></label>
      <label className="block space-y-1 text-[11px] text-[var(--color-text-dim)]">Manual model IDs <span className="opacity-60">(comma separated)</span><input className={inputClass} placeholder="model-id, another-model" value={config.manualModels.join(", ")} onChange={(event) => update({ manualModels: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
      {config.preset === "opencode-zen" && <p className="text-[10.5px] text-amber-300/80">Only Zen models served through Chat Completions are shown in this release.</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:text-white">Cancel</button><button type="button" disabled={busy} onClick={onSave} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50">{busy ? "Testing…" : "Save & test"}</button></div>
    </div>
  );
}
