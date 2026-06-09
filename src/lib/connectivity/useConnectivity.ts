import { useMemo } from "react";
import {
  getConnectivityDescription,
  getConnectivityLabel,
} from "@/lib/connectivity/connectivity-service";
import {
  type FeatureKey,
  isFeatureAvailable,
  listFeatureAvailability,
} from "@/lib/connectivity/feature-capabilities";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";

export function useConnectivity() {
  const preference = useSettingsStore((s) => s.connectivityPreference);
  const systemOnline = useConnectivityStore((s) => s.systemOnline);
  const effectiveConnectivity = useConnectivityStore((s) => s.effectiveConnectivity);
  const probing = useConnectivityStore((s) => s.probing);
  const lastProbeAt = useConnectivityStore((s) => s.lastProbeAt);
  const refreshProbe = useConnectivityStore((s) => s.refreshProbe);

  const providerStatus = useProviderStore((s) => {
    const provider = s.providers.find((p) => p.id === s.selectedProvider);
    return provider?.status === "connected";
  });

  const label = useMemo(
    () => getConnectivityLabel(preference, effectiveConnectivity, systemOnline),
    [preference, effectiveConnectivity, systemOnline],
  );

  const description = useMemo(
    () => getConnectivityDescription(preference, effectiveConnectivity),
    [preference, effectiveConnectivity],
  );

  const featureMatrix = useMemo(
    () => listFeatureAvailability(effectiveConnectivity, providerStatus),
    [effectiveConnectivity, providerStatus],
  );

  return {
    preference,
    systemOnline,
    effectiveConnectivity,
    probing,
    lastProbeAt,
    label,
    description,
    featureMatrix,
    localServiceReady: providerStatus,
    refreshProbe,
    isOnline: effectiveConnectivity === "online",
  };
}

export function useIsFeatureAvailable(feature: FeatureKey) {
  const effectiveConnectivity = useConnectivityStore((s) => s.effectiveConnectivity);
  const localServiceReady = useProviderStore((s) => {
    const provider = s.providers.find((p) => p.id === s.selectedProvider);
    return provider?.status === "connected";
  });

  return useMemo(
    () => isFeatureAvailable(feature, effectiveConnectivity, localServiceReady),
    [feature, effectiveConnectivity, localServiceReady],
  );
}
