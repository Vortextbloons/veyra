import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { resolveEffectiveConnectivity } from "@/lib/connectivity/connectivity-service";
import type {
  EffectiveConnectivity,
  SystemOnlineStatus,
} from "@/lib/connectivity/connectivity-types";
import { ensureLocalProviderWhenOffline } from "@/lib/connectivity/provider-connectivity";
import { useSettingsStore } from "@/stores/settings-store";

const PROBE_INTERVAL_MS = 45_000;
const STARTUP_RETRY_MS = [2_000, 8_000] as const;
const DEBOUNCE_FAILURES = 2;

function navigatorReportsOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function shouldMarkOfflineAfterFailure(
  consecutiveFailures: number,
  systemOnline: SystemOnlineStatus,
): boolean {
  if (consecutiveFailures >= DEBOUNCE_FAILURES) return true;
  // Privacy-safe default when we have no signal at all.
  if (systemOnline === "unknown" && !navigatorReportsOnline()) return true;
  return false;
}

type ConnectivityStore = {
  systemOnline: SystemOnlineStatus;
  probing: boolean;
  lastProbeAt: number | null;
  consecutiveFailures: number;
  effectiveConnectivity: EffectiveConnectivity;
  previousEffectiveConnectivity: EffectiveConnectivity | null;
  probeListenerStarted: boolean;
  setSystemOnline: (status: SystemOnlineStatus) => void;
  recomputeEffective: () => void;
  refreshProbe: () => Promise<void>;
  startProbeListener: () => () => void;
  consumeConnectivityTransition: () => EffectiveConnectivity | null;
};

function readPreference() {
  return useSettingsStore.getState().connectivityPreference;
}

function computeEffective(systemOnline: SystemOnlineStatus): EffectiveConnectivity {
  return resolveEffectiveConnectivity(readPreference(), systemOnline);
}

export const useConnectivityStore = create<ConnectivityStore>((set, get) => ({
  systemOnline: "unknown",
  probing: false,
  lastProbeAt: null,
  consecutiveFailures: 0,
  effectiveConnectivity: "offline",
  previousEffectiveConnectivity: null,
  probeListenerStarted: false,

  setSystemOnline: (status) => {
    const prev = get().effectiveConnectivity;
    const next = computeEffective(status);
    set({
      systemOnline: status,
      effectiveConnectivity: next,
      previousEffectiveConnectivity: prev !== next ? prev : get().previousEffectiveConnectivity,
    });
    ensureLocalProviderWhenOffline();
  },

  recomputeEffective: () => {
    const prev = get().effectiveConnectivity;
    const next = computeEffective(get().systemOnline);
    set({
      effectiveConnectivity: next,
      previousEffectiveConnectivity: prev !== next ? prev : get().previousEffectiveConnectivity,
    });
    ensureLocalProviderWhenOffline();
  },

  refreshProbe: async () => {
    if (get().probing) return;
    set({ probing: true });

    try {
      const online = await invoke<boolean>("probe_internet_connectivity");
      const { consecutiveFailures } = get();

      if (online) {
        get().setSystemOnline(true);
        set({ consecutiveFailures: 0, lastProbeAt: Date.now() });
        return;
      }

      const failures = consecutiveFailures + 1;
      if (shouldMarkOfflineAfterFailure(failures, get().systemOnline)) {
        get().setSystemOnline(false);
      }
      set({ consecutiveFailures: failures, lastProbeAt: Date.now() });
    } catch {
      const failures = get().consecutiveFailures + 1;
      if (shouldMarkOfflineAfterFailure(failures, get().systemOnline)) {
        get().setSystemOnline(false);
      }
      set({ consecutiveFailures: failures, lastProbeAt: Date.now() });
    } finally {
      set({ probing: false });
    }
  },

  startProbeListener: () => {
    if (get().probeListenerStarted) return () => undefined;
    set({ probeListenerStarted: true });

    const handleNavigatorOnline = () => {
      void get().refreshProbe();
    };

    const handleNavigatorOffline = () => {
      get().setSystemOnline(false);
      set({ consecutiveFailures: DEBOUNCE_FAILURES });
    };

    window.addEventListener("online", handleNavigatorOnline);
    window.addEventListener("offline", handleNavigatorOffline);

    if (!navigatorReportsOnline()) {
      get().setSystemOnline(false);
      set({ consecutiveFailures: DEBOUNCE_FAILURES });
    } else if (readPreference() === "auto") {
      // Optimistic hint while the Rust probe confirms reachability.
      get().setSystemOnline(true);
    }

    void get().refreshProbe();

    const startupRetryIds = STARTUP_RETRY_MS.map((delayMs) =>
      window.setTimeout(() => {
        void get().refreshProbe();
      }, delayMs),
    );

    const intervalId = window.setInterval(() => {
      void get().refreshProbe();
    }, PROBE_INTERVAL_MS);

    const unsubscribeSettings = useSettingsStore.subscribe(() => {
      get().recomputeEffective();
    });

    return () => {
      window.removeEventListener("online", handleNavigatorOnline);
      window.removeEventListener("offline", handleNavigatorOffline);
      window.clearInterval(intervalId);
      for (const id of startupRetryIds) window.clearTimeout(id);
      unsubscribeSettings();
      set({ probeListenerStarted: false });
    };
  },

  consumeConnectivityTransition: () => {
    const { previousEffectiveConnectivity, effectiveConnectivity } = get();
    if (
      previousEffectiveConnectivity !== null &&
      previousEffectiveConnectivity !== effectiveConnectivity
    ) {
      set({ previousEffectiveConnectivity: null });
      return effectiveConnectivity;
    }
    return null;
  },
}));

export function useEffectiveConnectivity(): EffectiveConnectivity {
  return useConnectivityStore((s) => s.effectiveConnectivity);
}
