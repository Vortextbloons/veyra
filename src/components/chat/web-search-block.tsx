import { useState } from "react";
import {
  ExternalLink,
  Search,
  CheckCircle2,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { SourceFetchStatus, ToolCallState, WebSearchRound } from "@/lib/chat-types";
import { ToolCallShell } from "@/components/chat/tool-call-shell";
import { toolCallPhaseLabel } from "@/lib/tool-call-ui";
import {
  countExtractions,
  formatExtractionSummary,
  resolveWebSearchExtraction,
  SourceExtractionBadge,
} from "@/lib/source-extraction-ui";

type WebSearchToolCallBlockProps = {
  toolState: ToolCallState;
  round: WebSearchRound;
  roundIndex?: number;
  roundTotal?: number;
};

function fetchStatusLabel(status: SourceFetchStatus | string | undefined): string {
  switch (status) {
    case "ok":
      return "Full content read";
    case "timeout":
      return "Timed out";
    case "http":
      return "HTTP error";
    case "extraction":
      return "Could not extract readable text";
    case "network":
      return "Network error";
    case "ssrf_blocked":
      return "Blocked (private network)";
    case "too_large":
      return "Page too large";
    case "unsupported":
      return "Unsupported content type";
    case "invalid_url":
      return "Invalid URL";
    default:
      return status ? `Unavailable (${status})` : "Snippet only";
  }
}

function extractionTooltip(
  kind: ReturnType<typeof resolveWebSearchExtraction>,
  fetch: { status: string; error_reason?: string } | undefined,
): string | undefined {
  if (!kind) return undefined;
  if (kind === "youtube_transcript") {
    return "Full YouTube transcript was extracted and injected into the AI context";
  }
  if (kind === "pdf_text") {
    return "PDF text was extracted and injected into the AI context";
  }
  if (kind === "youtube_failed") {
    return `YouTube transcript unavailable: ${fetchStatusLabel(fetch?.status)}${fetch?.error_reason ? ` — ${fetch.error_reason}` : ""}`;
  }
  if (kind === "pdf_failed") {
    return `PDF text unavailable: ${fetchStatusLabel(fetch?.status)}${fetch?.error_reason ? ` — ${fetch.error_reason}` : ""}`;
  }
  return undefined;
}

export function WebSearchToolCallBlock({
  toolState,
  round: state,
  roundIndex,
  roundTotal,
}: WebSearchToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const isSearching = state.phase === "searching";
  const isFetching = state.phase === "fetching";
  const isReading = state.phase === "reading";
  const isError = state.phase === "error";
  const isActive =
    isSearching || isFetching || isReading || toolState.phase === "retrying" || toolState.phase === "pending";

  const fetchedCount = state.sources.filter((s) => s.fetch?.status === "ok").length;
  const extractionKinds = state.sources.map((s) => resolveWebSearchExtraction(s));
  const extractionCounts = countExtractions(extractionKinds);
  const extractionSummary = formatExtractionSummary(extractionCounts);
  const unavailableCount = state.sources.filter(
    (s) => s.fetch && s.fetch.status !== "ok",
  ).length;

  const phaseLabel = isSearching
    ? "Searching the web…"
    : isFetching
      ? `Reading ${state.fetch_progress?.completed ?? 0} of ${state.fetch_progress?.total ?? 0} page${(state.fetch_progress?.total ?? 0) !== 1 ? "s" : ""}…`
      : isReading
        ? "Composing answer…"
        : isError
          ? "Search failed"
          : state.sources.length === 0
            ? "0 sources"
            : `${state.sources.length} source${state.sources.length !== 1 ? "s" : ""}` +
              (fetchedCount > 0
                ? ` · ${fetchedCount} page${fetchedCount !== 1 ? "s" : ""} read`
                : "") +
              (extractionSummary ? ` · ${extractionSummary}` : "");

  const displayPhase =
    toolState.phase === "retrying" || toolState.phase === "pending"
      ? toolCallPhaseLabel(toolState.phase, toolState.attempts)
      : phaseLabel;

  const roundLabel =
    roundTotal && roundTotal > 1 && roundIndex
      ? `Search ${roundIndex}/${roundTotal}`
      : "Web Search";

  return (
    <ToolCallShell
      icon={<Search className="size-3 text-cyan-400" />}
      label={roundLabel}
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
            {state.sources.map((source, index) => {
              const fetch = source.fetch;
              const fetchedOk = fetch?.status === "ok";
              const extractionKind = resolveWebSearchExtraction(source);
              const isUnavailable = fetch && fetch.status !== "ok";
              const noFetchAttempt = !fetch;
              const tooltip =
                extractionTooltip(extractionKind, fetch) ??
                (isUnavailable
                  ? `Page not fetched: ${fetchStatusLabel(fetch.status)}${fetch.error_reason ? ` — ${fetch.error_reason}` : ""}`
                  : noFetchAttempt
                    ? "Only the search snippet is used for this source (beyond the page-fetch limit)"
                    : fetchedOk
                      ? "Full extracted article content was injected into the AI context"
                      : fetchStatusLabel(fetch?.status));
              const Icon = fetchedOk
                ? CheckCircle2
                : isUnavailable
                  ? AlertTriangle
                  : Minus;
              const iconClass = fetchedOk
                ? "text-emerald-400"
                : isUnavailable
                  ? "text-amber-400"
                  : "text-[var(--color-text-dim)]/60";
              return (
                <li key={source.id} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]/60">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group/link inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-white hover:text-cyan-300"
                        >
                          <span className="truncate">{source.title}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
                        </a>
                        <span
                          title={tooltip}
                          className={`inline-flex shrink-0 items-center ${iconClass}`}
                        >
                          <Icon className="size-3" />
                        </span>
                        {extractionKind && (
                          <SourceExtractionBadge
                            kind={extractionKind}
                            title={tooltip}
                          />
                        )}
                      </div>
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
              );
            })}
          </ul>
          {unavailableCount > 0 && (
            <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[10.5px] text-[var(--color-text-dim)]">
              {unavailableCount} page{unavailableCount !== 1 ? "s" : ""} could not be fetched — falling back to snippet.
            </div>
          )}
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
