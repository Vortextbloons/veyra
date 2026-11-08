import { useEffect } from "react";
import { deferUntilIdle } from "@/lib/startup";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { ensureSettingsHydrated, useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";

import { UPDATE_CONFIG } from "@/lib/update-config";

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
        const result = await checkForUpdates({ skipIfOffline: true });
        if (!cancelled && useSettingsStore.getState().autoCheckUpdatesEnabled && UPDATE_CONFIG.downloadAfterAutomaticCheck && result.status === "update-available" && result.latest.sha256) {
          await useUpdateStore.getState().downloadUpdate(result.latest).catch(() => undefined);
        }
      })();
    }, UPDATE_CONFIG.startupDelayMs);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [autoCheckUpdatesEnabled, checkForUpdates, effectiveConnectivity]);
}
