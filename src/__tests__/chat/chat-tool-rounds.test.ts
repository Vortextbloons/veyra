import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/chat/chat-tool-utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/chat/chat-tool-utils")>();
  return {
    ...original,
    registerStreamingToolCalls: vi.fn(),
  };
});

vi.mock("@/modules/chat/studio/studio-runtime", () => ({
  executeStudioCall: vi.fn(() => "studio rendered"),
  executeStudioThemeCall: vi.fn(() => "theme applied"),
}));

import { executeToolRound } from "@/modules/chat/chat-tool-rounds";
import { executeStudioThemeCall } from "@/modules/chat/studio/studio-runtime";

describe("executeToolRound studio theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a compact theme-only call without requiring a Studio render", async () => {
    const result = await executeToolRound(
      [{ id: "theme-1", name: "studio_theme", arguments: { vibe: "hacker terminal" } }],
      {
        conversationId: "conversation-1",
        assistantMessageId: "assistant-1",
        webSearchEnabled: false,
        webSearchAvailability: { available: false },
        codeExecution: { timeoutSecs: 30, pythonPath: null, workspaceRoot: null },
      },
    );

    expect(executeStudioThemeCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "theme-1" }),
      { conversationId: "conversation-1", assistantMessageId: "assistant-1" },
    );
    expect(result.toolResultSections).toContain("theme applied");
  });

  it("applies at most one theme across consecutive tool rounds", async () => {
    const studioThemeCallAttempted = { value: false };
    const context = {
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      studioThemeCallAttempted,
      webSearchEnabled: false,
      webSearchAvailability: { available: false },
      codeExecution: { timeoutSecs: 30, pythonPath: null, workspaceRoot: null },
    };

    await executeToolRound(
      [{ id: "theme-1", name: "studio_theme", arguments: { vibe: "hacker terminal" } }],
      context,
    );
    const second = await executeToolRound(
      [{ id: "theme-2", name: "studio_theme", arguments: { vibe: "synthwave" } }],
      context,
    );

    expect(executeStudioThemeCall).toHaveBeenCalledTimes(1);
    expect(second.toolResultSections.join("\n")).toContain("already chosen");
  });
});
