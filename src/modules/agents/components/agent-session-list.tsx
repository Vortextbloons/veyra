import { Plus, Square, Trash2 } from "lucide-react";
import type { AgentSession } from "@/modules/agents/agent-types";
import { StatusDot } from "@/modules/agents/components/agents-panel";

export function AgentSessionList({
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
