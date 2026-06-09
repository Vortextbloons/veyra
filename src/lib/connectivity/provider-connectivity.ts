import { getProviderAdapter } from "@/lib/providers";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useProviderStore } from "@/stores/provider-store";

const LOCAL_FALLBACK_PROVIDER = "lm-studio";

export function ensureLocalProviderWhenOffline(): void {
  if (useConnectivityStore.getState().effectiveConnectivity !== "offline") return;

  const { selectedProvider } = useProviderStore.getState();
  const adapter = getProviderAdapter(selectedProvider);
  if (adapter?.connectivityRequirement === "internet") {
    void useProviderStore.getState().selectProvider(LOCAL_FALLBACK_PROVIDER);
  }
}

export function isProviderAllowedForConnectivity(providerId: string): boolean {
  const adapter = getProviderAdapter(providerId);
  if (!adapter) return false;
  if (adapter.connectivityRequirement === "local") return true;
  return useConnectivityStore.getState().effectiveConnectivity === "online";
}
