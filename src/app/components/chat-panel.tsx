import { useMemo, useState, useSyncExternalStore } from "react";
import type { ChatPanelProps } from "@/modules/chat/chat-types";
import { ProviderConnectionBanner } from "@/components/provider-connection-banner";
import { ProviderSelector } from "@/components/provider-selector";
import { ModelSelector, type Model } from "@/components/model-selector";
import { ModelLoadingBar } from "@/components/model-loading-bar";
import { AgentsPanel } from "@/modules/agents/components/agents-panel";
import { Composer } from "@/modules/chat/components/composer";
import { ContextMeterButton } from "@/modules/chat/components/context-meter";
import { aiScheduler } from "@/lib/ai-scheduler";
import { useAgentStore } from "@/modules/agents/agent-store";

export function ChatPanel({
  onSend, supportsImages = false, providers = [], selectedProvider = "", onProviderChange,
  providerConnectionPhase = "idle", providerConnectionError = null, onProviderReconnect,
  onProviderStartServer, models = [], selectedModel = "", onModelChange, favoriteModels = [],
  onToggleFavorite, contextStats, webSearchEnabled = false, onWebSearchChange,
  webSearchDisabled = false, webSearchDisabledReason, sidebarsCollapsed = 0, modelLoadProgress,
  agentSessions = [], activeAgentSessionId = null, agentRuntimeAvailable = null,
  agentProjectPath = "", onAgentProjectPathChange, onAgentRuntimeCheck, onAgentSessionStop,
}: ChatPanelProps) {
  const [suggestedPrompt, setSuggestedPrompt] = useState("");
  const scheduler = useSyncExternalStore((listener) => aiScheduler.subscribeToScheduler(listener), () => aiScheduler.getSchedulerSnapshot());
  const pendingJob = [scheduler.activeJob, ...scheduler.queuedJobs].find((job) => job?.type === "agent_pi" && job.conversationId === `agent:${agentProjectPath.trim()}`);
  const running = agentSessions.find((session) => session.projectPath === agentProjectPath && session.status === "running");
  const busy = Boolean(running || pendingJob);
  const currentProvider = providers.find((provider) => provider.id === selectedProvider);
  const selectorModels: Model[] = useMemo(() => {
    const favorites = new Set(favoriteModels);
    return models.map((model) => ({
      id: model.id, name: model.name, provider: currentProvider?.name ?? "LM Studio",
      contextWindow: model.contextWindow, size: model.size, isFavorite: favorites.has(model.id),
      supportsImages: model.supportsImages,
    }));
  }, [models, favoriteModels, currentProvider?.name]);
  const stop = () => {
    if (pendingJob) aiScheduler.cancelAiJob(pendingJob.id);
    if (running) onAgentSessionStop?.(running.id);
  };
  return <AgentsPanel
    sessions={agentSessions} activeSessionId={activeAgentSessionId}
    runtimeAvailable={agentRuntimeAvailable} projectPath={agentProjectPath}
    onProjectPathChange={(path) => onAgentProjectPathChange?.(path)}
    onCheckRuntime={() => onAgentRuntimeCheck?.()} onStopSession={(id) => onAgentSessionStop?.(id)}
    onSuggestion={setSuggestedPrompt}
    connection={<ProviderConnectionBanner provider={currentProvider ?? null} phase={providerConnectionPhase} error={providerConnectionError} onReconnect={() => onProviderReconnect?.()} onStartServer={() => onProviderStartServer?.()} />}
    composer={<div className={`mx-auto w-full max-w-[1100px] shrink-0 pb-3 pt-2 ${sidebarsCollapsed ? "px-3" : "px-4"}`}>
      {modelLoadProgress && modelLoadProgress.phase !== "ready" && <div className="px-1 pb-2"><ModelLoadingBar progress={modelLoadProgress} /></div>}
      <Composer key={activeAgentSessionId ?? "new"}
        suggestedPrompt={suggestedPrompt} onSend={onSend} onStop={stop}
        busy={busy} disabled={agentRuntimeAvailable !== true || !selectedModel || (busy && !running)} controlsDisabled={busy}
        onSteer={running ? (text) => useAgentStore.getState().steerSession(running.id, text) : undefined}
        supportsImages={supportsImages} composerTextClass={sidebarsCollapsed ? "text-[14.5px]" : "text-[14px]"}
        webSearchEnabled={webSearchEnabled} onWebSearchChange={onWebSearchChange}
        webSearchDisabled={webSearchDisabled} webSearchDisabledReason={webSearchDisabledReason}
        contextIndicator={contextStats ? <ContextMeterButton stats={contextStats} /> : undefined}
        selectorControls={<>
          <ProviderSelector value={selectedProvider} providers={providers} onChange={onProviderChange} connectionPhase={providerConnectionPhase} onReconnect={(id) => onProviderReconnect?.(id)} onStartServer={(id) => onProviderStartServer?.(id)} />
          <ModelSelector value={selectedModel} models={selectorModels} onChange={onModelChange} onToggleFavorite={onToggleFavorite} />
        </>}
      />
      <p className="mt-2 text-center text-[11px] text-[var(--color-muted)]">{agentProjectPath ? "Can edit project files and run commands" : "Ask anything · Attach a project when you need file access"}</p>
    </div>}
  />;
}
