import { create } from "zustand";
import {
  checkForAppUpdate,
  getCurrentAppVersion,
  installAppUpdate,
  type AppReleaseInfo,
  type UpdateCheckResult,
} from "@/lib/app-update";

type UpdateStore = {
  checking: boolean;
  installing: boolean;
  downloadProgress: number | null;
  installError: string | null;
  currentVersion: string | null;
  lastCheckedAt: number | null;
  result: UpdateCheckResult | null;
  hydrateCurrentVersion: () => Promise<void>;
  checkForUpdates: (options?: { skipIfOffline?: boolean }) => Promise<UpdateCheckResult>;
  installUpdate: (release: AppReleaseInfo) => Promise<void>;
  clearResult: () => void;
};

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  checking: false,
  installing: false,
  downloadProgress: null,
  installError: null,
  currentVersion: null,
  lastCheckedAt: null,
  result: null,

  hydrateCurrentVersion: async () => {
    const currentVersion = await getCurrentAppVersion();
    set({ currentVersion });
  },

  checkForUpdates: async (options) => {
    if (get().checking) {
      return get().result ?? { status: "skipped", reason: "already-checking" };
    }

    set({ checking: true });
    try {
      const result = await checkForAppUpdate(options);
      const currentVersion =
        result.status === "up-to-date" || result.status === "update-available"
          ? result.currentVersion
          : await getCurrentAppVersion();

      set({
        checking: false,
        currentVersion,
        lastCheckedAt: Date.now(),
        result,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: UpdateCheckResult = { status: "error", message };
      set({
        checking: false,
        lastCheckedAt: Date.now(),
        result,
      });
      return result;
    }
  },

  installUpdate: async (release) => {
    if (get().installing) return;

    set({ installing: true, downloadProgress: 0, installError: null });
    try {
      await installAppUpdate(release, ({ downloadedBytes, totalBytes }) => {
        const downloadProgress =
          totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : null;
        set({ downloadProgress });
      });
    } catch (error) {
      const installError = error instanceof Error ? error.message : String(error);
      set({ installing: false, downloadProgress: null, installError });
      throw error;
    }
  },

  clearResult: () => set({ result: null }),
}));
