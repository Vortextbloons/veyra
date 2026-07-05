import type { AgentEvent } from "@/modules/agents/agent-types";

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
