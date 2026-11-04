import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { aiScheduler } from "@/lib/ai-scheduler";
import { ArrowUp, Square, Brain, RefreshCw } from "lucide-react";
import type { AgentMode } from "../agent-types";
import { useAgentStore } from "../agent-store";
import { useProviderStore } from "@/stores/provider-store";
import { reasoningToggleState, inspectAgentReasoning, reasoningModelKey, type ModelReasoning } from "../agent-reasoning";

export function AgentComposer({ projectPath, draftKey, onSend, onStop, busy: running, unavailable, controls, suggestion }: {
  projectPath: string; draftKey: string; mode: AgentMode; onModeChange: (mode: AgentMode) => void;
  onSend?: (text: string) => void; onStop: () => void; busy: boolean;
  unavailable: boolean; controls: ReactNode;
  suggestion: { text: string; id: string };
}) {
  const providerId = useProviderStore((state) => state.selectedProvider);
  const model = useProviderStore((state) => state.selectedModel);
  const baseUrl = useProviderStore((state) => state.cloudProviders.find((provider) => provider.id === state.selectedProvider)?.baseUrl);
  const modelKey = reasoningModelKey(providerId, model, baseUrl);
  const preferredLevel = useAgentStore((state) => state.reasoningLevelByModel[modelKey] ?? state.reasoningLevel);
  const setReasoningLevel = useAgentStore((state) => state.setModelReasoningLevel);
  const [lookup, setLookup] = useState<{ key: string; result: ModelReasoning } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const previousRefresh = useRef(0);
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    const forceRefresh = refresh !== previousRefresh.current;
    previousRefresh.current = refresh;
    inspectAgentReasoning(providerId, model, baseUrl, forceRefresh).then((result) => {
      if (!cancelled) setLookup({ key: modelKey, result });
    }).catch(() => {
      if (!cancelled) setLookup({ key: modelKey, result: { known: false, levels: [], message: "Could not inspect this model in Pi. Restart the desktop app or check the Pi installation." } });
    });
    return () => { cancelled = true; };
  }, [providerId, model, baseUrl, modelKey, refresh]);
  const capabilities = lookup?.key === modelKey ? lookup.result : null;
  const levels = capabilities?.levels ?? [];
  const reasoning = reasoningToggleState(preferredLevel, levels);
  const scheduler = useSyncExternalStore(
    (listener) => aiScheduler.subscribeToScheduler(listener),
    () => aiScheduler.getSchedulerSnapshot(),
  );
  const pendingJob = [scheduler.activeJob, ...scheduler.queuedJobs].find((job) => job?.type === "agent_pi" && job.conversationId === `agent:${projectPath.trim()}`);
  const busy = running || Boolean(pendingJob);
  const stop = () => { if (pendingJob) aiScheduler.cancelAiJob(pendingJob.id); onStop(); };
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = drafts[draftKey] ?? "";
  const input = useRef<HTMLTextAreaElement>(null);
  const previousSuggestion = useRef("");
  useEffect(() => {
    if (suggestion.id && suggestion.id !== previousSuggestion.current) {
      setDrafts((values) => ({ ...values, [draftKey]: suggestion.text }));
      input.current?.focus();
    }
    previousSuggestion.current = suggestion.id;
  }, [suggestion, draftKey]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`;
    }
  }, [text]);
  const send = () => {
    if (!text.trim() || busy || unavailable || !onSend) return;
    onSend(text.trim());
    setDrafts((values) => ({ ...values, [draftKey]: "" }));
  };
  return <div className="agent-compose-wrap">
    <div className="agent-composer">
      <textarea ref={input} rows={2} value={text} aria-label="Message" placeholder="Ask anything, or describe what you want to do…"
        onChange={(event) => setDrafts((values) => ({ ...values, [draftKey]: event.target.value }))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          if (event.key === "Escape" && busy) stop();
        }} />
      <div className="agent-composer-controls">
        <fieldset disabled={busy} className="agent-model-controls">{controls}</fieldset>
        <button type="button" role="switch" aria-label="Agent reasoning" aria-checked={reasoning.enabled}
          className="agent-reasoning-control" title={capabilities?.message || "Turn reasoning on or off"}
          disabled={busy || !reasoning.canToggle}
          onClick={() => setReasoningLevel(modelKey, reasoning.enabled ? "off" : "medium")}>
          <Brain size={14} aria-hidden="true" />
          <span>{!model ? "Select model" : !capabilities ? "Checking reasoning…" : !capabilities.known ? "Reasoning unavailable" : !levels.length ? "Model managed" : reasoning.enabled ? "Reasoning on" : "Reasoning off"}</span>
        </button>
        <button type="button" className="agent-icon-button" aria-label="Refresh reasoning capabilities" title="Refresh after changing Pi model configuration" disabled={busy || !model} onClick={() => { setLookup(null); setRefresh((value) => value + 1); }}><RefreshCw size={12} /></button>
        <button type="button" className="agent-send" aria-label={busy ? "Stop agent" : "Run task"} disabled={!busy && (!text.trim() || unavailable || !onSend)} onClick={busy ? stop : send}>
          {busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
        </button>
      </div>
    </div>
    <div className="agent-compose-hint"><span>{busy ? running ? "Working · Esc to stop" : "Preparing · Esc to cancel" : unavailable ? "Choose a model and check the runtime" : projectPath ? "Can edit files and run commands in your project" : "Attach a project to work with files"}</span><span>Enter to send · Shift + Enter for a new line</span></div>
  </div>;
}
