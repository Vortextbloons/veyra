import { useCallback } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import type { MessageAttachment } from "@/lib/message-attachments";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useProviderStore } from "@/stores/provider-store";
import { reasoningModelKey } from "@/modules/agents/agent-reasoning";
import { useSettingsStore } from "@/stores/settings-store";
import { filterAttachments } from "@/hooks/use-chat-attachments";

interface UseChatSendOptions {
  projectId?: string;
  selectedModel: string;
  selectedProvider: string;
  supportsImages: boolean;
  effectiveWebSearchEnabled: boolean;
  selectedModelContextSettings: { contextLength: number; reservedOutputTokens: number };
}

export function useChatSend({
  projectId, selectedModel, selectedProvider, supportsImages,
  effectiveWebSearchEnabled, selectedModelContextSettings,
}: UseChatSendOptions) {
  const setModelLoadProgress = useChatStore((state) => state.setModelLoadProgress);
  const handleSend = useCallback((text: string, attachments?: MessageAttachment[]) => {
    const trimmed = text.trim();
    const { effectiveAttachments, blocked } = filterAttachments(attachments, supportsImages, trimmed);
    if (blocked || (!trimmed && effectiveAttachments.length === 0) || !selectedModel) return;
    const state = useAgentStore.getState();
    if (state.runtimeAvailable !== true) return;
    const projectPath = state.projectPath.trim();
    const scheduler = aiScheduler.getSchedulerSnapshot();
    if ([scheduler.activeJob, ...scheduler.queuedJobs].some((job) => job?.type === "agent_pi" && job.conversationId === `agent:${projectPath}`)) return;
    if (state.sessions.some((session) => session.status === "running" && session.projectPath.trim() === projectPath)) return;
    const continueSessionId = state.activeSessionId;
    const providerBaseUrl = useProviderStore.getState().cloudProviders.find((provider) => provider.id === selectedProvider)?.baseUrl;
    const settings = useSettingsStore.getState();
    const systemPrompt = settings.getModelSettings(selectedModel).systemPrompt.trim();
    const replaceSystemPrompt = settings.systemPromptReplacesDefault;
    const reasoningLevel = settings.reasoningLevelByModel[reasoningModelKey(selectedProvider, selectedModel, providerBaseUrl)] ?? settings.reasoningLevel;
    const prompt = [trimmed, ...effectiveAttachments.filter((attachment) => attachment.fileType === "text").map((attachment) => `Attached file: ${attachment.name}\n${attachment.textContent ?? ""}`)].filter(Boolean).join("\n\n");
    aiScheduler.abortActiveBackgroundJob();
    aiScheduler.enqueueAiJob({
      type: "agent_pi", conversationId: `agent:${projectPath}`, priority: 0,
      title: "Responding in Chat", description: trimmed.slice(0, 80) || "Reading attachments",
      prompt, model: selectedModel,
      run: async (signal) => {
        const onAbort = () => {
          for (const session of useAgentStore.getState().sessions) {
            if (session.status === "running" && session.projectPath.trim() === projectPath) useAgentStore.getState().stopSession(session.id);
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          if (signal.aborted) throw new DOMException("Chat cancelled", "AbortError");
          if (selectedProvider === "lm-studio") {
            const { prepareAgentLmStudioModel } = await import("@/lib/lm-model-session");
            await prepareAgentLmStudioModel(selectedModel, selectedModelContextSettings.contextLength, signal, (phase: string, percent?: number) => {
              setModelLoadProgress(phase === "ready" ? null : { phase: phase as "unloading" | "loading", percent });
            });
          }
          if (signal.aborted) throw new DOMException("Chat cancelled", "AbortError");
          const id = await useAgentStore.getState().startSession({
            continueSessionId, projectId: projectId ?? null, projectPath,
            displayPrompt: trimmed || (effectiveAttachments.some((attachment) => attachment.fileType === "image") ? "Describe the attached image." : "Read the attached file."),
            prompt: prompt || "Describe the attached image.", model: selectedModel,
            contextLength: selectedModelContextSettings.contextLength,
            reservedOutputTokens: selectedModelContextSettings.reservedOutputTokens,
            providerId: selectedProvider, providerBaseUrl, reasoningLevel,
            images: effectiveAttachments.filter((attachment) => attachment.fileType === "image").map((attachment) => ({ data: attachment.dataUrl.split(",")[1], mimeType: attachment.mimeType })),
            attachments: effectiveAttachments, webSearchEnabled: effectiveWebSearchEnabled,
            systemPrompt: systemPrompt || undefined,
            replaceSystemPrompt,
          });
          return { prompt, output: useAgentStore.getState().sessions.find((session) => session.id === id)?.summary };
        } finally {
          signal.removeEventListener("abort", onAbort);
          setModelLoadProgress(null);
        }
      },
    });
  }, [projectId, selectedModel, selectedProvider, supportsImages, effectiveWebSearchEnabled, selectedModelContextSettings.contextLength, selectedModelContextSettings.reservedOutputTokens, setModelLoadProgress]);
  return { handleSend };
}
