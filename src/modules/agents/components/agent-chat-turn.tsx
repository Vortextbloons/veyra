import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { AgentMode } from "@/modules/agents/agent-types";
import type { AgentChatTurnModel } from "@/modules/agents/agent-chat-turns";
import { AgentActivityCard } from "@/modules/agents/components/agent-output-view";
import { TypewriterMarkdown } from "@/modules/agents/components/typewriter-markdown";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

export function AgentChatTurn({
  turn,
  mode,
}: {
  turn: AgentChatTurnModel;
  mode: AgentMode;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex flex-row-reverse gap-3">
        <div className="flex min-w-0 max-w-[85%] flex-col items-end">
          <div className="rounded-2xl rounded-tr-md border border-indigo-400/15 bg-[var(--color-accent-soft)] px-4 py-2.5 text-[13px] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
            <Suspense>
              <MarkdownRenderer className="leading-snug">{turn.content}</MarkdownRenderer>
            </Suspense>
          </div>
        </div>
      </div>
    );
  }

  const isError = turn.role === "error";
  if (turn.kind) {
    return <AgentActivityCard turn={turn} />;
  }

  const modelShortId = turn.model?.split("/").pop()?.trim() || "";
  const assistantLabel = modelShortId || "Agent";

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11.5px] leading-none">
          <span className="truncate font-medium text-white">{assistantLabel}</span>
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
