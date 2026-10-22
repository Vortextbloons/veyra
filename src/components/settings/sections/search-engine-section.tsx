import { FileText, RefreshCw, Search } from "lucide-react";
import type { SearchEngineStatus } from "@/modules/web-search/tauri-commands";
import { CollapsibleSettingsSection } from "../collapsible-settings-section";

interface SearchEngineSectionProps {
  engineStatus: SearchEngineStatus | null;
  engineAction: "idle" | "restarting";
  engineError: string;
  engineLogs: string;
  onRestart: () => void;
  onLoadLogs: () => void;
}

function statusLabel(status: SearchEngineStatus | null): string {
  if (!status) {
    return "Checking";
  }
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
    <CollapsibleSettingsSection
      subsectionKey="webSearch:engine"
      title="Search Engine"
      description="Bundled local engine — starts and stops with the app."
      keywords={["engine", "dontsech", "donsetch", "restart", "logs", "local"]}
      defaultExpanded
    >
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <div
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${
            state === "ready"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-[var(--color-bg)] text-[var(--color-text-dim)]"
          }`}
        >
          <Search className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-white">DonSeTch</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(engineStatus)}`}
            >
              {statusLabel(engineStatus)}
            </span>
            {engineStatus?.version && engineStatus.version !== "unknown" && (
              <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
                v{engineStatus.version}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {detail}
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-text-dim)]/80">
            Included with Veyra. No Docker, no Python, no separate install. It starts on launch
            and is stopped when Veyra exits.
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-text-dim)]/60">
            DonSeTch is licensed under{" "}
            <a
              href="https://github.com/dondai44423/donsetch/blob/v4.10.1/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--color-text-dim)]"
            >
              AGPL-3.0
            </a>
            . Source and license are included in the install.
          </p>
          {(engineError || (state === "failed" && engineStatus?.message)) && (
            <p className="mt-2 whitespace-pre-wrap text-[11px] text-red-400">
              {engineError || engineStatus?.message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onRestart}
            disabled={engineAction === "restarting"}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`size-3.5 ${engineAction === "restarting" ? "animate-spin" : ""}`}
            />
            {engineAction === "restarting" ? "Restarting…" : "Restart"}
          </button>
          <button
            type="button"
            onClick={onLoadLogs}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <FileText className="size-3.5" />
            Logs
          </button>
        </div>
      </div>

      {engineLogs && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--color-text-dim)]">
          {engineLogs}
        </pre>
      )}

      {engineStatus?.logPath && !engineLogs && (
        <p className="text-[10.5px] text-[var(--color-text-dim)]/70">
          Log file: <span className="font-mono">{engineStatus.logPath}</span>
        </p>
      )}
    </CollapsibleSettingsSection>
  );
}
