import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  FileCode2,
  Folder,
  FolderOpen,
  Hammer,
  HelpCircle,
  ListTodo,
  Loader2,
  Sparkles,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AgentMode, AgentSession } from "@/modules/agents/agent-types";
import { MarkdownRenderer } from "@/components/markdown-renderer";
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
  onSelectSession: (id: string) => void;
  onStopSession: (id: string) => void;
};

const AGENT_MODES: { id: AgentMode; label: string; detail: string; icon: ReactNode }[] = [
  { id: "ask", label: "Ask", detail: "Read-only answers", icon: <HelpCircle className="size-3.5" /> },
  { id: "plan", label: "Plan", detail: "Strategy & analysis", icon: <ListTodo className="size-3.5" /> },
  { id: "build", label: "Build", detail: "Make code changes", icon: <Hammer className="size-3.5" /> },
];

export function AgentsPanel({
  sessions,
  activeSessionId,
  runtimeAvailable,
  mode,
  projectPath,
  onModeChange,
  onProjectPathChange,
  onCheckRuntime,
  onSelectSession,
  onStopSession,
}: AgentsPanelProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;
  const runningSession = sessions.find((s) => s.status === "running") ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <AgentHeader
        mode={mode}
        onModeChange={onModeChange}
        projectPath={projectPath}
        onProjectPathChange={onProjectPathChange}
        runtimeAvailable={runtimeAvailable}
        onCheckRuntime={onCheckRuntime}
      />

      <div className="flex min-h-0 flex-1">
        {sessions.length > 0 && (
          <AgentSessionList
            sessions={sessions}
            activeSessionId={activeSession?.id ?? null}
            onSelect={onSelectSession}
            onStop={onStopSession}
          />
        )}

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
  onCheckRuntime,
}: {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  projectPath: string;
  onProjectPathChange: (p: string) => void;
  runtimeAvailable: boolean | null;
  onCheckRuntime: () => void;
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
                {item.icon}
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
              placeholder="Workspace path (leave empty for default)"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]/50"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleBrowse()}
            title="Browse for folder"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-white/[0.04] hover:text-white"
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

