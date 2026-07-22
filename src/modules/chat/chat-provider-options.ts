import type { ProviderToolDefinition } from "@/lib/providers/types";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { buildProviderTools } from "@/lib/tool-registry";
import { STUDIO_RENDER_TOOL_NAME } from "@/modules/chat/studio/studio-tool";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { disabledMcpServersForChat, useExtensionsStore } from "@/modules/extensions/extensions-store";
import { buildMcpProviderTools } from "@/modules/extensions/mcp-tool-adapter";

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
  studioToolAvailable: boolean;
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

export function resolveStudioToolAvailability({
  experience,
  presentationMode,
  conversationId,
  projectId,
  characterId,
  groupId,
}: {
  experience?: "standard" | "studio";
  /** @deprecated Prefer `experience`. */
  presentationMode?: "standard" | "studio";
  conversationId?: string | null;
  projectId?: string;
  characterId?: string;
  groupId?: string;
}): boolean {
  const settings = useSettingsStore.getState();
  const resolved =
    experience === "studio" || experience === "standard"
      ? experience
      : presentationMode === "studio"
        ? "studio"
        : "standard";
  if (!settings.studioModeEnabled || resolved !== "studio") return true;
  if (characterId || groupId) return false;
  return resolveProviderTooling({
    webSearchEnabled: false,
    codeExecutionEnabled: false,
    enhancedMode: settings.enhancedModeEnabled,
    projectId,
    conversationId: conversationId ?? undefined,
    studioEnabled: true,
  }).studioToolAvailable;
}

export function resolveProviderTooling({
  webSearchEnabled,
  codeExecutionEnabled,
  enhancedMode,
  projectId,
  conversationId,
  studioEnabled = false,
}: {
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode: boolean;
  projectId?: string;
  conversationId?: string;
  studioEnabled?: boolean;
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

  const docState = useDocumentStore.getState();

  const extensions = useExtensionsStore.getState();
  const providerTools = [...buildProviderTools({
    webSearchEnabled: effectiveWebSearchEnabled,
    documentToolsEnabled: settings.documentPanelEnabled,
    codeExecutionEnabled: effectiveCodeExecutionEnabled,
    activeDocumentId: docState.activeDocumentId ?? undefined,
    enhancedMode,
    studioEnabled,
  }), ...buildMcpProviderTools(extensions.mcpServers, projectId, extensions.featureFlags, disabledMcpServersForChat(extensions.mcpServers, conversationId ? extensions.chatDisabledMcpServerIds[conversationId] : undefined), conversationId ? extensions.chatEnabledMcpServerIds[conversationId] ?? [] : [])];

  return {
    providerTools,
    webSearchEnabled: effectiveWebSearchEnabled,
    webSearchAvailability,
    codeExecutionEnabled: effectiveCodeExecutionEnabled,
    studioToolAvailable: providerTools.some((tool) => tool.function.name === STUDIO_RENDER_TOOL_NAME),
  };
}
