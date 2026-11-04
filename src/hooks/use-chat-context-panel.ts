import { useMemo } from "react";
import type { ContextStats } from "@/modules/chat/chat-types";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { AgentSession } from "@/modules/agents/agent-types";

export function useChatContextPanel({ activeAgentSession }: { activeAgentSession?: AgentSession | null }) {
  const defaultContextLength = useSettingsStore((state) => state.defaultContextLength);
  const defaultReservedOutputTokens = useSettingsStore((state) => state.defaultReservedOutputTokens);
  const modelOverrides = useSettingsStore((state) => state.modelOverrides);
  const models = useProviderStore((state) => state.models);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const resolvedContextLength = modelOverrides[selectedModel]?.contextLength ?? defaultContextLength;
  const resolvedReservedOutputTokens = modelOverrides[selectedModel]?.reservedOutputTokens ?? defaultReservedOutputTokens;
  const displayContextStats: ContextStats | undefined = useMemo(() => {
    if (!activeAgentSession) return undefined;
    const estimatedTokens = Math.max(activeAgentSession.contextTokens ?? 0, 0);
    return {
      estimatedTokens, contextLimit: resolvedContextLength,
      percentUsed: resolvedContextLength > 0 ? Math.round(estimatedTokens / resolvedContextLength * 100) : 0,
      includedMessages: activeAgentSession.events.length, droppedMessages: 0,
      reservedOutputTokens: resolvedReservedOutputTokens, includedLabel: "conversation events",
      contextNote: activeAgentSession.contextTokens ? "Uses Pi-reported tokens." : "Pi token usage appears after the first response.",
    };
  }, [activeAgentSession, resolvedContextLength, resolvedReservedOutputTokens]);
  return { resolvedContextLength, resolvedReservedOutputTokens, displayContextStats, supportsImages: models.find((model) => model.id === selectedModel)?.supportsImages ?? false };
}