function AgentSessionList({
  sessions,
  activeSessionId,
  onSelect,
  onStop,
}: {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onStop: (id: string) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Sessions
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isRunning = session.status === "running";
          return (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(session.id);
                }
              }}
              className={`group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-[var(--color-accent-soft)]"
                  : "hover:bg-white/[0.03]"
              }`}
            >
              <StatusDot status={session.status} className="mt-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[12px] font-medium text-white">
                  {session.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[var(--color-text-dim)]">
                  {session.mode.toUpperCase()}
                  {session.status === "ready" && " · Ready"}
                  {session.endedAt && session.status !== "ready" && ` · ${formatElapsed(session.startedAt, session.endedAt)}`}
                  {isRunning && " · Running..."}
                </p>
              </div>
              {isRunning && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop(session.id);
                  }}
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
                  title="Stop"
                >
                  <Square className="size-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function AgentOutputView({
  session,
  onStop,
}: {
  session: AgentSession;
  onStop: (id: string) => void;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const isRunning = session.status === "running";

  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [session.events.length]);

  const outputEvents = session.events.filter(
    (e) => e.type === "output" || e.type === "result" || e.type === "error",
  );
  const statusEvents = session.events.filter((e) => e.type === "status");

  const agentText = outputEvents
    .filter((e) => e.type === "output" && e.title === "Opencode")
    .map((e) => e.detail ?? "")
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={session.status} />
          <span className="truncate text-[12.5px] font-medium text-white">
            {session.title}
          </span>
          <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
            {session.mode}
          </span>
        </div>
        {isRunning && (
          <button
            type="button"
            onClick={() => onStop(session.id)}
            className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:border-red-500/30 hover:bg-red-500/15"
          >
            <Square className="size-3" />
            Stop
          </button>
        )}
      </div>

      <div ref={outputRef} className="flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-5 px-5 pb-6 pt-5">
          {session.prompt && (
            <div className="flex flex-row-reverse gap-3">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white shadow-[0_0_0_2px_var(--color-bg)]">
                U
              </div>
              <div className="flex min-w-0 max-w-[85%] flex-col items-end">
                <div className="rounded-2xl rounded-tr-md border border-indigo-400/15 bg-[var(--color-accent-soft)] px-4 py-2.5 text-[13px] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
                  <MarkdownRenderer className="leading-snug">
                    {session.prompt}
                  </MarkdownRenderer>
                </div>
              </div>
            </div>
          )}

          {statusEvents.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <CircleDashed className="size-3 shrink-0 text-[var(--color-text-dim)]/40" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {statusEvents.map((evt, i) => (
                  <span key={evt.id} className="text-[10.5px] text-[var(--color-text-dim)]/60">
                    {i > 0 && <span className="mr-2 text-[var(--color-text-dim)]/25">&middot;</span>}
                    {evt.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(agentText || isRunning || outputEvents.some((e) => e.type === "error")) && (
            <div className="flex items-start gap-3">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_0_0_2px_var(--color-bg)]">
                <Sparkles className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-[11.5px] leading-none">
                  <span className="font-medium text-white">Agent</span>
                  <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
                  <span className="text-[var(--color-text-dim)]">{session.mode}</span>
                  {session.endedAt && (
                    <>
                      <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
                      <span className="text-[var(--color-text-dim)]">
                        {formatElapsed(session.startedAt, session.endedAt)}
                      </span>
                    </>
                  )}
                </div>

                {outputEvents.some((e) => e.type === "error") && (
                  <div className="mb-2">
                    {outputEvents
                      .filter((e) => e.type === "error")
                      .map((evt) => (
                        <div
                          key={evt.id}
                          className="rounded-2xl rounded-tl-md border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-[13px]"
                        >
                          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-red-300/80">
                            <AlertTriangle className="size-3" />
                            {evt.title}
                          </div>
                          {evt.detail && (
                            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-red-300/70">
                              {evt.detail}
                            </pre>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {agentText ? (
                  <div className="rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 text-[13px] text-[var(--color-text)] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
                    <MarkdownRenderer className="leading-snug">
                      {agentText}
                    </MarkdownRenderer>
                    {isRunning && (
                      <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-400 align-middle" />
                    )}
                  </div>
                ) : isRunning ? (
                  <div className="rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-[13px] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
                    <div className="flex items-center gap-2 text-[var(--color-text-dim)]">
                      <Loader2 className="size-3.5 animate-spin text-[var(--color-accent)]" />
                      <span>Working...</span>
                    </div>
                  </div>
                ) : null}

                {session.exitCode != null && (
                  <div className="mt-1.5 px-1">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10.5px] font-mono ${
                        session.exitCode === 0 ? "text-emerald-400/80" : "text-red-400/80"
                      }`}
                    >
                      {session.exitCode === 0 ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <AlertTriangle className="size-3" />
                      )}
                      exit {session.exitCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!session.prompt && !isRunning && outputEvents.length === 0 && (
            <div className="flex items-center gap-2 px-1 text-[12px] text-[var(--color-text-dim)]">
              <Loader2 className="size-3.5 animate-spin text-[var(--color-accent)]" />
              Waiting for output...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-sm px-6 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 ring-1 ring-inset ring-indigo-400/10">
          <FileCode2 className="size-5 text-indigo-300/70" />
        </div>
        <h3 className="text-[14px] font-semibold text-white">Agent workspace</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          Choose a mode above, then send a task from the composer below. Sessions and their output
          will appear here.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {AGENT_MODES.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2.5"
            >
              <div className="mb-1.5 flex items-center justify-center text-[var(--color-accent)]">
                {m.icon}
              </div>
              <div className="text-[11px] font-semibold text-white">{m.label}</div>
              <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">{m.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDot({
  status,
  className = "",
}: {
  status: AgentSession["status"];
  className?: string;
}) {
  if (status === "running") {
    return (
      <span
        className={`inline-block size-2 animate-pulse rounded-full bg-indigo-400 ${className}`}
      />
    );
  }
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "ready"
        ? "bg-cyan-400"
      : status === "failed"
        ? "bg-red-400"
        : status === "stopped"
          ? "bg-amber-400"
          : "bg-[var(--color-text-dim)]/50";
  return <span className={`inline-block size-2 rounded-full ${color} ${className}`} />;
}

function formatElapsed(start: number, end: number) {
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
