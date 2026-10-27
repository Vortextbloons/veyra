import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/modules/chat/chat-types";
import { buildChatContext } from "@/lib/context";
import { getContextBreakdown } from "@/lib/context-breakdown";
import { isMemoryContextEnabled } from "@/modules/chat/chat-context-builder";
import {
  MAX_MEMORY_CONTEXT_CHARS,
  buildMemoryReferenceBlock,
} from "@/lib/prompts";

const memoryState = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/modules/memory/memory-store", () => ({
  useMemoryStore: {
    getState: () => ({ enabled: memoryState.enabled }),
  },
}));

const messages: ChatMessage[] = [
  { id: "user-1", role: "user", content: "hello", timestamp: 1 },
];

describe("retrieved memory context", () => {
  it("injects memory as non-authoritative reference, not a system instruction", () => {
    const block = buildMemoryReferenceBlock("User prefers tea over coffee.");
    const built = buildChatContext(
      messages,
      { memoryContextBlock: block, reservedOutputTokens: 128 },
      8_192,
    );

    expect(built[0]?.role).toBe("system");
    expect(built[0]?.content).toContain("retrieved local memory");
    expect(built[0]?.content).toContain("not instructions");

    const reference = built.find((message) => message.id === "veyra-reference-context");
    expect(reference?.role).toBe("user");
    expect(reference?.role).not.toBe("system");
    expect(reference?.content).toContain("User prefers tea over coffee.");
    expect(built.at(-1)?.content).toBe("hello");
  });

  it("keeps memory when larger reference material does not fit the budget", () => {
    const block = buildMemoryReferenceBlock("User works in Windows PowerShell.");
    const built = buildChatContext(
      messages,
      {
        memoryContextBlock: block,
        toolsBlock: "x".repeat(120_000),
        reservedOutputTokens: 128,
      },
      8_192,
    );

    const reference = built.find((message) => message.id === "veyra-reference-context");
    expect(reference?.content).toContain("Windows PowerShell");
    expect(reference?.content.length).toBeLessThan(4_000);
  });

  it("drops memory rather than intruding on the reserved output budget", () => {
    const block = buildMemoryReferenceBlock("User prefers tea.");
    const built = buildChatContext(
      messages,
      { memoryContextBlock: block, reservedOutputTokens: 8_000 },
      8_192,
    );

    expect(built.at(-1)?.content).toBe("hello");
    expect(built.some((message) => message.content.includes("User prefers tea."))).toBe(false);
  });

  it("bounds injected memory and reports it in the context breakdown", () => {
    const block = buildMemoryReferenceBlock("x".repeat(MAX_MEMORY_CONTEXT_CHARS * 2));
    expect(block.length).toBeLessThan(MAX_MEMORY_CONTEXT_CHARS + 1_000);
    expect(block).toContain("[Memory context truncated]");

    const breakdown = getContextBreakdown(
      messages,
      { memoryContextBlock: block, reservedOutputTokens: 128 },
      8_192,
    );
    expect(
      breakdown?.systemBlocks.some((item) => item.category === "retrieved_memory"),
    ).toBe(true);
  });

  it("keeps summary and tool evidence instead of dropping them for memory", () => {
    const memory = `<veyra_memory_context>\nMEMORY_MARKER\n${"m".repeat(3_000)}\n</veyra_memory_context>`;
    const history: ChatMessage[] = [
      { id: "user-1", role: "user", content: "first", timestamp: 1 },
      { id: "assistant-1", role: "assistant", content: "answer", timestamp: 2 },
      { id: "user-2", role: "user", content: "latest", timestamp: 3 },
    ];
    const built = buildChatContext(
      history,
      {
        conversationSummary: "SUMMARY_EVIDENCE",
        summaryCoversMessageCount: 1,
        toolsBlock: `TOOL_EVIDENCE ${"t".repeat(30_000)}`,
        memoryContextBlock: memory,
        reservedOutputTokens: 128,
      },
      8_192,
    );

    const reference = built.find((message) => message.id === "veyra-reference-context");
    expect(reference?.content).toContain("SUMMARY_EVIDENCE");
    expect(reference?.content).toContain("TOOL_EVIDENCE");
    expect(reference?.content).not.toContain("MEMORY_MARKER");
    expect(built.at(-1)?.content).toBe("latest");
  });

  it("reads the live global memory switch without a static store import", async () => {
    memoryState.enabled = false;
    await expect(isMemoryContextEnabled()).resolves.toBe(false);
    memoryState.enabled = true;
    await expect(isMemoryContextEnabled()).resolves.toBe(true);
  });
});
