import { lmStudioAdapter } from "@/lib/providers/lm-studio-adapter";
import type { ProviderAdapter } from "@/lib/providers/types";

const providerAdapters = [lmStudioAdapter] satisfies ProviderAdapter[];

export function getProviderAdapters(): ProviderAdapter[] {
  return providerAdapters;
}

export function getProviderAdapter(providerId: string): ProviderAdapter | undefined {
  return providerAdapters.find((provider) => provider.id === providerId);
}

export function getInitialProviders() {
  return providerAdapters.map((provider) => ({
    id: provider.id,
    name: provider.name,
    icon: provider.icon,
    status: "disconnected" as const,
  }));
}

export function providerSupportsStartServer(providerId: string): boolean {
  return Boolean(getProviderAdapter(providerId)?.startServer);
}
