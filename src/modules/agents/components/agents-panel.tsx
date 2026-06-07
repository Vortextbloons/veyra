import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Hammer,
  HelpCircle,
  ListTodo,
  Loader2,
  Plus,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AgentEvent, AgentMode, AgentSession } from "@/modules/agents/agent-types";
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
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onStopSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
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
  onNewSession,
  onSelectSession,
  onStopSession,
  onDeleteSession,
}: AgentsPanelProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
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
        <AgentSessionList
          sessions={sessions}
          activeSessionId={activeSession?.id ?? null}
          onNew={onNewSession}
          onSelect={onSelectSession}
          onStop={onStopSession}
          onDelete={onDeleteSession}
        />

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
  onNew,
  onSelect,
  onStop,
  onDelete,
}: {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[#101018]">
      <div className="border-b border-[var(--color-border)] p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:border-indigo-400/25 hover:bg-indigo-400/10"
        >
          <Plus className="size-3.5" />
          New session
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
            No agent sessions yet.
          </div>
        )}
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
              className={`group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <StatusDot status={session.status} className="mt-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-medium">
                  {session.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[var(--color-text-dim)]">
                  {session.opencodeSessionId ? "OpenCode" : session.mode.toUpperCase()}
                  {isRunning && " · Running..."}
                </p>
              </div>
              {isRunning ? (
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
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
                  title="Delete session"
                >
                  <Trash2 className="size-2.5" />
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

  const turns = buildAgentChatTurns(session.events);
  const hasAssistantAfterLastPrompt = turns.at(-1)?.role === "assistant";
  const showWorkingTurn = isRunning && !hasAssistantAfterLastPrompt;

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
          {turns.map((turn) => (
            <AgentChatTurn key={turn.id} turn={turn} mode={session.mode} />
          ))}

          {showWorkingTurn && (
            <AgentChatTurn
              turn={{ id: `${session.id}:working`, role: "assistant", content: "", pending: true }}
              mode={session.mode}
            />
          )}

          {turns.length === 0 && !isRunning && (
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

type AgentChatTurnModel = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  title?: string;
  kind?: "reasoning" | "tool" | "step";
  pending?: boolean;
  animate?: boolean;
};

function shouldAnimateAgentText(event: AgentEvent) {
  return Date.now() - event.at < 60_000;
}

function buildAgentChatTurns(events: AgentEvent[]): AgentChatTurnModel[] {
  const turns: AgentChatTurnModel[] = [];

  for (const evt of events) {
    if (evt.type === "status" && evt.title === "Prompt" && evt.detail?.trim()) {
      turns.push({ id: evt.id, role: "user", content: evt.detail.trim() });
      continue;
    }

    if (evt.type === "output" && (evt.title === "Opencode" || evt.title === "OpenCode stream")) {
      const content = evt.detail?.trim();
      if (!content) continue;
      const last = turns.at(-1);
      if (last?.role === "assistant" && !last.kind) {
        last.content = [last.content, content].filter(Boolean).join("\n\n");
        last.animate = last.animate || shouldAnimateAgentText(evt);
      } else {
        turns.push({ id: evt.id, role: "assistant", content, animate: shouldAnimateAgentText(evt) });
      }
      continue;
    }

    if (evt.type === "error") {
      turns.push({
        id: evt.id,
        role: "error",
        title: evt.title,
        content: evt.detail?.trim() || "OpenCode failed.",
      });
      continue;
    }

    if (evt.type === "reasoning") {
      turns.push({
        id: evt.id,
        role: "assistant",
        kind: "reasoning",
        title: "Reasoning",
        content: evt.detail?.trim() || "Thinking",
      });
      continue;
    }

    if (evt.type === "tool") {
      turns.push({
        id: evt.id,
        role: "assistant",
        kind: "tool",
        title: evt.title,
        content: evt.detail?.trim() || "Running tool",
      });
      continue;
    }

    if (
      evt.type === "status" &&
      evt.title !== "Prompt" &&
      evt.title !== "Message sent" &&
      !evt.title.startsWith("Session")
    ) {
      turns.push({
        id: evt.id,
        role: "assistant",
        kind: "step",
        title: evt.title,
        content: evt.detail?.trim() || "",
      });
    }
  }

  return turns;
}

function AgentChatTurn({
  turn,
  mode,
}: {
  turn: AgentChatTurnModel;
  mode: AgentMode;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex flex-row-reverse gap-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white shadow-[0_0_0_2px_var(--color-bg)]">
          U
        </div>
        <div className="flex min-w-0 max-w-[85%] flex-col items-end">
          <div className="rounded-2xl rounded-tr-md border border-indigo-400/15 bg-[var(--color-accent-soft)] px-4 py-2.5 text-[13px] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
            <MarkdownRenderer className="leading-snug">{turn.content}</MarkdownRenderer>
          </div>
        </div>
      </div>
    );
  }

  const isError = turn.role === "error";
  if (turn.kind) {
    return <AgentActivityCard turn={turn} />;
  }

  return (
    <div className="flex items-start gap-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_0_0_2px_var(--color-bg)]">
        {isError ? <AlertTriangle className="size-3.5" /> : <Sparkles className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11.5px] leading-none">
          <span className="font-medium text-white">Agent</span>
          <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
          <span className="text-[var(--color-text-dim)]">{mode}</span>
          {isError && turn.title && (
            <>
              <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
              <span className="text-red-300/80">{turn.title}</span>
            </>
          )}
        </div>
        <div
          className={`rounded-2xl rounded-tl-md border px-4 py-2.5 text-[13px] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${
            isError
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)]"
          }`}
        >
          {turn.pending ? (
            <div className="flex items-center gap-2 text-[var(--color-text-dim)]">
              <Loader2 className="size-3.5 animate-spin text-[var(--color-accent)]" />
              <span>Thinking...</span>
            </div>
          ) : isError ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
              {turn.content}
            </pre>
          ) : (
            <TypewriterMarkdown content={turn.content} enabled={turn.animate === true} />
          )}
        </div>
      </div>
    </div>
  );
}

function TypewriterMarkdown({ content, enabled }: { content: string; enabled: boolean }) {
  const [visible, setVisible] = useState(enabled ? "" : content);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!enabled) {
      visibleRef.current = content;
      setVisible(content);
      return;
    }

    let index = content.startsWith(visibleRef.current) ? visibleRef.current.length : 0;
    if (index > content.length) index = 0;
    visibleRef.current = content.slice(0, index);
    setVisible(visibleRef.current);
    if (index >= content.length) return;

    const interval = window.setInterval(() => {
      const remaining = content.length - index;
      const step = remaining > 800 ? 8 : remaining > 300 ? 5 : 3;
      index = Math.min(content.length, index + step);
      const next = content.slice(0, index);
      visibleRef.current = next;
      setVisible(next);
      if (index >= content.length) window.clearInterval(interval);
    }, 16);

    return () => window.clearInterval(interval);
  }, [content, enabled]);

  return (
    <>
      <MarkdownRenderer className="leading-snug">{visible}</MarkdownRenderer>
      {enabled && visible.length < content.length && (
        <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-300 align-middle" />
      )}
    </>
  );
}

function AgentActivityCard({ turn }: { turn: AgentChatTurnModel }) {
  const isTool = turn.kind === "tool";
  const isReasoning = turn.kind === "reasoning";
  return (
    <div className="ml-10 mr-6 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-[#11121a]/80 px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.035)_inset]">
      <div
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ${
          isTool
            ? "bg-cyan-400/10 text-cyan-300"
            : isReasoning
              ? "bg-violet-400/10 text-violet-300"
              : "bg-indigo-400/10 text-indigo-300"
        }`}
      >
        {isTool ? <TerminalSquare className="size-3" /> : isReasoning ? <Sparkles className="size-3" /> : <ChevronRight className="size-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--color-text)]">
          <span className="truncate">{turn.title ?? (isTool ? "Tool" : isReasoning ? "Reasoning" : "Step")}</span>
          {isTool && <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-cyan-300">tool</span>}
          {isReasoning && <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-violet-300">thinking</span>}
        </div>
        {turn.content && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-text-dim)]">
            {turn.content}
          </p>
        )}
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
