import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { ToolCallState, WebSearchState } from "@/lib/chat-types";
import { ToolCallShell } from "@/components/chat/tool-call-shell";
import { toolCallPhaseLabel } from "@/lib/tool-call-ui";

type WebSearchToolCallBlockProps = {
  toolState: ToolCallState;
  state: WebSearchState;
};

export function WebSearchToolCallBlock({ toolState, state }: WebSearchToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const isSearching = state.phase === "searching";
  const isReading = state.phase === "reading";
  const isError = state.phase === "error";
  const isActive = isSearching || isReading || toolState.phase === "retrying" || toolState.phase === "pending";

  const phaseLabel = isSearching
    ? "Searching…"
    : isReading
      ? `Reading ${state.sources.length} source${state.sources.length !== 1 ? "s" : ""}…`
      : isError
        ? "Search failed"
        : `${state.sources.length} source${state.sources.length !== 1 ? "s" : ""} found`;

  const displayPhase =
    toolState.phase === "retrying" || toolState.phase === "pending"
      ? toolCallPhaseLabel(toolState.phase, toolState.attempts)
      : phaseLabel;

  return (
    <ToolCallShell
      icon={<Search className="size-3 text-cyan-400" />}
      label="Web Search"
      phaseLabel={displayPhase}
      accent="cyan"
      isActive={isActive}
      isError={isError || toolState.phase === "error"}
      isDone={state.phase === "done" && toolState.phase === "done"}
      inputPreview={state.query}
      expandable={state.sources.length > 0 || Boolean(state.error)}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      {expanded && state.sources.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/50">
          <ul className="m-0 list-none divide-y divide-[var(--color-border)] p-0">
            {state.sources.map((source, index) => (
              <li key={source.id} className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]/60">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group/link inline-flex items-center gap-1 text-[12px] font-medium text-white hover:text-cyan-300"
                    >
                      <span className="truncate">{source.title}</span>
                      <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
                    </a>
                    <div className="mt-0.5 truncate text-[10.5px] text-[var(--color-accent)]/70">
                      {source.url}
                    </div>
                    {source.snippet && (
                      <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-dim)]">
                        {source.snippet}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && isError && state.error && (
        <div className="mt-1 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11.5px] text-red-300">
          {state.error}
        </div>
      )}
    </ToolCallShell>
  );
}
