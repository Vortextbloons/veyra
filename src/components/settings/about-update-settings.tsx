import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  formatReleaseDate,
  GITHUB_RELEASES_PAGE,
} from "@/lib/app-update";
import { Toggle } from "@/components/toggle";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";

function formatCheckedAt(timestamp: number | null): string {
  if (!timestamp) return "Not checked yet";
  return new Date(timestamp).toLocaleString();
}

export function AboutUpdateSettings() {
  const autoCheckUpdatesEnabled = useSettingsStore((s) => s.autoCheckUpdatesEnabled);
  const setAutoCheckUpdatesEnabled = useSettingsStore((s) => s.setAutoCheckUpdatesEnabled);
  const clearDismissedUpdateVersion = useSettingsStore((s) => s.clearDismissedUpdateVersion);

  const checking = useUpdateStore((s) => s.checking);
  const currentVersion = useUpdateStore((s) => s.currentVersion);
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt);
  const result = useUpdateStore((s) => s.result);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);

  const handleCheck = useCallback(async () => {
    clearDismissedUpdateVersion();
    await checkForUpdates({ skipIfOffline: false });
  }, [checkForUpdates, clearDismissedUpdateVersion]);

  const handleOpenReleases = useCallback(async () => {
    await open(GITHUB_RELEASES_PAGE);
  }, []);

  const handleDownload = useCallback(async () => {
    if (result?.status !== "update-available" && result?.status !== "up-to-date") {
      await handleOpenReleases();
      return;
    }

    const latest = result.latest;
    await open(latest.downloadUrl ?? latest.htmlUrl);
  }, [handleOpenReleases, result]);

  const statusLabel =
    result?.status === "update-available"
      ? `Update available (${result.latest.version})`
      : result?.status === "up-to-date"
        ? "You're on the latest version"
        : result?.status === "skipped" && result.reason === "offline"
          ? "Offline — connect to check for updates"
          : result?.status === "error"
            ? result.message
            : "Check GitHub releases for new builds";

  const statusTone =
    result?.status === "update-available"
      ? "text-sky-300"
      : result?.status === "up-to-date"
        ? "text-emerald-300"
        : result?.status === "error"
          ? "text-rose-300"
          : "text-[var(--color-text-dim)]";

  return (
    <section>
      <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        About &amp; Updates
      </h2>

      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white">Veyra</div>
              <div className="mt-1 font-mono text-[12px] text-[var(--color-text-dim)]">
                Version {currentVersion ?? "…"}
              </div>
              <p className={`mt-2 text-[12px] ${statusTone}`}>{statusLabel}</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                Last checked: {formatCheckedAt(lastCheckedAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCheck()}
                disabled={checking}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white/[0.03] px-3 text-[12px] text-white transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Check for updates
              </button>
              {result?.status === "update-available" && (
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-sky-500/20 px-3 text-[12px] font-medium text-sky-100 transition-colors hover:bg-sky-500/30"
                >
                  <Download className="size-3.5" />
                  Download {result.latest.version}
                </button>
              )}
            </div>
          </div>

          {result?.status === "update-available" && (
            <div className="mt-4 rounded-md border border-sky-500/20 bg-sky-500/[0.06] px-3 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-sky-100">
                <ArrowUpCircle className="size-3.5" />
                {result.latest.name || `Veyra ${result.latest.version}`}
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                Published {formatReleaseDate(result.latest.publishedAt)}
                {result.latest.downloadAssetName
                  ? ` · ${result.latest.downloadAssetName}`
                  : ""}
              </p>
              {result.latest.releaseNotes && (
                <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
                  {result.latest.releaseNotes}
                </pre>
              )}
            </div>
          )}

          {result?.status === "up-to-date" && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[12px] text-emerald-100">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Veyra {result.currentVersion} matches the latest GitHub release.
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            label="Check for updates automatically"
            on={autoCheckUpdatesEnabled}
            onChange={setAutoCheckUpdatesEnabled}
          />
        </div>
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Veyra checks GitHub releases on startup when online. Updates download from the official
          release page — install the new build to upgrade.
        </p>

        <button
          type="button"
          onClick={() => void handleOpenReleases()}
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:text-white"
        >
          <ExternalLink className="size-3.5" />
          View all releases on GitHub
        </button>
      </div>
    </section>
  );
}
