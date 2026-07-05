import { Container } from "lucide-react";
import { CollapsibleSettingsSection } from "../collapsible-settings-section";

interface SearxngServerSectionProps {
  dockerInstalled: boolean;
  dockerDaemonRunning: boolean;
  containerRunning: boolean;
  containerExists: boolean;
  containerAction: "idle" | "starting" | "stopping";
  setupError: string;
  onStartContainer: () => void;
  onStopContainer: () => void;
}

export function SearxngServerSection({
  dockerInstalled,
  dockerDaemonRunning,
  containerRunning,
  containerExists,
  containerAction,
  setupError,
  onStartContainer,
  onStopContainer,
}: SearxngServerSectionProps) {
  return (
    <CollapsibleSettingsSection
      subsectionKey="webSearch:searxng"
      title="SearXNG Server"
      description="Docker container status and automatic setup."
      keywords={["docker", "container", "searxng", "start", "stop"]}
      defaultExpanded
    >
      {!dockerInstalled ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <p className="text-[12px] text-[var(--color-text-dim)]">
            Docker is not installed. Install{" "}
            <a
              href="https://www.docker.com/products/docker-desktop/"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-accent)] underline"
            >
              Docker Desktop
            </a>{" "}
            to enable automatic SearXNG setup, or enter a SearXNG URL manually below.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {!dockerDaemonRunning && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-[12px] text-amber-200">
                Docker is not running yet. Veyra will start Docker Desktop
                automatically when you start SearXNG (first launch may take up
                to a minute).
              </p>
              <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                Class lab tip: in Docker Desktop → Settings → General, enable
                &quot;Start Docker Desktop when you sign in&quot; so students
                never need to open it manually.
              </p>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div
              className={`grid size-8 place-items-center rounded-md ${
                containerRunning
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-[var(--color-bg)] text-[var(--color-text-dim)]"
              }`}
            >
              <Container className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white">
                {containerRunning ? "SearXNG is running" : "SearXNG is not running"}
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {containerRunning
                  ? `Container "${containerExists ? "veyra-searxng" : ""}" active on port 8888`
                  : dockerInstalled
                    ? "Docker is available. Start the SearXNG container to enable web search."
                    : "Docker is required for automatic setup."}
              </div>
            </div>
            {containerRunning ? (
              <button
                type="button"
                onClick={onStopContainer}
                disabled={containerAction !== "idle"}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {containerAction === "stopping" ? "Stopping…" : "Stop"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartContainer}
                disabled={containerAction !== "idle"}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {containerAction === "starting"
                  ? dockerDaemonRunning
                    ? "Starting…"
                    : "Starting Docker…"
                  : "Start SearXNG"}
              </button>
            )}
          </div>

          {setupError && (
            <p className="text-[11px] text-red-400">{setupError}</p>
          )}
        </div>
      )}
    </CollapsibleSettingsSection>
  );
}
