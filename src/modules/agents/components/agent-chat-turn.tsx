/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { AgentEvent, AgentMode } from "@/modules/agents/agent-types";
import { AgentActivityCard } from "@/modules/agents/components/agent-output-view";
import { TypewriterMarkdown } from "@/modules/agents/components/typewriter-markdown";
import { ModelIcon } from "@/components/model-icon";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

export type AgentChatTurnModel = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  title?: string;
  kind?: "reasoning" | "tool" | "step";
  pending?: boolean;
  animate?: boolean;
  /** Provider-qualified model id (e.g. "lmstudio/qwen2.5-7b"). */
  model?: string;
};

export function shouldAnimateAgentText(event: AgentEvent) {
  return Date.now() - event.at < 60_000;
}

export function buildAgentChatTurns(
  events: AgentEvent[],
  model?: string,
): AgentChatTurnModel[] {
  const turns: AgentChatTurnModel[] = [];
  const toolTurnIndexByCallId = new Map<string, number>();
  let previousEventType: AgentEvent["type"] | null = null;

  for (const evt of events) {
    if (evt.type === "status" && evt.title === "Prompt" && evt.detail?.trim()) {
      toolTurnIndexByCallId.clear();
      previousEventType = null;
      turns.push({ id: evt.id, role: "user", content: evt.detail.trim() });
      previousEventType = evt.type;
      continue;
    }

    if (evt.type === "output" && (evt.title === "Pi" || evt.title === "Pi stream")) {
      const content = evt.detail?.trim();
      if (!content) continue;
      const last = turns.at(-1);
      if (last?.role === "assistant" && !last.kind && previousEventType === "output") {
        last.content = [last.content, content].filter(Boolean).join("\n\n");
        last.animate = last.animate || shouldAnimateAgentText(evt);
      } else {
        turns.push({
          id: evt.id,
          role: "assistant",
          content,
          animate: shouldAnimateAgentText(evt),
          model,
        });
      }
      previousEventType = evt.type;
      continue;
    }

    if (evt.type === "error") {
      turns.push({
        id: evt.id,
        role: "error",
        title: evt.title,
        content: evt.detail?.trim() || "Pi failed.",
      });
      previousEventType = evt.type;
      continue;
    }

    if (evt.type === "reasoning") {
      const last = turns.at(-1);
      if (last?.kind === "reasoning" && previousEventType === "reasoning") {
        const content = evt.detail?.trim() || "";
        if (content) {
          last.content = [last.content, content].filter(Boolean).join("\n\n");
        }
      } else {
        turns.push({
          id: evt.id,
          role: "assistant",
          kind: "reasoning",
          title: "Reasoning",
          content: evt.detail?.trim() || "Thinking",
        });
      }
      previousEventType = evt.type;
      continue;
    }

    if (evt.type === "tool") {
      const content = evt.detail?.trim() || "";
      const existingIndex = evt.toolCallId ? toolTurnIndexByCallId.get(evt.toolCallId) : undefined;
      if (existingIndex != null) {
        const current = turns[existingIndex];
        turns[existingIndex] = {
          ...current,
          title: evt.title || current.title,
          content: content || current.content || "Running tool",
        };
      } else {
        turns.push({
          id: evt.toolCallId ?? evt.id,
          role: "assistant",
          kind: "tool",
          title: evt.title,
          content: content || "Running tool",
        });
        if (evt.toolCallId) {
          toolTurnIndexByCallId.set(evt.toolCallId, turns.length - 1);
        }
      }
      previousEventType = evt.type;
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
      previousEventType = evt.type;
    }
  }

  return turns;
}

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
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white shadow-[0_0_0_2px_var(--color-bg)]">
          U
        </div>
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
      <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_0_0_2px_var(--color-bg)]">
        {isError ? (
          <AlertTriangle className="size-3.5" />
        ) : modelShortId ? (
          <ModelIcon
            modelId={modelShortId}
            className="size-7"
            fallback={<Sparkles className="size-3.5" />}
          />
        ) : (
          <Sparkles className="size-3.5" />
        )}
      </div>
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
