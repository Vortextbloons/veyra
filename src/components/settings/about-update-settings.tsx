import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { ArrowUpCircle, CheckCircle2, Loader2 } from "lucide-react";
import { formatReleaseDate, GITHUB_RELEASES_PAGE } from "@/lib/app-update";
import { Toggle } from "@/components/toggle";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";
import {
  SettingRow,
  SettingsCard,
  SettingsPanel,
  SettingsRows,
  settingsButtonClass,
  settingsPrimaryButtonClass,
} from "./settings-ui";

function formatCheckedAt(timestamp: number | null): string {
  if (!timestamp) return "Not checked yet";
  return new Date(timestamp).toLocaleString();
}

export function AboutUpdateSettings() {
  const autoCheckUpdatesEnabled = useSettingsStore((s) => s.autoCheckUpdatesEnabled);
  const setAutoCheckUpdatesEnabled = useSettingsStore((s) => s.setAutoCheckUpdatesEnabled);
  const clearDismissedUpdateVersion = useSettingsStore((s) => s.clearDismissedUpdateVersion);

  const checking = useUpdateStore((s) => s.checking);
  const downloading = useUpdateStore((s) => s.downloading);
  const preparedRelease = useUpdateStore((s) => s.preparedRelease);
  const installing = useUpdateStore((s) => s.installing);
  const downloadProgress = useUpdateStore((s) => s.downloadProgress);
  const installError = useUpdateStore((s) => s.installError);
  const currentVersion = useUpdateStore((s) => s.currentVersion);
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt);
  const result = useUpdateStore((s) => s.result);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const installUpdate = useUpdateStore((s) => s.installUpdate);

  const handleCheck = useCallback(async () => {
    clearDismissedUpdateVersion();
    await checkForUpdates({ skipIfOffline: false });
  }, [checkForUpdates, clearDismissedUpdateVersion]);

  const handleOpenReleases = useCallback(async () => {
    await open(GITHUB_RELEASES_PAGE);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (result?.status !== "update-available") return;
    try {
      await installUpdate(result.latest);
    } catch {
      // The store exposes the actionable error below.
    }
  }, [installUpdate, result]);

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
    <SettingsPanel
      title="Updates"
      description="Veyra checks GitHub releases on startup when online."
      actions={
        <>
          <button
            type="button"
            onClick={() => void handleOpenReleases()}
            className={settingsButtonClass}
          >
            All releases
          </button>
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={checking}
            className={settingsButtonClass}
          >
            {checking && <Loader2 className="size-3.5 animate-spin" />}
            Check for updates
          </button>
        </>
      }
    >
      <SettingsCard>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-white">Veyra</div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--color-text-dim)]">
              Version {currentVersion ?? "…"}
            </div>
            <p className={`mt-2 text-[12.5px] ${statusTone}`}>{statusLabel}</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
              Last checked: {formatCheckedAt(lastCheckedAt)}
            </p>
          </div>
          {result?.status === "update-available" && (
            <button
              type="button"
              onClick={() => void handleUpdate()}
              disabled={installing || downloading || !result.latest.downloadUrl}
              className={settingsPrimaryButtonClass}
            >
              {(installing || downloading) && <Loader2 className="size-3.5 animate-spin" />}
              {installing ? "Restarting..." : downloading
                ? downloadProgress === null
                  ? "Downloading update"
                  : `Downloading ${downloadProgress}%`
                : preparedRelease?.version === result.latest.version ? "Restart to update" : `Download ${result.latest.version}`}
            </button>
          )}
        </div>

        {result?.status === "update-available" && (
          <div className="border-t border-[var(--color-border)] px-5 py-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-sky-100">
              <ArrowUpCircle className="size-4" />
              {result.latest.name || `Veyra ${result.latest.version}`}
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
              Published {formatReleaseDate(result.latest.publishedAt)}
              {result.latest.downloadAssetName ? ` · ${result.latest.downloadAssetName}` : ""}
            </p>
            {result.latest.releaseNotes && (
              <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
                {result.latest.releaseNotes}
              </pre>
            )}
            {installError && <p className="mt-3 text-[12.5px] text-rose-300">{installError}</p>}
          </div>
        )}

        {result?.status === "up-to-date" && (
          <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-5 py-3.5 text-[12.5px] text-emerald-200">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Veyra {result.currentVersion} matches the latest GitHub release.
          </div>
        )}

        <div className="border-t border-[var(--color-border)]">
          <SettingsRows>
            <SettingRow
              label="Check automatically"
              description="Checks and downloads updates in the background at startup. You choose when to restart."
            >
              <Toggle
                ariaLabel="Check for updates automatically"
                on={autoCheckUpdatesEnabled}
                onChange={setAutoCheckUpdatesEnabled}
              />
            </SettingRow>
          </SettingsRows>
        </div>
      </SettingsCard>
    </SettingsPanel>
  );
}
