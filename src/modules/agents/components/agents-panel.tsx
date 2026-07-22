import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  TerminalSquare,
} from "lucide-react";
import type { AgentMode, AgentSession } from "@/modules/agents/agent-types";
import { AGENT_MODES } from "@/modules/agents/agent-mode-options";
import { AgentEmptyState, AgentOutputView } from "@/modules/agents/components/agent-output-view";
import { AgentSessionList } from "@/modules/agents/components/agent-session-list";
import { open } from "@tauri-apps/plugin-dialog";

type AgentsPanelProps = {
  sessions: AgentSession[];
  activeSessionId: string | null;
  runtimeAvailable: boolean | null;
  mode: AgentMode;
  projectPath: string;
  onModeChange: (mode: AgentMode) => void;
  onProjectPathChange: (path: string) => void;
  onCheckRuntime: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onStopSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function AgentsPanel({
  sessions,
  activeSessionId,
  runtimeAvailable,
  mode,
  projectPath,
  onModeChange,
  onProjectPathChange,
  onCheckRuntime,
  onNewSession,
  onSelectSession,
  onStopSession,
  onDeleteSession,
}: AgentsPanelProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const runningSession = sessions.find((s) => s.status === "running") ?? null;
  const [sessionsOpen, setSessionsOpen] = useState(true);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <AgentHeader
        mode={mode}
        onModeChange={onModeChange}
        projectPath={projectPath}
        onProjectPathChange={onProjectPathChange}
        runtimeAvailable={runtimeAvailable}
        running={Boolean(runningSession)}
        onCheckRuntime={onCheckRuntime}
        sessionsOpen={sessionsOpen}
        onToggleSessions={() => setSessionsOpen((o) => !o)}
      />

      <div className="flex min-h-0 flex-1">
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
            sessionsOpen ? "w-72" : "w-0"
          }`}
        >
          <AgentSessionList
            sessions={sessions}
            activeSessionId={activeSession?.id ?? null}
            onNew={onNewSession}
            onSelect={onSelectSession}
            onStop={onStopSession}
            onDelete={onDeleteSession}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {activeSession ? (
            <AgentOutputView session={activeSession} onStop={onStopSession} />
          ) : runningSession ? (
            <AgentOutputView session={runningSession} onStop={onStopSession} />
          ) : (
            <AgentEmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

function AgentHeader({
  mode,
  onModeChange,
  projectPath,
  onProjectPathChange,
  runtimeAvailable,
  running,
  onCheckRuntime,
  sessionsOpen,
  onToggleSessions,
}: {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  projectPath: string;
  onProjectPathChange: (p: string) => void;
  runtimeAvailable: boolean | null;
  running: boolean;
  onCheckRuntime: () => void;
  sessionsOpen: boolean;
  onToggleSessions: () => void;
}) {
  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, title: "Select workspace folder" });
      if (selected) {
        onProjectPathChange(selected);
      }
    } catch {
      // dialog cancelled or unavailable
    }
  };

  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSessions}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
            title={sessionsOpen ? "Collapse sessions" : "Expand sessions"}
          >
            {sessionsOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
          </button>
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/15 ring-1 ring-inset ring-indigo-400/15">
            <Bot className="size-3.5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-white">Agent</h2>
          </div>
          <RuntimePill available={runtimeAvailable} onCheck={onCheckRuntime} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Agent mode"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-0.5"
        >
          {AGENT_MODES.map((item) => {
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onModeChange(item.id)}
                title={item.detail}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[11.5px] font-medium transition-all ${
                  active
                    ? "bg-[var(--color-accent)] text-white shadow-[0_1px_3px_rgba(99,102,241,0.3)]"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 transition-colors focus-within:border-[var(--color-accent)]/30">
            <Folder className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
            <input
              value={projectPath}
              onChange={(e) => onProjectPathChange(e.target.value)}
              disabled={running}
              placeholder="Workspace path (leave empty for default)"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleBrowse()}
            disabled={running}
            title="Browse for folder"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border)] disabled:hover:bg-[var(--color-panel)] disabled:hover:text-[var(--color-text-dim)]"
          >
            <FolderOpen className="size-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function RuntimePill({
  available,
  onCheck,
}: {
  available: boolean | null;
  onCheck: () => void;
}) {
  const isReady = available === true;
  const isMissing = available === false;

  return (
    <button
      type="button"
      onClick={onCheck}
      className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
        isReady
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/15"
          : isMissing
            ? "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/15 hover:bg-red-500/15"
            : "bg-white/[0.04] text-[var(--color-text-dim)] ring-1 ring-inset ring-[var(--color-border)] hover:bg-white/[0.06]"
      }`}
    >
      {isReady ? (
        <CheckCircle2 className="size-3" />
      ) : isMissing ? (
        <AlertTriangle className="size-3" />
      ) : (
        <TerminalSquare className="size-3" />
      )}
      {isReady ? "Ready" : isMissing ? "Missing" : "Check"}
    </button>
  );
}
