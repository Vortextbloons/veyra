import type { AgentEvent } from "@/modules/agents/agent-types";

export type AgentChatTurnModel = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  reasoning?: string;
  title?: string;
  kind?: "reasoning" | "tool" | "step";
  pending?: boolean;
  animate?: boolean;
  /** Provider-qualified model id (e.g. "lmstudio/qwen2.5-7b"). */
  model?: string;
  attachments?: AgentEvent["attachments"];
  artifact?: AgentEvent["artifact"];
  interactiveAnswer?: AgentEvent["interactiveAnswer"];
};

function isAssistantReplyTurn(turn: AgentChatTurnModel | undefined): turn is AgentChatTurnModel {
  return (
    turn?.role === "assistant" &&
    !turn.kind &&
    !turn.artifact &&
    !turn.interactiveAnswer
  );
}

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
    if (evt.artifact || evt.interactiveAnswer) {
      turns.push({ id: evt.id, role: "assistant", content: evt.detail ?? "", artifact: evt.artifact, interactiveAnswer: evt.interactiveAnswer, model });
      previousEventType = evt.type;
      continue;
    }
    if (evt.type === "status" && evt.title === "Prompt" && evt.detail?.trim()) {
      toolTurnIndexByCallId.clear();
      turns.push({ id: evt.id, role: "user", content: evt.detail.trim(), attachments: evt.attachments });
      previousEventType = evt.type;
      continue;
    }

    if (evt.type === "output" && (evt.title === "Pi" || evt.title === "Pi stream")) {
      const content = evt.detail?.trim();
      if (!content) continue;
      const last = turns.at(-1);
      if (
        isAssistantReplyTurn(last) &&
        (previousEventType === "output" || previousEventType === "reasoning")
      ) {
        last.content =
          previousEventType === "output"
            ? [last.content, content].filter(Boolean).join("\n\n")
            : content;
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
      const chunk = evt.detail?.trim() || "";
      const last = turns.at(-1);
      if (isAssistantReplyTurn(last) && previousEventType === "reasoning") {
        if (chunk) {
          last.reasoning = [last.reasoning, chunk].filter(Boolean).join("\n\n");
        }
      } else {
        turns.push({
          id: evt.id,
          role: "assistant",
          content: "",
          reasoning: chunk || undefined,
          model,
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

/** Reuse immutable completed turns so streaming does not invalidate every row. */
export function reuseAgentChatTurns(next: AgentChatTurnModel[], previous: AgentChatTurnModel[]): AgentChatTurnModel[] {
  const byId = new Map(previous.map((turn) => [turn.id, turn]));
  return next.map((turn) => {
    const old = byId.get(turn.id);
    return old && (Object.keys({ ...old, ...turn }) as (keyof AgentChatTurnModel)[])
      .every((key) => old[key] === turn[key]) ? old : turn;
  });
}
