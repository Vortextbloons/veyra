import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import {
  invokeTestSearxngConnection,
  invokeClearWebFetchCache,
  invokeGetWebFetchCacheStats,
  type WebFetchCacheStats,
} from "@/modules/web-search/tauri-commands";
import {
  invokeCheckSearxngSetup,
  invokeStartSearxngContainer,
  invokeStopSearxngContainer,
  type SearxngSetupStatus,
} from "@/modules/web-search/searxng-setup";
import { CheckCircle, XCircle, Loader2, Container, Shield, Trash2 } from "lucide-react";
import { useConnectivity } from "@/lib/connectivity/useConnectivity";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";

type TestStatus = "idle" | "testing" | "success" | "error";

export function WebSearchSettings() {
  const defaultWebSearchEnabled = useSettingsStore((s) => s.defaultWebSearchEnabled);
  const setDefaultWebSearchEnabled = useSettingsStore(
    (s) => s.setDefaultWebSearchEnabled,
  );
  const webSearchSearxngUrl = useSettingsStore((s) => s.webSearchSearxngUrl);
  const setWebSearchSearxngUrl = useSettingsStore(
    (s) => s.setWebSearchSearxngUrl,
  );
  const webSearchDefaultMode = useSettingsStore((s) => s.webSearchDefaultMode);
  const searxngSetupError = useSettingsStore((s) => s.searxngSetupError);

  const webSearchMaxResults = useSettingsStore((s) => s.webSearchMaxResults);
  const setWebSearchMaxResults = useSettingsStore((s) => s.setWebSearchMaxResults);
  const webSearchTimeRange = useSettingsStore((s) => s.webSearchTimeRange);
  const setWebSearchTimeRange = useSettingsStore((s) => s.setWebSearchTimeRange);
  const webSearchCategories = useSettingsStore((s) => s.webSearchCategories);
  const setWebSearchCategories = useSettingsStore((s) => s.setWebSearchCategories);
  const webSearchSafeSearch = useSettingsStore((s) => s.webSearchSafeSearch);
  const setWebSearchSafeSearch = useSettingsStore((s) => s.setWebSearchSafeSearch);
  const webSearchContextTokenLimit = useSettingsStore((s) => s.webSearchContextTokenLimit);
  const setWebSearchContextTokenLimit = useSettingsStore((s) => s.setWebSearchContextTokenLimit);
  const webSearchFetchEnabled = useSettingsStore((s) => s.webSearchFetchEnabled);
  const setWebSearchFetchEnabled = useSettingsStore((s) => s.setWebSearchFetchEnabled);
  const webSearchFetchCount = useSettingsStore((s) => s.webSearchFetchCount);
  const setWebSearchFetchCount = useSettingsStore((s) => s.setWebSearchFetchCount);
  const webSearchPerPageTimeoutSecs = useSettingsStore((s) => s.webSearchPerPageTimeoutSecs);
  const setWebSearchPerPageTimeoutSecs = useSettingsStore(
    (s) => s.setWebSearchPerPageTimeoutSecs,
  );
  const webSearchFetchMaxCharsPerSource = useSettingsStore(
    (s) => s.webSearchFetchMaxCharsPerSource,
  );
  const setWebSearchFetchMaxCharsPerSource = useSettingsStore(
    (s) => s.setWebSearchFetchMaxCharsPerSource,
  );
  const advancedSearchBundleEnabled = useSettingsStore(
    (s) => s.advancedSearchBundleEnabled,
  );
  const setAdvancedSearchBundleEnabled = useSettingsStore(
    (s) => s.setAdvancedSearchBundleEnabled,
  );
  const bundleExtractDocx = useSettingsStore((s) => s.bundleExtractDocx);
  const setBundleExtractDocx = useSettingsStore((s) => s.setBundleExtractDocx);
  const bundleExtractPptx = useSettingsStore((s) => s.bundleExtractPptx);
  const setBundleExtractPptx = useSettingsStore((s) => s.setBundleExtractPptx);
  const bundleExtractXlsx = useSettingsStore((s) => s.bundleExtractXlsx);
  const setBundleExtractXlsx = useSettingsStore((s) => s.setBundleExtractXlsx);
  const bundleExtractEpub = useSettingsStore((s) => s.bundleExtractEpub);
  const setBundleExtractEpub = useSettingsStore((s) => s.setBundleExtractEpub);
  const bundleWaybackFallback = useSettingsStore((s) => s.bundleWaybackFallback);
  const setBundleWaybackFallback = useSettingsStore((s) => s.setBundleWaybackFallback);
  const bundleArxivSearch = useSettingsStore((s) => s.bundleArxivSearch);
  const setBundleArxivSearch = useSettingsStore((s) => s.setBundleArxivSearch);
  const bundleWikipediaSearch = useSettingsStore((s) => s.bundleWikipediaSearch);
  const setBundleWikipediaSearch = useSettingsStore((s) => s.setBundleWikipediaSearch);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string>("");
  const [cacheStats, setCacheStats] = useState<WebFetchCacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearError, setClearError] = useState<string>("");

  // Docker / SearXNG container status
  const [setupStatus, setSetupStatus] = useState<SearxngSetupStatus | null>(null);
  const [containerAction, setContainerAction] = useState<"idle" | "starting" | "stopping">("idle");
  const [containerError, setContainerError] = useState<string>("");

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await invokeCheckSearxngSetup();
      setSetupStatus(status);
    } catch (e) {
      setContainerError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshSetupStatus(), 0);
    return () => window.clearTimeout(id);
  }, [refreshSetupStatus]);

  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await invokeGetWebFetchCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshCacheStats(), 0);
    return () => window.clearTimeout(id);
  }, [refreshCacheStats]);

  async function handleClearCache() {
    setClearingCache(true);
    setClearError("");
    try {
      await invokeClearWebFetchCache();
      await refreshCacheStats();
    } catch (e) {
      setClearError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearingCache(false);
    }
  }

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
  const dockerDaemonRunning = setupStatus?.docker_daemon_running ?? false;
  const containerRunning = setupStatus?.container_running ?? false;
  const setupError = containerError || searxngSetupError;
  const { effectiveConnectivity } = useConnectivity();
  const isConnectivityOffline = effectiveConnectivity === "offline";

  return (
    <div className="space-y-8">
      {isConnectivityOffline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <Shield className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-[12.5px] font-medium text-amber-100">Offline mode is active</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-amber-100/80">
              Web search is disabled while offline. You can still configure SearXNG manually, but
              searches will not run until connectivity is restored.
            </p>
          </div>
        </div>
      )}

      {/* ── Docker / SearXNG Status ──────────────────────────────────────── */}
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

      {/* ── Web Search Toggle ────────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:general"
        title="Web Search"
        description="Default on/off for new chats."
        keywords={["enable", "default", "toggle"]}
        defaultExpanded
      >
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable web search by default"
              on={defaultWebSearchEnabled}
              onChange={setDefaultWebSearchEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            When on, new chats start with web search enabled. You can still turn
            web search on or off per chat from the tools panel.
          </p>
      </CollapsibleSettingsSection>

      {/* ── SearXNG URL ─────────────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:provider"
        title="SearXNG Provider"
        description="Instance URL and connection test."
        keywords={["url", "localhost", "connection", "test"]}
      >
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
      </CollapsibleSettingsSection>

      {/* ── Search Mode ──────────────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:mode"
        title="Search Mode"
        description="How the AI decides when to search."
        keywords={["auto", "always", "off", "mode"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-[12.5px] font-medium text-white">
            Auto When Needed
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            When web search is on for a chat, the AI decides when a search is
            needed. Use the right-panel toggle to enable or disable search for
            the current chat without changing this default.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            Current: {webSearchDefaultMode}
          </div>
        </div>
      </CollapsibleSettingsSection>

      {/* ── Search Parameters ────────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:parameters"
        title="Search Parameters"
        description="Results, time range, categories, and context limits."
        keywords={["results", "time", "category", "safe", "tokens"]}
      >
        <div className="space-y-4">
          {/* Max results */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-white">Results per search</div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  How many websites to fetch per search query (1–10).
                </div>
              </div>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                {webSearchMaxResults}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={webSearchMaxResults}
              onChange={(e) => setWebSearchMaxResults(parseInt(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Time range */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">Time range</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Limit search results to a specific time period.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "", label: "Any time" },
                { value: "day", label: "Past 24 hours" },
                { value: "week", label: "Past week" },
                { value: "month", label: "Past month" },
                { value: "year", label: "Past year" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWebSearchTimeRange(opt.value as "" | "day" | "week" | "month" | "year")}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    webSearchTimeRange === opt.value
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">Categories</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Filter by search category. Leave empty for general search.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "", label: "General" },
                { value: "news", label: "News" },
                { value: "science", label: "Science" },
                { value: "it", label: "IT" },
                { value: "images", label: "Images" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWebSearchCategories(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    webSearchCategories === opt.value
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Safe search */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">Safe search</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Filter explicit content from search results.
              </div>
            </div>
            <div className="flex gap-2">
              {[
                { value: 0, label: "Off" },
                { value: 1, label: "Moderate" },
                { value: 2, label: "Strict" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWebSearchSafeSearch(opt.value as 0 | 1 | 2)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    webSearchSafeSearch === opt.value
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Context token limit */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-white">Context token limit</div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  Max tokens from search results injected into the AI context.
                </div>
              </div>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                {webSearchContextTokenLimit}
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={8000}
              step={250}
              value={webSearchContextTokenLimit}
              onChange={(e) => setWebSearchContextTokenLimit(parseInt(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>500</span>
              <span>4000</span>
              <span>8000</span>
            </div>
          </div>
        </div>
      </CollapsibleSettingsSection>

      {/* ── Advanced Search Bundle ───────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:bundle"
        title="Advanced Search Bundle"
        description="Optional extractors for non-HTML sources (YouTube transcripts, PDF text, Office documents, EPUB, and direct API providers)."
        keywords={["youtube", "transcript", "pdf", "bundle", "advanced", "docx", "epub", "arxiv", "wikipedia"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <Toggle
            label="Enable Advanced Search Bundle"
            on={advancedSearchBundleEnabled}
            onChange={setAdvancedSearchBundleEnabled}
          />
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
            When on, search results from YouTube, PDF, Office documents, and
            EPUB files are extracted using dedicated handlers. Wayback Machine
            fallback recovers content from failed fetches. Direct API providers
            (ArXiv, Wikipedia) supplement SearXNG results.
          </p>
        </div>

        {advancedSearchBundleEnabled && (
          <>
            {/* Content Extractors */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
              <div className="mb-2 text-[12.5px] font-medium text-white">
                Content Extractors
              </div>
              <div className="space-y-2">
                <Toggle
                  label="YouTube transcripts"
                  on={true}
                  onChange={() => {}}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts captions/transcripts from YouTube videos (free public API, no key required).
                </p>
                <Toggle
                  label="PDF text extraction"
                  on={true}
                  onChange={() => {}}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts text from PDF documents using the pdf-extract crate.
                </p>
                <Toggle
                  label="DOCX documents"
                  on={bundleExtractDocx}
                  onChange={setBundleExtractDocx}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts text from Word documents (.docx).
                </p>
                <Toggle
                  label="PowerPoint presentations"
                  on={bundleExtractPptx}
                  onChange={setBundleExtractPptx}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts slide text from PowerPoint files (.pptx).
                </p>
                <Toggle
                  label="Excel spreadsheets"
                  on={bundleExtractXlsx}
                  onChange={setBundleExtractXlsx}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts cell data from Excel files (.xlsx).
                </p>
                <Toggle
                  label="EPUB books"
                  on={bundleExtractEpub}
                  onChange={setBundleExtractEpub}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Extracts text from EPUB e-books.
                </p>
              </div>
            </div>

            {/* Recovery */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
              <div className="mb-2 text-[12.5px] font-medium text-white">
                Recovery
              </div>
              <Toggle
                label="Wayback Machine fallback"
                on={bundleWaybackFallback}
                onChange={setBundleWaybackFallback}
              />
              <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                When a page fails to load (timeout, HTTP error, etc.),
                automatically try the Internet Archive's cached version.
              </p>
            </div>

            {/* Direct API Providers */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
              <div className="mb-2 text-[12.5px] font-medium text-white">
                Direct API Providers
              </div>
              <div className="space-y-2">
                <Toggle
                  label="ArXiv academic search"
                  on={bundleArxivSearch}
                  onChange={setBundleArxivSearch}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Include ArXiv results when enabled globally and for the active research depth
                  (Quick disables by default). Retrieves paper abstracts via the ArXiv API.
                </p>
                <Toggle
                  label="Wikipedia search"
                  on={bundleWikipediaSearch}
                  onChange={setBundleWikipediaSearch}
                />
                <p className="text-[10.5px] text-[var(--color-text-dim)]">
                  Include Wikipedia results when enabled globally and for the active research depth.
                  Extracts article content via the Wikipedia API.
                </p>
              </div>
            </div>

            {/* Capability Summary */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
              <div className="mb-2 text-[12.5px] font-medium text-white">
                Active Capabilities
              </div>
              <ul className="space-y-1 text-[11px] text-[var(--color-text-dim)]">
                <li>• YouTube videos → captions/transcripts</li>
                <li>• PDF documents → text extraction</li>
                {bundleExtractDocx && <li>• DOCX documents → text extraction</li>}
                {bundleExtractPptx && <li>• PowerPoint presentations → slide text</li>}
                {bundleExtractXlsx && <li>• Excel spreadsheets → cell data</li>}
                {bundleExtractEpub && <li>• EPUB books → text extraction</li>}
                {bundleWaybackFallback && <li>• Wayback Machine fallback for failed fetches</li>}
                {bundleArxivSearch && <li>• ArXiv direct API for academic papers</li>}
                {bundleWikipediaSearch && <li>• Wikipedia direct API for article content</li>}
              </ul>
            </div>
          </>
        )}
      </CollapsibleSettingsSection>

      {/* ── Content Extraction ────────────────────────────────────────────── */}
      <CollapsibleSettingsSection
        subsectionKey="webSearch:extraction"
        title="Content Extraction"
        description="Fetch full pages, timeouts, and local cache."
        keywords={["fetch", "readability", "cache", "timeout", "extract"]}
      >
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <Toggle
              label="Fetch and extract full page content"
              on={webSearchFetchEnabled}
              onChange={setWebSearchFetchEnabled}
            />
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
              When on, Veyra fetches each result page and extracts the readable
              article body using Mozilla Readability. Failures fall back to the
              search snippet and mark the source as unavailable.
            </p>
          </div>

          {webSearchFetchEnabled && (
            <>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[12.5px] font-medium text-white">
                      Pages to fetch per search
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)]">
                      Top N results to fetch. Higher values use more time and
                      context.
                    </div>
                  </div>
                  <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                    {webSearchFetchCount}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={webSearchFetchCount}
                  onChange={(e) => setWebSearchFetchCount(parseInt(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
                  <span>1</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[12.5px] font-medium text-white">
                      Per-page timeout (seconds)
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)]">
                      How long to wait for a page before giving up.
                    </div>
                  </div>
                  <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                    {webSearchPerPageTimeoutSecs}s
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={1}
                  value={webSearchPerPageTimeoutSecs}
                  onChange={(e) =>
                    setWebSearchPerPageTimeoutSecs(parseInt(e.target.value))
                  }
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
                  <span>2s</span>
                  <span>15s</span>
                  <span>30s</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[12.5px] font-medium text-white">
                      Characters per fetched page
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)]">
                      Max characters extracted from each page. Readability text
                      is denser than raw HTML, so even small values give the AI
                      a lot of context.
                    </div>
                  </div>
                  <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[12px] text-white">
                    {(webSearchFetchMaxCharsPerSource / 1000).toFixed(0)}K
                  </span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={50000}
                  step={1000}
                  value={webSearchFetchMaxCharsPerSource}
                  onChange={(e) =>
                    setWebSearchFetchMaxCharsPerSource(parseInt(e.target.value))
                  }
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="mt-1 flex justify-between text-[10px] text-[var(--color-text-dim)]">
                  <span>1K</span>
                  <span>25K</span>
                  <span>50K</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[12.5px] font-medium text-white">Cache</div>
                  <div className="font-mono text-[11.5px] text-[var(--color-text-dim)]">
                    {cacheStats
                      ? `${cacheStats.entries} ${cacheStats.entries === 1 ? "entry" : "entries"} · ${(cacheStats.total_bytes / (1024 * 1024)).toFixed(2)} MB`
                      : "—"}
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  Extracted pages are cached locally for 24 hours. The cache is
                  capped at 50 MB; oldest entries are pruned first.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearCache}
                    disabled={clearingCache || !cacheStats || cacheStats.entries === 0}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-3" />
                    {clearingCache ? "Clearing…" : "Clear cache"}
                  </button>
                  {clearError && (
                    <span className="text-[11px] text-red-400">{clearError}</span>
                  )}
                </div>
              </div>
            </>
          )}
      </CollapsibleSettingsSection>
    </div>
  );
}
