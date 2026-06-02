import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { invokeTestSearxngConnection } from "@/modules/web-search/tauri-commands";
import {
  invokeCheckSearxngSetup,
  invokeStartSearxngContainer,
  invokeStopSearxngContainer,
  type SearxngSetupStatus,
} from "@/modules/web-search/searxng-setup";
import { CheckCircle, XCircle, Loader2, Container } from "lucide-react";

type TestStatus = "idle" | "testing" | "success" | "error";

export function WebSearchSettings() {
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useSettingsStore((s) => s.setWebSearchEnabled);
  const webSearchSearxngUrl = useSettingsStore((s) => s.webSearchSearxngUrl);
  const setWebSearchSearxngUrl = useSettingsStore(
    (s) => s.setWebSearchSearxngUrl,
  );
  const webSearchDefaultMode = useSettingsStore((s) => s.webSearchDefaultMode);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string>("");

  // Docker / SearXNG container status
  const [setupStatus, setSetupStatus] = useState<SearxngSetupStatus | null>(null);
  const [containerAction, setContainerAction] = useState<"idle" | "starting" | "stopping">("idle");
  const [containerError, setContainerError] = useState<string>("");

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await invokeCheckSearxngSetup();
      setSetupStatus(status);
    } catch {
      // ignore — Docker may not be available
    }
  }, []);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestError("");
    try {
      const ok = await invokeTestSearxngConnection(webSearchSearxngUrl);
      setTestStatus(ok ? "success" : "error");
      if (!ok) setTestError("Connection failed. Check the URL and try again.");
    } catch (e) {
      setTestStatus("error");
      setTestError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleStartContainer() {
    setContainerAction("starting");
    setContainerError("");
    try {
      const url = await invokeStartSearxngContainer();
      setWebSearchSearxngUrl(url);
      setWebSearchEnabled(true);
      await refreshSetupStatus();
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    } finally {
      setContainerAction("idle");
    }
  }

  async function handleStopContainer() {
    setContainerAction("stopping");
    setContainerError("");
    try {
      await invokeStopSearxngContainer();
      await refreshSetupStatus();
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    } finally {
      setContainerAction("idle");
    }
  }

  const dockerInstalled = setupStatus?.docker_installed ?? false;
  const containerRunning = setupStatus?.container_running ?? false;

  return (
    <div className="space-y-8">
      {/* ── Docker / SearXNG Status ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          SearXNG Server
        </h2>

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
                    ? `Container "${setupStatus?.container_exists ? "veyra-searxng" : ""}" active on port 8888`
                    : dockerInstalled
                      ? "Docker is available. Start the SearXNG container to enable web search."
                      : "Docker is required for automatic setup."}
                </div>
              </div>
              {containerRunning ? (
                <button
                  type="button"
                  onClick={handleStopContainer}
                  disabled={containerAction !== "idle"}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {containerAction === "stopping" ? "Stopping…" : "Stop"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartContainer}
                  disabled={containerAction !== "idle" || !dockerInstalled}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {containerAction === "starting" ? "Starting…" : "Start SearXNG"}
                </button>
              )}
            </div>

            {containerError && (
              <p className="text-[11px] text-red-400">{containerError}</p>
            )}
          </div>
        )}
      </section>

      {/* ── Web Search Toggle ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Web Search
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable web search"
              on={webSearchEnabled}
              onChange={setWebSearchEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Allow the AI to search the web when it needs current information.
          </p>
        </div>
      </section>

      {/* ── SearXNG URL ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          SearXNG Provider
        </h2>
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                SearXNG Instance URL
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {containerRunning
                  ? "Auto-configured from Docker. You can override this with a custom URL."
                  : "Enter the URL of your SearXNG instance."}
              </div>
            </div>
            <input
              type="text"
              value={webSearchSearxngUrl}
              onChange={(e) => setWebSearchSearxngUrl(e.target.value)}
              placeholder="http://localhost:8888"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === "testing" || !webSearchSearxngUrl.trim()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testStatus === "testing" ? "Testing…" : "Test Connection"}
            </button>

            {testStatus === "testing" && (
              <Loader2 className="size-3.5 animate-spin text-[var(--color-text-dim)]" />
            )}
            {testStatus === "success" && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle className="size-3.5" />
                Connected
              </span>
            )}
            {testStatus === "error" && (
              <span className="flex items-center gap-1 text-[11px] text-red-400">
                <XCircle className="size-3.5" />
                {testError}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Search Mode ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Search Mode
        </h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-[12.5px] font-medium text-white">
            Auto When Needed
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            The AI decides when to search based on the conversation. You can
            override this per-chat.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            Current: {webSearchDefaultMode}
          </div>
        </div>
      </section>
    </div>
  );
}
