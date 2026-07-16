import { create } from "zustand";
import {
  checkForAppUpdate,
  getCurrentAppVersion,
  type UpdateCheckResult,
} from "@/lib/app-update";

type UpdateStore = {
  checking: boolean;
  currentVersion: string | null;
  lastCheckedAt: number | null;
  result: UpdateCheckResult | null;
  hydrateCurrentVersion: () => Promise<void>;
  checkForUpdates: (options?: { skipIfOffline?: boolean }) => Promise<UpdateCheckResult>;
  clearResult: () => void;
};

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  checking: false,
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

  clearResult: () => set({ result: null }),
}));
