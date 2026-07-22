import { lmStudioAdapter } from "@/lib/providers/lm-studio-adapter";
import { createOpenAiCompatibleAdapter } from "@/lib/providers/openai-compatible-adapter";
import { defaultCloudProviders, type CloudProviderConfig } from "@/lib/providers/cloud-config";
import type { ProviderAdapter, ProviderPrepareModelOptions } from "@/lib/providers/types";

let cloudProviders: CloudProviderConfig[] = defaultCloudProviders();

export function configureCloudProviderAdapters(configs: CloudProviderConfig[]): void {
  cloudProviders = configs;
}

function providerAdapters(): ProviderAdapter[] {
  return [lmStudioAdapter, ...cloudProviders.map(createOpenAiCompatibleAdapter)];
}

export function getProviderAdapter(providerId: string): ProviderAdapter | undefined {
  return providerAdapters().find((provider) => provider.id === providerId);
}

export function getInitialProviders() {
  return providerAdapters().filter((provider) =>
    provider.id === "lm-studio" || cloudProviders.some((config) => config.id === provider.id && config.hasCredential),
  ).map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: "disconnected" as const,
  }));
}

export function providerSupportsStartServer(providerId: string): boolean {
  return Boolean(getProviderAdapter(providerId)?.startServer);
}

export async function unloadAllProviderModels(providerId: string): Promise<void> {
  const adapter = getProviderAdapter(providerId);
  if (adapter?.unloadAllModels) {
    await adapter.unloadAllModels();
  }
}

export async function prepareProviderModel(
  providerId: string,
  modelId: string,
  options?: ProviderPrepareModelOptions,
): Promise<void> {
  const adapter = getProviderAdapter(providerId);
  if (adapter?.prepareModel) {
    await adapter.prepareModel(modelId, options);
  }
}
