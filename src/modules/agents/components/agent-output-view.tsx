import { useEffect, useRef, useMemo } from "react";
import { ChevronRight, Sparkles, TerminalSquare } from "lucide-react";
import type { AgentSession } from "@/modules/agents/agent-types";
import { AgentChatTurn } from "@/modules/agents/components/agent-chat-turn";
import { buildAgentChatTurns, type AgentChatTurnModel } from "@/modules/agents/agent-chat-turns";
import { StatusDot } from "@/modules/agents/agent-status-dot";

export function AgentOutputView({
  session,
  onStop,
}: {
  session: AgentSession;
  onStop: (id: string) => void;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const isRunning = session.status === "running";

  useEffect(() => {
    const el = outputRef.current;
    if (el && followOutput.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [session.events]);

  const turns = useMemo(() => buildAgentChatTurns(session.events, session.model), [session.events, session.model]);
  const hasAssistantAfterLastPrompt = turns.at(-1)?.role === "assistant";
  const showWorkingTurn = isRunning && !hasAssistantAfterLastPrompt;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="agent-work-status">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={session.status} />
          <span className="truncate text-[12.5px] font-medium text-white">
            {session.status === "running" ? "Working" : session.status === "completed" ? "Task completed" : session.status}
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
            Stop
          </button>
        )}
      </div>

      <div ref={outputRef} onScroll={() => { const el = outputRef.current; if (el) followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }} className="min-h-0 flex-1 overflow-y-auto">
        <div className="agent-work-log">
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
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[13px] text-[var(--color-text-dim)]">
              This session ended without producing output.
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
    <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
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
      </div>
      </summary>
      {turn.content && <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-text-dim)]">{turn.content}</pre>}
    </details>
  );
}
