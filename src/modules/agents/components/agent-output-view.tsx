import { useEffect, useRef } from "react";
import { ChevronRight, FileCode2, Loader2, Sparkles, Square, TerminalSquare } from "lucide-react";
import type { AgentSession } from "@/modules/agents/agent-types";
import { AgentChatTurn, buildAgentChatTurns } from "@/modules/agents/components/agent-chat-turn";
import type { AgentChatTurnModel } from "@/modules/agents/components/agent-chat-turn";
import { AGENT_MODES, StatusDot } from "@/modules/agents/components/agents-panel";

export function AgentOutputView({
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

  const turns = buildAgentChatTurns(session.events, session.model);
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
              turn={{
                id: `${session.id}:working`,
                role: "assistant",
                content: "",
                pending: true,
                model: session.model,
              }}
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

export function AgentActivityCard({ turn }: { turn: AgentChatTurnModel }) {
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

export function AgentEmptyState() {
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
