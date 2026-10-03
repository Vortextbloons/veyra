import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/modules/chat/chat-types";
import { normalizeStudioEnvironment, parseStudioBridgeMessage, selectedStudioEntry, studioEnvironmentEntries, studioJsonObject } from "@/modules/chat/studio/studio-environment";
import { buildStudioEnvironmentContextBlock, getStudioSystemInstruction } from "@/modules/chat/studio/studio-context";
import { normalizeConversationStudio } from "@/modules/chat/studio/studio-normalize";
import { parseStudioArguments } from "@/modules/chat/studio/studio-tool";

vi.mock("@/lib/conversation-storage", () => ({ loadConversationSnapshot: vi.fn(async () => []), saveConversationSnapshot: vi.fn() }));
import { useChatStore } from "@/stores/chat-store";
import { waitForStudioFeedback } from "@/modules/chat/studio/studio-runtime";

function conversation(): Conversation {
  return {
    id: "studio-test", title: "Costs", experience: "studio", createdAt: 1, updatedAt: 1,
    messages: [{ id: "answer", role: "assistant", content: "", timestamp: 1, studioResponse: {
      id: "view", title: "Costs", currentRevision: 2, latestRevision: 2, status: "ready", createdAt: 1, updatedAt: 2,
      revisions: [1, 2].map((revision) => ({ revision, title: `Costs ${revision}`, html: '<main data-studio-region="chart">Costs</main>', css: "", data: { costs: [10, 20] }, summary: "Two cost categories", createdAt: revision })),
    } }],
    studioEnvironment: { selection: { messageId: "answer", revision: 1 }, state: { selectedCategory: "hosting" }, lastEvent: { name: "chart.select", payload: { value: 10 } } },
  };
}

describe("persistent Studio environment", () => {
  beforeEach(() => useChatStore.setState({ conversations: [conversation()], activeConversationId: "studio-test", streamingBuffer: null }));

  it("uses the selected version as context for ordinary follow-ups", () => {
    const current = conversation();
    expect(selectedStudioEntry(current)?.key).toBe("view:1");
    const context = buildStudioEnvironmentContextBlock(current);
    expect(context).toContain('"view:1"');
    expect(context).toContain("hosting");
    expect(context).toContain("chart.select");
    expect(context).toContain('Named regions: ["chart"]');
    expect(getStudioSystemInstruction()).not.toContain("Most turns need no tool");
    expect(getStudioSystemInstruction("chat", "calm")).toContain("no ambient animation");
  });

  it("keeps sources message-owned through hydration", () => {
    const result = normalizeConversationStudio(conversation());
    expect(result.studioWorkspace).toBeUndefined();
    expect(studioEnvironmentEntries(result.messages)).toHaveLength(2);
    expect(result.messages[0]?.studioResponse?.revisions[0]?.data).toEqual({ costs: [10, 20] });
    expect(result.studioEnvironment?.state).toEqual({ selectedCategory: "hosting" });
  });

  it("preserves an existing undo selection without a data reset", () => {
    const current = conversation();
    current.studioEnvironment = undefined;
    const response = current.messages[0]?.studioResponse;
    if (!response) throw new Error("Missing response");
    response.currentRevision = 1;
    const normalized = normalizeConversationStudio(current);
    expect(selectedStudioEntry(normalized)?.key).toBe("view:1");
    expect(normalized.messages).toHaveLength(1);
  });

  it("retains the selected historical revision at the eight-revision limit", () => {
    for (let index = 0; index < 10; index++) useChatStore.getState().commitStudioResponseRevision("studio-test", "answer", { title: "Costs", html: "<main>Costs</main>", css: "" });
    const current = useChatStore.getState().conversations[0];
    if (!current) throw new Error("Missing conversation");
    expect(current.messages[0]?.studioResponse?.revisions).toHaveLength(8);
    expect(selectedStudioEntry(current)?.key).toBe("view:1");
    useChatStore.getState().selectStudioEnvironment("studio-test");
    expect(selectedStudioEntry(useChatStore.getState().conversations[0] as Conversation)?.revision.revision).toBe(12);
  });

  it("rejects oversized, non-JSON, deep, and prototype-bearing state", () => {
    expect(studioJsonObject({ text: "x".repeat(17_000) })).toBeUndefined();
    expect(studioJsonObject(JSON.parse('{"__proto__":{"polluted":true}}'))).toBeUndefined();
    expect(studioJsonObject({ value: Infinity })).toBeUndefined();
    expect(studioJsonObject({ value: () => 1 })).toBeUndefined();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(studioJsonObject(cycle)).toBeUndefined();
    expect(parseStudioBridgeMessage({ type: "invoke", command: "delete_files" })).toBeUndefined();
    expect(parseStudioBridgeMessage({ type: "event", name: "chart.select", payload: { label: "A" } })).toEqual({ type: "event", name: "chart.select", payload: { label: "A" } });
  });

  it("validates presentation facts independently of source", () => {
    const call = { id: "tool", name: "studio_render", arguments: { title: "Costs", html: "<main>Costs</main>", css: "", data: { values: [10, 20] }, summary: "Costs by category" } };
    expect(parseStudioArguments(call)).toMatchObject({ ok: true, value: { data: { values: [10, 20] } } });
    expect(parseStudioArguments({ ...call, arguments: { ...call.arguments, data: { text: "x".repeat(33_000) } } })).toMatchObject({ ok: false, issues: [{ code: "invalid_data" }] });
  });

  it("ignores detached frame origins and drops stale history pointers", () => {
    useChatStore.getState().updateStudioEnvironment("studio-test", { messageId: "deleted", revision: 1 }, { state: { bad: true } });
    expect(useChatStore.getState().conversations[0]?.studioEnvironment?.state).toEqual({ selectedCategory: "hosting" });
    const current = conversation();
    expect(normalizeStudioEnvironment({ ...current.studioEnvironment, selection: { messageId: "deleted", revision: 1 } }, current.messages)?.selection).toBeUndefined();
    useChatStore.getState().selectStudioEnvironment("studio-test");
    expect(selectedStudioEntry(useChatStore.getState().conversations[0] as Conversation)?.key).toBe("view:2");
  });

  it("copies state and remaps selection when forking", () => {
    const id = useChatStore.getState().forkConversation("studio-test", "answer");
    const fork = useChatStore.getState().conversations.find((item) => item.id === id);
    expect(fork?.studioEnvironment?.selection?.messageId).toBe(fork?.messages[0]?.id);
    expect(fork?.studioEnvironment?.state).toEqual({ selectedCategory: "hosting" });
    expect(fork?.messages[0]?.studioResponse?.id).not.toBe("view");
  });

  it("waits for the exact frame version and releases on cancellation", async () => {
    const waiting = waitForStudioFeedback("studio-test", "answer", 2, undefined, 1000);
    useChatStore.getState().updateStudioEnvironment("studio-test", { messageId: "answer", revision: 1 }, { feedback: { messageId: "answer", revision: 1, status: "ready" } });
    useChatStore.getState().updateStudioEnvironment("studio-test", { messageId: "answer", revision: 2 }, { feedback: { messageId: "answer", revision: 2, status: "error", message: "Chart failed" } });
    expect(await waiting).toEqual({ error: "Chart failed" });
    const controller = new AbortController();
    const cancelled = waitForStudioFeedback("studio-test", "answer", 3, controller.signal, 1000);
    controller.abort();
    expect(await cancelled).toBe("pending");
  });
});
