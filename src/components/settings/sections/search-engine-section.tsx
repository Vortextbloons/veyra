import { FileText, RefreshCw, Search } from "lucide-react";
import type { SearchEngineStatus } from "@/modules/web-search/tauri-commands";
import {
  SettingsCard,
  SettingsPanel,
  settingsButtonClass,
} from "../settings-ui";

interface SearchEngineSectionProps {
  engineStatus: SearchEngineStatus | null;
  engineAction: "idle" | "restarting";
  engineError: string;
  engineLogs: string;
  onRestart: () => void;
  onLoadLogs: () => void;
}

function statusLabel(status: SearchEngineStatus | null): string {
  if (!status) return "Checking";
  switch (status.state) {
    case "ready":
      return "Running";
    case "starting":
      return "Starting";
    case "failed":
      return "Failed";
    default:
      return "Stopped";
  }
}

function statusTone(status: SearchEngineStatus | null): string {
  switch (status?.state) {
    case "ready":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "starting":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "failed":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    default:
      return "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-dim)]";
  }
}

export function SearchEngineSection({
  engineStatus,
  engineAction,
  engineError,
  engineLogs,
  onRestart,
  onLoadLogs,
}: SearchEngineSectionProps) {
  const state = engineStatus?.state ?? "stopped";
  const detail = !engineStatus
    ? "Checking the bundled engine…"
    : (engineStatus.message ??
      (state === "ready"
        ? `Local engine ready${engineStatus.url ? ` at ${engineStatus.url}` : ""}.`
        : state === "starting"
          ? "Starting with Veyra…"
          : "The engine starts automatically with Veyra."));

  return (
    <SettingsPanel
      title="Search engine"
      description="Bundled with the app: no Docker, Python, or separate install. It starts and stops with Veyra."
    >
      <SettingsCard>
        <div className="flex flex-wrap items-start gap-4 px-5 py-4">
          <div
            className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg ${
              state === "ready"
                ? "bg-emerald-500/12 text-emerald-300"
                : "bg-white/[0.05] text-[var(--color-text-dim)]"
            }`}
          >
            <Search className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-medium text-white">DonSeTch</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(engineStatus)}`}
              >
                {statusLabel(engineStatus)}
              </span>
              {engineStatus?.version && engineStatus.version !== "unknown" && (
                <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
                  v{engineStatus.version}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
              {detail}
            </p>
            {(engineError || (state === "failed" && engineStatus?.message)) && (
              <p className="mt-2 whitespace-pre-wrap text-[12px] text-red-300">
                {engineError || engineStatus?.message}
              </p>
            )}
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]/70">
              DonSeTch is licensed under{" "}
              <a
                href="https://github.com/dondai44423/donsetch/blob/v4.10.1/LICENSE"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-[var(--color-text-dim)]"
              >
                AGPL-3.0
              </a>
              . Source and license ship with the install.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onRestart}
              disabled={engineAction === "restarting"}
              className={settingsButtonClass}
            >
              <RefreshCw
                className={`size-3.5 ${engineAction === "restarting" ? "animate-spin" : ""}`}
              />
              {engineAction === "restarting" ? "Restarting…" : "Restart"}
            </button>
            <button type="button" onClick={onLoadLogs} className={settingsButtonClass}>
              <FileText className="size-3.5" />
              Logs
            </button>
          </div>
        </div>

        {engineLogs && (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-3 font-mono text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {engineLogs}
          </pre>
        )}

        {engineStatus?.logPath && !engineLogs && (
          <p className="border-t border-[var(--color-border)] px-5 py-2.5 text-[11.5px] text-[var(--color-text-dim)]/70">
            Log file: <span className="font-mono">{engineStatus.logPath}</span>
          </p>
        )}
      </SettingsCard>
    </SettingsPanel>
  );
}
