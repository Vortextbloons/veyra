import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { ArrowUpCircle, Loader2, RefreshCw, X } from "lucide-react";
import { formatReleaseDate } from "@/lib/app-update";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";

export function UpdateAvailableBanner() {
  const result = useUpdateStore((s) => s.result);
  const checking = useUpdateStore((s) => s.checking);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const dismissedUpdateVersion = useSettingsStore((s) => s.dismissedUpdateVersion);
  const dismissUpdateVersion = useSettingsStore((s) => s.dismissUpdateVersion);
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);

  const latest =
    result?.status === "update-available" ? result.latest : null;
  const visible =
    latest !== null && dismissedUpdateVersion !== latest.version;

  const handleDownload = useCallback(async () => {
    if (!latest) return;
    const target = latest.downloadUrl ?? latest.htmlUrl;
    await open(target);
  }, [latest]);

  const handleViewRelease = useCallback(async () => {
    if (!latest) return;
    await open(latest.htmlUrl);
  }, [latest]);

  const handleDismiss = useCallback(() => {
    if (!latest) return;
    dismissUpdateVersion(latest.version);
  }, [dismissUpdateVersion, latest]);

  const handleOpenSettings = useCallback(() => {
    setActiveNav("settings");
  }, [setActiveNav]);

  if (!visible || !latest) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-sky-500/20 bg-sky-500/[0.08] px-4 py-2.5"
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
        <ArrowUpCircle className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-white">
          Update available — Veyra {latest.version}
        </p>
        <p className="truncate text-[11px] text-[var(--color-text-dim)]">
          Released {formatReleaseDate(latest.publishedAt)}
          {latest.downloadAssetName ? ` · ${latest.downloadAssetName}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void handleDownload()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-sky-500/20 px-2.5 text-[11.5px] font-medium text-sky-100 transition-colors hover:bg-sky-500/30"
        >
          Download
        </button>
        <button
          type="button"
          onClick={() => void handleViewRelease()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          Release notes
        </button>
        <button
          type="button"
          onClick={handleOpenSettings}
          className="hidden h-7 rounded-md px-2 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.05] hover:text-white sm:inline-flex sm:items-center"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => void checkForUpdates({ skipIfOffline: false })}
          disabled={checking}
          aria-label="Check for updates again"
          className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss update notification"
          className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
