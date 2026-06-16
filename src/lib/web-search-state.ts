import type { WebSearchRound, WebSearchState } from "@/lib/chat-types";

/** Pre-rounds persisted message shape. */
type LegacyWebSearchState = {
  query: string;
  phase?: WebSearchRound["phase"];
  sources?: WebSearchRound["sources"];
  fetch_progress?: WebSearchRound["fetch_progress"];
  error?: string;
};

export type WebSearchStateLike = WebSearchState | LegacyWebSearchState;

export function normalizeWebSearchRounds(
  state?: WebSearchStateLike | null,
): WebSearchRound[] {
  if (!state) return [];
  if ("rounds" in state && state.rounds?.length) return state.rounds;
  if ("query" in state && state.query) {
    return [
      {
        id: "legacy",
        query: state.query,
        phase: state.phase ?? "done",
        sources: state.sources ?? [],
        fetch_progress: state.fetch_progress,
        error: state.error,
      },
    ];
  }
  return [];
}

export function hasWebSearchActivity(
  state?: WebSearchStateLike | null,
): boolean {
  return normalizeWebSearchRounds(state).length > 0;
}

export function webSearchRoundForToolCall(
  state: WebSearchStateLike | undefined,
  toolCallId: string,
): WebSearchRound | undefined {
  const rounds = normalizeWebSearchRounds(state);
  return (
    rounds.find((round) => round.id === toolCallId) ??
    (rounds.length === 1 && rounds[0].id === "legacy" ? rounds[0] : undefined)
  );
}

export function markWebSearchRoundsDone(
  state?: WebSearchStateLike | null,
): WebSearchState | undefined {
  const rounds = normalizeWebSearchRounds(state);
  if (rounds.length === 0) return undefined;
  return {
    rounds: rounds.map((round) => ({
      ...round,
      phase: round.phase === "error" ? "error" : "done",
    })),
  };
}
