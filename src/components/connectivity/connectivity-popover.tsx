import { useCallback, useRef, useState } from "react";
import { Shield, Wifi, WifiOff } from "lucide-react";
import type { ConnectivityPreference } from "@/lib/connectivity/connectivity-types";
import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useSettingsStore } from "@/stores/settings-store";

const QUICK_OPTIONS: { id: ConnectivityPreference; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

export function ConnectivityPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preference = useSettingsStore((s) => s.connectivityPreference);
  const setConnectivityPreference = useSettingsStore((s) => s.setConnectivityPreference);
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);
  const { effectiveConnectivity, label, description, probing } = useConnectivity();

  useClickOutside(ref, open, () => setOpen(false));

  const handleSelect = useCallback(
    (next: ConnectivityPreference) => {
      setConnectivityPreference(next);
    },
    [setConnectivityPreference],
  );

  const openSettings = useCallback(() => {
    setActiveNav("settings");
    setOpen(false);
  }, [setActiveNav]);

  const statusColor =
    effectiveConnectivity === "online"
      ? "text-emerald-300"
      : preference === "offline"
        ? "text-amber-300"
        : "text-[var(--color-text-dim)]";

  const StatusIcon =
    effectiveConnectivity === "online"
      ? Wifi
      : preference === "offline"
        ? Shield
        : WifiOff;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Connectivity: ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6 items-center gap-1.5 rounded px-2 transition-colors ${
          open
            ? "bg-white/[0.08] text-white"
            : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        <StatusIcon className={`size-3.5 ${statusColor}`} />
        <span className={`text-[11px] ${statusColor}`}>{label}</span>
        {probing && (
          <span className="size-1.5 animate-pulse rounded-full bg-white/40" aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Connectivity settings"
          className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-xl shadow-black/40"
        >
          <p className="text-[12.5px] font-medium text-white">{label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {description}
          </p>

          <div className="mt-3 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
            {QUICK_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  preference === option.id
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openSettings}
            className="mt-3 w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
          >
            Open Privacy &amp; Connectivity settings
          </button>
        </div>
      )}
    </div>
  );
}
