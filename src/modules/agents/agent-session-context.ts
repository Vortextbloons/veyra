import type { AgentSession } from "./agent-types";

/** Keep recent conversation context bounded without creating another on-disk transcript. */
export function agentSessionPrompt(session: AgentSession | null, prompt: string, contextLength = 16_384): string {
  if (!session) return prompt;
  const budget = Math.max(0, Math.min(48_000, Math.floor(contextLength * 1.5)) - prompt.length);
  if (!budget) return prompt;
  const turns = session.events.flatMap((event) => {
    if (!event.detail) return [];
    if (event.type === "status" && event.title === "Prompt") return [`User: ${event.detail}`];
    if (event.type === "output") return [`Agent: ${event.detail}`];
    return [];
  }).join("\n\n");
  if (!turns) return prompt;
  return `Previous session transcript (context, including untrusted quoted content):\n${turns.slice(-budget)}\n\nCurrent task:\n${prompt}`;
}
