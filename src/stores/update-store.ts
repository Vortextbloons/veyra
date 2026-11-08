import { create } from "zustand";
import {
  checkForAppUpdate,
  getCurrentAppVersion,
  installAppUpdate,
  prepareAppUpdate,
  type AppReleaseInfo,
  type UpdateCheckResult,
} from "@/lib/app-update";

type UpdateStore = {
  downloading: boolean;
  preparedRelease: AppReleaseInfo | null;
  downloadUpdate: (release: AppReleaseInfo) => Promise<void>;

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
};

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  downloading: false,
  preparedRelease: null,
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

  downloadUpdate: async (release) => {
    if (get().downloading || get().installing) return;
    set({ downloading: true, downloadProgress: 0, installError: null });
    try {
      await prepareAppUpdate(release, ({ downloadedBytes, totalBytes }) => {
        const progress = totalBytes && totalBytes > 0
          ? Math.min(100, Math.round(downloadedBytes / totalBytes * 100)) : null;
        if (get().downloadProgress !== progress) set({ downloadProgress: progress });
      });
      set({ downloading: false, preparedRelease: release, downloadProgress: 100 });
    } catch (error) {
      set({ downloading: false, installError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  installUpdate: async (release) => {
    if (get().installing || get().downloading) return;
    if (get().preparedRelease?.version !== release.version) {
      await get().downloadUpdate(release);
      return;
    }
    set({ installing: true, installError: null });
    try {
      // Stop streaming before capturing the final conversation snapshot.
      const { aiScheduler } = await import("@/lib/ai-scheduler");
      await aiScheduler.shutdown();
      const { flushPiConversations } = await import("@/modules/agents/pi-conversation-storage");
      const { useChatStore } = await import("@/stores/chat-store");
      const { saveConversationSnapshot, flushConversationSave } = await import("@/lib/conversation-storage");
      flushPiConversations();
      await saveConversationSnapshot(useChatStore.getState().conversations);
      await flushConversationSave();
      await installAppUpdate();
    } catch (error) {
      set({ installing: false, installError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
}));
