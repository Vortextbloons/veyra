import { useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useChatSend } from "@/hooks/use-chat-send";

export function useChatPipeline({ projectId, webSearchEnabled }: { projectId?: string; webSearchEnabled: boolean }) {
  const providers = useProviderStore((state) => state.providers);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const models = useProviderStore((state) => state.models);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const connectionPhase = useProviderStore((state) => state.connectionPhase);
  const connectionError = useProviderStore((state) => state.connectionError);
  const modelLoadProgress = useChatStore((state) => state.modelLoadProgress);
  const favoriteModels = useSettingsStore((state) => state.favoriteModels);
  const defaultContextLength = useSettingsStore((state) => state.defaultContextLength);
  const defaultReservedOutputTokens = useSettingsStore((state) => state.defaultReservedOutputTokens);
  const modelOverrides = useSettingsStore((state) => state.modelOverrides);
  const connectivity = useConnectivityStore((state) => state.effectiveConnectivity);
  const context = useMemo(() => ({
    contextLength: modelOverrides[selectedModel]?.contextLength ?? defaultContextLength,
    reservedOutputTokens: modelOverrides[selectedModel]?.reservedOutputTokens ?? defaultReservedOutputTokens,
  }), [selectedModel, modelOverrides, defaultContextLength, defaultReservedOutputTokens]);
  const supportsImages = models.find((model) => model.id === selectedModel)?.supportsImages ?? false;
  const { handleSend } = useChatSend({
    projectId, selectedModel, selectedProvider, supportsImages,
    effectiveWebSearchEnabled: webSearchEnabled && connectivity === "online",
    selectedModelContextSettings: context,
  });
  const handleNewChat = useCallback(() => useChatStore.getState().setActiveConversationId(null), []);
  const handleDeleteChat = useCallback((id: string) => useChatStore.getState().deleteConversation(id), []);
  return { providers, selectedProvider, models, selectedModel, connectionPhase, connectionError, modelLoadProgress, favoriteModels, handleSend, handleNewChat, handleDeleteChat };
}
