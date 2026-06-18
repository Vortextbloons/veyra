import { useMemo } from "react";
import type { ContextStats } from "@/modules/chat/chat-types";
import { getContextBreakdown, getContextStatsFromBreakdown } from "@/lib/context-breakdown";
import { buildContextPanelOptions } from "@/lib/context-panel-options";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { AgentSession } from "@/modules/agents/agent-types";

function getAgentContextStats(
  session: AgentSession,
  contextLimit: number,
  reservedOutputTokens: number,
): ContextStats {
  const estimatedTokens = Math.max(
    session.contextTokens ?? 0,
    0,
  );

  return {
    estimatedTokens,
    contextLimit,
    percentUsed: Math.round((estimatedTokens / contextLimit) * 100),
    includedMessages: session.events.length,
    droppedMessages: 0,
    reservedOutputTokens,
    includedLabel: "agent events",
    contextNote: session.contextTokens
      ? "Uses Pi-reported tokens when available."
      : "Includes Pi system and tool overhead.",
  };
}

interface UseChatContextPanelOptions {
  workspaceChatMode: "chat" | "research" | "agents";
  activeAgentSession?: AgentSession | null;
}

export function useChatContextPanel({
  workspaceChatMode,
  activeAgentSession,
}: UseChatContextPanelOptions) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  const defaultContextLength = useSettingsStore((state) => state.defaultContextLength);
  const defaultReservedOutputTokens = useSettingsStore((state) => state.defaultReservedOutputTokens);
  const modelOverrides = useSettingsStore((state) => state.modelOverrides);

  const models = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const selectedModelContextSettings = useMemo(() => {
    const override = modelOverrides[selectedModel];
    return {
      contextLength: override?.contextLength ?? defaultContextLength,
      reservedOutputTokens: override?.reservedOutputTokens ?? defaultReservedOutputTokens,
    };
  }, [defaultContextLength, defaultReservedOutputTokens, modelOverrides, selectedModel]);

  const resolvedContextLength = selectedModelContextSettings.contextLength;
  const resolvedReservedOutputTokens = selectedModelContextSettings.reservedOutputTokens;

  const selectedModelInfo = useMemo(
    () => models.find((model) => model.id === selectedModel),
    [models, selectedModel],
  );
  const selectedProviderInfo = useMemo(
    () => providers.find((p) => p.id === selectedProvider),
    [providers, selectedProvider],
  );

  const chatContextBreakdown = useMemo(() => {
    if (!activeConversation) return undefined;

    const breakdownOptions = buildContextPanelOptions({
      conversation: activeConversation,
      modelId: selectedModel,
      modelName: selectedModelInfo?.name,
      providerName: selectedProviderInfo?.name,
      reservedOutputTokens: resolvedReservedOutputTokens,
    });
    return getContextBreakdown(
      activeConversation.messages,
      breakdownOptions,
      resolvedContextLength,
    );
  }, [
    activeConversation,
    resolvedContextLength,
    resolvedReservedOutputTokens,
    selectedModel,
    selectedModelInfo?.name,
    selectedProviderInfo?.name,
  ]);

  const chatContextStats: ContextStats | undefined = useMemo(
    () => (chatContextBreakdown ? getContextStatsFromBreakdown(chatContextBreakdown) : undefined),
    [chatContextBreakdown],
  );

  const agentContextStats: ContextStats | undefined = useMemo(() => {
    if (!activeAgentSession) return undefined;
    return getAgentContextStats(
      activeAgentSession,
      resolvedContextLength,
      resolvedReservedOutputTokens,
    );
  }, [activeAgentSession, resolvedContextLength, resolvedReservedOutputTokens]);

  const displayContextStats = workspaceChatMode === "agents" ? agentContextStats : chatContextStats;
  const displayContextBreakdown = workspaceChatMode === "agents" ? undefined : chatContextBreakdown;

  const supportsImages = selectedModelInfo?.supportsImages ?? false;

  return {
    resolvedContextLength,
    resolvedReservedOutputTokens,
    selectedModelInfo,
    selectedProviderInfo,
    supportsImages,
    displayContextStats,
    displayContextBreakdown,
  };
}
