import { useEffect } from "react";
import { deferUntilIdle } from "@/lib/startup";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";

const STARTUP_DELAY_MS = 8_000;

export function useAppUpdateCheck() {
  const effectiveConnectivity = useConnectivityStore((s) => s.effectiveConnectivity);
  const autoCheckUpdatesEnabled = useSettingsStore((s) => s.autoCheckUpdatesEnabled);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const hydrateCurrentVersion = useUpdateStore((s) => s.hydrateCurrentVersion);

  useEffect(() => {
    void hydrateCurrentVersion();
  }, [hydrateCurrentVersion]);

  useEffect(() => {
    if (!autoCheckUpdatesEnabled || effectiveConnectivity !== "online") {
      return;
    }

    let cancelled = false;

    const cancelIdle = deferUntilIdle(() => {
      void (async () => {
        await ensureSettingsHydrated();
        if (cancelled || !useSettingsStore.getState().autoCheckUpdatesEnabled) {
          return;
        }
        await checkForUpdates({ skipIfOffline: true });
      })();
    }, STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [autoCheckUpdatesEnabled, checkForUpdates, effectiveConnectivity]);
}
