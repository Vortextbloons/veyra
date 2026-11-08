import { useEffect, useRef, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AgentSession } from "@/modules/agents/agent-types";
import { AgentChatTurn } from "@/modules/agents/components/agent-chat-turn";
import { buildAgentChatTurns, reuseAgentChatTurns, type AgentChatTurnModel } from "@/modules/agents/agent-chat-turns";

export function AgentOutputView({
  session,
  onFollowUp,
}: {
  session: AgentSession;
  onStop: (id: string) => void;
  onFollowUp?: (prompt: string) => void;
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
  const [cached, setCached] = useState({ source: turns, turns });
  const stableTurns = cached.source === turns ? cached.turns : reuseAgentChatTurns(turns, cached.turns);
  if (cached.source !== turns) setCached({ source: turns, turns: stableTurns });
  const hasAssistantAfterLastPrompt = turns.at(-1)?.role === "assistant";
  const showWorkingTurn = isRunning && !hasAssistantAfterLastPrompt;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={outputRef} onScroll={() => { const el = outputRef.current; if (el) followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-5 pb-8 pt-6">
          {stableTurns.map((turn) => (
            <div key={turn.id} style={turn === stableTurns.at(-1) ? undefined : { contentVisibility: "auto", containIntrinsicSize: "auto 160px" }}>
              <AgentChatTurn turn={turn} isStreaming={isRunning && turn === stableTurns.at(-1)} onFollowUp={onFollowUp} />
            </div>
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
    <details className={`group/activity min-w-0 border-l-2 pl-3 text-[var(--color-text-dim)] ${isTool ? "border-[var(--color-accent-line-soft)]" : "border-transparent"}`}>
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
        <span className="truncate">{turn.title ?? (isTool ? "Tool" : isReasoning ? "Reasoning" : "Step")}</span>
        <ChevronRight className="size-3 shrink-0 opacity-50 transition-transform group-open/activity:rotate-90" />
      </summary>
      {turn.content && <pre className={`mb-2 mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words border-l pl-4 font-mono text-[12px] leading-relaxed ${isTool ? "border-[var(--color-accent-line-soft)]" : "border-[var(--color-border)]"}`}>{turn.content}</pre>}
    </details>
  );
}
