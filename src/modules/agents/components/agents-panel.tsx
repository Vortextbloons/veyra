import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Folder,
  Loader2,
  Play,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { AgentEvent, AgentMode, AgentSession } from "@/modules/agents/agent-types";

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

const AGENT_MODES: { id: AgentMode; label: string; detail: string }[] = [
  { id: "plan", label: "Plan", detail: "Read-only strategy" },
  { id: "review", label: "Review", detail: "Find risks" },
  { id: "build", label: "Build", detail: "Make changes" },
  { id: "debug", label: "Debug", detail: "Trace failures" },
  { id: "refactor", label: "Refactor", detail: "Reshape safely" },
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
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];

  return (
    <div className="relative z-10 flex min-h-full flex-col gap-3 px-4 py-4">
      <section className="overflow-hidden rounded-2xl border border-indigo-400/15 bg-[linear-gradient(135deg,rgba(99,102,241,0.14),rgba(14,165,233,0.05)_38%,rgba(10,10,16,0.78))] shadow-[0_20px_60px_-38px_rgba(99,102,241,0.9)]">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-300/15 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200">
              <Bot className="size-3.5" />
              Opencode background runtime
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-white">
              Agents inside chat
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
              Toggle into a coding-agent lane without mixing opencode process state into normal chat.
            </p>
          </div>
          <RuntimeBadge available={runtimeAvailable} onCheckRuntime={onCheckRuntime} />
        </div>

        <div className="grid gap-2 border-t border-white/10 bg-black/10 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <Folder className="size-4 shrink-0 text-indigo-200" />
            <input
              value={projectPath}
              onChange={(event) => onProjectPathChange(event.target.value)}
              placeholder="Workspace path, for example C:\\Users\\isaac\\Desktop\\DevProjects\\Desktop Apps\\Veyra"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-[var(--color-text-dim)]/65"
            />
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 sm:flex">
            {AGENT_MODES.map((item) => {
              const active = item.id === mode;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onModeChange(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-left transition-colors ${
                    active
                      ? "bg-indigo-500 text-white shadow-[0_8px_24px_-14px_rgba(99,102,241,1)]"
                      : "text-[var(--color-text-dim)] hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <div className="text-[11.5px] font-semibold leading-none">{item.label}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">{item.detail}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/70 p-3">
          {sessions.length === 0 ? (
            <EmptyAgentsState />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {sessions.map((session) => (
                <AgentSessionCard
                  key={session.id}
                  session={session}
                  selected={session.id === activeSession?.id}
                  onSelect={() => onSelectSession(session.id)}
                  onStop={() => onStopSession(session.id)}
                />
              ))}
            </div>
          )}
        </section>

        <AgentActivityDrawer session={activeSession} />
      </div>
    </div>
  );
}

function RuntimeBadge({
  available,
  onCheckRuntime,
}: {
  available: boolean | null;
  onCheckRuntime: () => void;
}) {
  const label = available == null ? "Check runtime" : available ? "Opencode ready" : "Opencode missing";
  return (
    <button
      type="button"
      onClick={onCheckRuntime}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors ${
        available == null
          ? "border-white/10 bg-white/[0.04] text-[var(--color-text-dim)] hover:text-white"
          : available
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
            : "border-red-400/20 bg-red-400/10 text-red-200"
      }`}
    >
      {available ? <CheckCircle2 className="size-4" /> : <TerminalSquare className="size-4" />}
      {label}
    </button>
  );
}

function EmptyAgentsState() {
  return (
    <div className="grid min-h-[18rem] place-items-center rounded-xl border border-dashed border-[var(--color-border)] bg-black/10 p-6 text-center">
      <div>
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl border border-indigo-300/15 bg-indigo-400/10 text-indigo-200">
          <Play className="size-5" />
        </div>
        <h3 className="text-[15px] font-semibold text-white">No agent sessions yet</h3>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          Pick a workspace path, choose a mode, then send a task from the composer. The session will appear here.
        </p>
      </div>
    </div>
  );
}

function AgentSessionCard({
  session,
  selected,
  onSelect,
  onStop,
}: {
  session: AgentSession;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
}) {
  const running = session.status === "running";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group/card rounded-xl border p-3 text-left transition-colors ${
        selected
          ? "border-indigo-400/35 bg-indigo-400/[0.08]"
          : "border-[var(--color-border)] bg-[var(--color-bg)]/55 hover:border-[var(--color-border-strong)] hover:bg-white/[0.03]"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <StatusPill status={session.status} />
        {running && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onStop();
              }
            }}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] opacity-70 transition-colors hover:bg-red-400/10 hover:text-red-200 group-hover/card:opacity-100"
            title="Stop session"
          >
            <Square className="size-3.5" />
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">
        {session.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
        {session.summary ?? session.prompt}
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${
            session.status === "completed"
              ? "w-full bg-emerald-400"
              : session.status === "failed"
                ? "w-full bg-red-400"
                : running
                  ? "w-2/3 animate-pulse bg-indigo-400"
                  : "w-1/4 bg-[var(--color-text-dim)]"
          }`}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[10.5px] text-[var(--color-text-dim)]">
        <span className="rounded-md border border-white/10 px-1.5 py-0.5 uppercase tracking-wide">
          {session.mode}
        </span>
        <span>{formatTime(session.startedAt)}</span>
      </div>
    </button>
  );
}

function AgentActivityDrawer({ session }: { session?: AgentSession }) {
  return (
    <aside className="min-h-[20rem] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/90">
      <div className="border-b border-[var(--color-border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
              Session Details
            </div>
            <h3 className="mt-1 line-clamp-1 text-[13px] font-semibold text-white">
              {session?.title ?? "Select an agent session"}
            </h3>
          </div>
          {session && <StatusIcon status={session.status} />}
        </div>
        {session?.projectPath && (
          <p className="mt-2 truncate font-mono text-[10.5px] text-[var(--color-text-dim)]">
            {session.projectPath}
          </p>
        )}
      </div>

      {!session ? (
        <div className="grid h-64 place-items-center p-6 text-center text-[12px] text-[var(--color-text-dim)]">
          Agent output, errors, and results will appear here.
        </div>
      ) : (
        <div className="max-h-[34rem] overflow-y-auto">
          {session.events.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </aside>
  );
}

function ActivityItem({ item }: { item: AgentEvent }) {
  return (
    <div className="flex gap-2 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0">
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-[var(--color-text-dim)]">
        {item.type === "error" ? (
          <AlertTriangle className="size-3.5 text-red-300" />
        ) : item.type === "result" ? (
          <CheckCircle2 className="size-3.5 text-emerald-300" />
        ) : item.type === "output" ? (
          <TerminalSquare className="size-3.5 text-indigo-200" />
        ) : (
          <CircleDashed className="size-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-white">{item.title}</span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-dim)]/70">
            {formatTime(item.at)}
          </span>
        </div>
        {item.detail && (
          <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/20 p-2 font-mono text-[10.5px] leading-relaxed text-[var(--color-text-dim)]">
            {item.detail}
          </pre>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AgentSession["status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-medium capitalize text-[var(--color-text-dim)]">
      <StatusIcon status={status} />
      {status.replace("_", " ")}
    </span>
  );
}

function StatusIcon({ status }: { status: AgentSession["status"] }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-indigo-300" />;
  if (status === "completed") return <CheckCircle2 className="size-3.5 text-emerald-300" />;
  if (status === "failed") return <AlertTriangle className="size-3.5 text-red-300" />;
  if (status === "stopped") return <Square className="size-3.5 text-amber-300" />;
  return <Clock3 className="size-3.5 text-[var(--color-text-dim)]" />;
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
