import type { ProviderToolDefinition } from "@/lib/providers/types";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { buildProviderTools } from "@/lib/tool-registry";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";
import { useConnectivityStore } from "@/stores/connectivity-store";

export type ResolvedModelSettings = {
  contextLength: number;
  maxTokens: number;
  topP: number;
  repetitionPenalty: number;
  stopSequences: string[];
  reservedOutputTokens: number;
  userPrompt: string | undefined;
  temperature: number;
  reasoningEnabled: boolean;
};

export type ProviderTooling = {
  providerTools: ProviderToolDefinition[];
  webSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
  codeExecutionEnabled: boolean;
};

export function resolveModelSettings(
  modelId: string,
  overrides: {
    contextLength?: number;
    maxTokens?: number;
    topP?: number;
    repetitionPenalty?: number;
    stopSequences?: string[];
  },
): ResolvedModelSettings {
  const settings = useSettingsStore.getState();
  const modelSettings = settings.getModelSettings(modelId);
  return {
    contextLength: overrides.contextLength ?? modelSettings.contextLength,
    maxTokens: overrides.maxTokens ?? modelSettings.maxTokens,
    topP: overrides.topP ?? modelSettings.topP,
    repetitionPenalty: overrides.repetitionPenalty ?? modelSettings.repetitionPenalty,
    stopSequences: overrides.stopSequences ?? modelSettings.stopSequences,
    reservedOutputTokens: modelSettings.reservedOutputTokens,
    userPrompt: modelSettings.systemPrompt || undefined,
    temperature: modelSettings.temperature,
    reasoningEnabled: settings.reasoningEnabled,
  };
}

export function resolveProviderTooling({
  webSearchEnabled,
  codeExecutionEnabled,
  enhancedMode,
}: {
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode: boolean;
}): ProviderTooling {
  const settings = useSettingsStore.getState();
  const effectiveConnectivity = useConnectivityStore.getState().effectiveConnectivity;
  const localServiceReady = useProviderStore.getState().providers.some(
    (provider) =>
      provider.id === useProviderStore.getState().selectedProvider &&
      provider.status === "connected",
  );

  const webSearchAvailability = isFeatureAvailable(
    "webSearch",
    effectiveConnectivity,
    localServiceReady,
  );
  const effectiveWebSearchEnabled = webSearchEnabled && webSearchAvailability.available;

  const codeExecutionAvailability = isFeatureAvailable(
    "codeExecution",
    effectiveConnectivity,
    localServiceReady,
  );
  const effectiveCodeExecutionEnabled =
    codeExecutionEnabled && codeExecutionAvailability.available;

  const activeDocument = useDocumentStore.getState().documents.find(
    (doc) => doc.id === useDocumentStore.getState().activeDocumentId,
  );

  const providerTools = buildProviderTools({
    webSearchEnabled: effectiveWebSearchEnabled,
    documentToolsEnabled: settings.documentPanelEnabled,
    codeExecutionEnabled: effectiveCodeExecutionEnabled,
    activeDocumentId: activeDocument?.id,
    enhancedMode,
  });

  return {
    providerTools,
    webSearchEnabled: effectiveWebSearchEnabled,
    webSearchAvailability,
    codeExecutionEnabled: effectiveCodeExecutionEnabled,
  };
}
