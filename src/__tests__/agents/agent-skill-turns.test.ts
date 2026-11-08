import { describe, expect, it } from "vitest";
import { buildAgentChatTurns, reuseAgentChatTurns } from "@/modules/agents/agent-chat-turns";
import type { AgentEvent } from "@/modules/agents/agent-types";
import type { SkillInvocation } from "@/modules/extensions/extension-types";

const invocation: SkillInvocation = {
  id: "skill.pdf-tools.abcd1234",
  name: "PDF tools",
  slug: "pdf-tools",
  contentHash: "hash-v1",
  instructions: "Read the reference first.",
  scope: "turn",
};

function promptEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return { id: "prompt-1", type: "status", title: "Prompt", detail: "Read report.pdf", at: 1, ...overrides };
}

describe("skill records in chat turns", () => {
  it("attaches the invocation record to the user turn", () => {
    const turns = buildAgentChatTurns([promptEvent({ skillInvocations: [invocation] })]);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      role: "user",
      content: "Read report.pdf",
      skillInvocations: [expect.objectContaining({ id: invocation.id, scope: "turn" })],
    });
  });

  it("leaves a request without Skills unmarked", () => {
    const turns = buildAgentChatTurns([promptEvent()]);
    expect(turns[0].skillInvocations).toBeUndefined();
  });

  it("keeps the record when the same turn list is reused during streaming", () => {
    const first = buildAgentChatTurns([promptEvent({ skillInvocations: [invocation] })]);
    const second = buildAgentChatTurns([promptEvent({ skillInvocations: [invocation] })]);
    const reused = reuseAgentChatTurns(second, first);
    expect(reused[0]).toBe(first[0]);
    expect(reused[0].skillInvocations?.[0].contentHash).toBe("hash-v1");
  });

  it("re-renders when the model loads another Skill mid-run", () => {
    const loaded: SkillInvocation = { ...invocation, id: "skill.notes.bbbb", slug: "notes", name: "Notes", contentHash: "hash-v2" };
    const first = buildAgentChatTurns([promptEvent({ skillInvocations: [invocation] })]);
    const second = buildAgentChatTurns([promptEvent({ skillInvocations: [invocation, loaded] })]);
    const reused = reuseAgentChatTurns(second, first);
    // A longer record must not reuse the stale turn, or the new chip never shows.
    expect(reused[0]).not.toBe(first[0]);
    expect(reused[0].skillInvocations).toHaveLength(2);
  });
});
