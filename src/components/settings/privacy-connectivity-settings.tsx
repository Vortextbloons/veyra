import { useCallback } from "react";
import { Check, Loader2, Minus, Shield, Wifi, WifiOff } from "lucide-react";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";
import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useSettingsStore } from "@/stores/settings-store";
import {
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  settingsButtonClass,
} from "./settings-ui";

const PREFERENCE_OPTIONS: {
  id: ConnectivityPreference;
  label: string;
  description: string;
}[] = [
  {
    id: "auto",
    label: "Auto",
    description: "Follow the network probe. Internet features turn off when you go offline.",
  },
  {
    id: "online",
    label: "Always online",
    description: "Keep web search and cloud models available even if the probe fails.",
  },
  {
    id: "offline",
    label: "Always offline",
    description: "Block web search and cloud models. Nothing leaves this machine.",
  },
];

function formatProbeTime(timestamp: number | null): string {
  if (!timestamp) return "not checked yet";
  return new Date(timestamp).toLocaleTimeString();
}

export function PrivacyConnectivitySettings() {
  const connectivityPreference = useSettingsStore((s) => s.connectivityPreference);
  const setConnectivityPreference = useSettingsStore((s) => s.setConnectivityPreference);

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
      <SettingsHeader
        title="Privacy"
        description="Chat stays local by default. These controls decide when anything is allowed to leave your machine."
      />

      <SettingsPanel title="Connectivity">
        <SettingsCard>
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div
              className={`grid size-10 shrink-0 place-items-center rounded-lg ${
                effectiveConnectivity === "online"
                  ? "bg-emerald-500/12 text-emerald-300"
                  : connectivityPreference === "offline"
                    ? "bg-amber-500/12 text-amber-300"
                    : "bg-white/[0.05] text-[var(--color-text-dim)]"
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
              <p className="text-[13.5px] font-medium text-white">{label}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
                {description}
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-text-dim)]/80">
                Probe:{" "}
                {systemOnline === true
                  ? "connected"
                  : systemOnline === false
                    ? "no connection"
                    : "unknown"}
                {" · "}last checked {formatProbeTime(lastProbeAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshProbe()}
              disabled={probing}
              className={settingsButtonClass}
            >
              {probing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Check now
            </button>
          </div>

          <div className="grid gap-2 border-t border-[var(--color-border)] p-3 sm:grid-cols-3">
            {PREFERENCE_OPTIONS.map((option) => {
              const selected = connectivityPreference === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handlePreferenceChange(option.id)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/[0.08]"
                      : "border-[var(--color-border)] bg-[var(--color-bg)]/40 hover:border-[var(--color-border-strong)]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium text-white">
                    {selected && <Check className="size-3.5 text-[var(--color-focus)]" />}
                    {option.label}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[var(--color-text-dim)]">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="What each mode allows"
        description="Feature availability follows the effective mode above, not the preference alone."
      >
        <SettingsCard>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[11.5px] text-[var(--color-text-dim)]">
                <th className="px-5 py-2.5 font-medium">Feature</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {featureMatrix.map((row) => (
                <tr key={row.feature} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-3 text-[13px] text-white">{row.label}</td>
                  <td className="px-5 py-3">
                    {row.available ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-300">
                        <Check className="size-3.5" /> Available
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-dim)]"
                        title={row.reason}
                      >
                        <Minus className="size-3.5" /> Blocked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel title="Where your data lives">
        <SettingsCard>
          <div className="space-y-3 px-5 py-4 text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
            <p>
              Conversations, memories, skills, and settings are encrypted and stored on this
              machine. Provider API keys live in the operating system credential vault.
            </p>
            <p>
              Local models through LM Studio never send prompts off-device. Cloud providers
              receive only what the current turn needs, and only while online mode allows it.
            </p>
            <SettingsCallout tone="info" title="Shortcut">
              Press <span className="font-mono text-white">Ctrl+Shift+O</span> to toggle forced
              offline mode from anywhere.
            </SettingsCallout>
          </div>
        </SettingsCard>
      </SettingsPanel>
    </div>
  );
}
