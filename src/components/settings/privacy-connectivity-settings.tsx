import { useCallback } from "react";
import { Loader2, Shield, Wifi, WifiOff } from "lucide-react";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";
import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useSettingsStore } from "@/stores/settings-store";

const PREFERENCE_OPTIONS: {
  id: ConnectivityPreference;
  label: string;
  description: string;
}[] = [
  {
    id: "auto",
    label: "Auto",
    description: "Follow your network connection. Web search turns off when offline.",
  },
  {
    id: "online",
    label: "Online",
    description: "Keep internet features enabled even if the probe cannot verify connectivity.",
  },
  {
    id: "offline",
    label: "Offline",
    description: "Privacy mode — block web search and cloud models. Nothing leaves your machine.",
  },
];

function formatProbeTime(timestamp: number | null): string {
  if (!timestamp) return "Not checked yet";
  return new Date(timestamp).toLocaleTimeString();
}

export function PrivacyConnectivitySettings() {
  const connectivityPreference = useSettingsStore((s) => s.connectivityPreference);
  const setConnectivityPreference = useSettingsStore((s) => s.setConnectivityPreference);
  const webSearchDefaultMode = useSettingsStore((s) => s.webSearchDefaultMode);

  const {
    effectiveConnectivity,
    systemOnline,
    probing,
    lastProbeAt,
    label,
    description,
    featureMatrix,
    refreshProbe,
  } = useConnectivity();

  const handlePreferenceChange = useCallback(
    (preference: ConnectivityPreference) => {
      setConnectivityPreference(preference);
    },
    [setConnectivityPreference],
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Privacy &amp; Connectivity
        </h2>
        <p className="mb-4 max-w-xl text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          Local AI via LM Studio never sends your conversations to the cloud. Offline mode blocks
          web search and cloud models while keeping chat, memory, and documents on your machine.
        </p>

        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${
              effectiveConnectivity === "online"
                ? "bg-emerald-500/15 text-emerald-300"
                : connectivityPreference === "offline"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-white/5 text-[var(--color-text-dim)]"
            }`}
          >
            {effectiveConnectivity === "online" ? (
              <Wifi className="size-4" />
            ) : connectivityPreference === "offline" ? (
              <Shield className="size-4" />
            ) : (
              <WifiOff className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-white">{label}</p>
            <p className="text-[11.5px] text-[var(--color-text-dim)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshProbe()}
            disabled={probing}
            className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
          >
            {probing ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh"}
          </button>
        </div>

        <p className="mb-4 text-[11px] text-[var(--color-text-dim)]">
          System probe:{" "}
          {systemOnline === true
            ? "Connected"
            : systemOnline === false
              ? "No connection"
              : "Unknown"}
          {" · "}
          Last checked: {formatProbeTime(lastProbeAt)}
        </p>

        <div className="space-y-2">
          {PREFERENCE_OPTIONS.map((option) => {
            const selected = connectivityPreference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePreferenceChange(option.id)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                  selected
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-white/15"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-white">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Feature availability
        </h2>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {featureMatrix.map((row) => (
                <tr key={row.feature} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2.5 text-white">{row.label}</td>
                  <td className="px-3 py-2.5">
                    {row.available ? (
                      <span className="text-emerald-300">Available</span>
                    ) : (
                      <span className="text-[var(--color-text-dim)]" title={row.reason}>
                        Unavailable
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Web search defaults
        </h2>
        <p className="text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          Connectivity controls whether internet features are allowed at all. When online, your web
          search default mode is <span className="font-mono text-white">{webSearchDefaultMode}</span>
          . Configure per-chat defaults in Tools settings.
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
          Keyboard shortcut: <span className="font-mono text-white">Ctrl+Shift+O</span> toggles
          forced offline mode.
        </p>
      </section>
    </div>
  );
}
