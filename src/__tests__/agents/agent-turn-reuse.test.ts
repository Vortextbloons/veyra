import { describe, expect, it } from "vitest";
import { buildAgentChatTurns, reuseAgentChatTurns } from "@/modules/agents/agent-chat-turns";
import type { AgentEvent } from "@/modules/agents/agent-types";

describe("stable agent turns", () => {
  it("reuses completed turns while replacing changed output", () => {
    const events: AgentEvent[] = [
      { id: "u", type: "status", title: "Prompt", detail: "Question", at: 1 },
      { id: "a", type: "output", title: "Pi stream", detail: "Hello", at: 2 },
    ];
    const previous = buildAgentChatTurns(events, "model");
    const next = reuseAgentChatTurns(buildAgentChatTurns([
      events[0], { ...events[1], detail: "Hello world" },
    ], "model"), previous);
    expect(next[0]).toBe(previous[0]);
    expect(next[1]).not.toBe(previous[1]);
    expect(next[1].content).toBe("Hello world");
    expect(previous[1].content).toBe("Hello");
  });
  it("invalidates changed metadata and removed fields", () => {
    const previous = [{ id: "a", role: "assistant" as const, content: "Text", model: "old" }];
    expect(reuseAgentChatTurns([{ ...previous[0], model: "new" }], previous)[0]).not.toBe(previous[0]);
    expect(reuseAgentChatTurns([{ id: "a", role: "assistant", content: "Text" }], previous)[0]).not.toBe(previous[0]);
  });
});
