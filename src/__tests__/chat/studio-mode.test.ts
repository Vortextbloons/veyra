import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "@/modules/chat/studio/studio-tool";
import { validateStudioArtifact } from "@/modules/chat/studio/studio-validator";
import { buildStudioDocument } from "@/modules/chat/studio/studio-document-builder";
import {
  copyStudioArtifactForFork,
  normalizeStudioArtifact,
  STUDIO_MAX_REVISIONS,
  trimStudioRevisions,
} from "@/modules/chat/studio/studio-normalize";
import { executeStudioCall, resetStudioRepairGuard } from "@/modules/chat/studio/studio-runtime";
import { buildProviderTools } from "@/lib/tool-registry";

const mocks = vi.hoisted(() => ({
  saveConversationSnapshot: vi.fn(),
  commitStudioResponseRevision: vi.fn(() => ({
    revision: 1,
    title: "Board",
    html: "<main>Hi</main>",
    css: "",
    createdAt: 1,
  })),
  setStudioResponseStatus: vi.fn(() => true),
  conversations: [] as Array<{
    id: string;
    experience?: "standard" | "studio";
    presentationMode?: "standard" | "studio";
    studioArtifact?: unknown;
    messages: Array<{ id: string; role: "assistant" | "user"; studioResponse?: { currentRevision: number } }>;
  }>,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      conversations: mocks.conversations,
      commitStudioResponseRevision: mocks.commitStudioResponseRevision,
      setStudioResponseStatus: mocks.setStudioResponseStatus,
      setStreamingToolState: vi.fn(),
    }),
  },
}));

const call = (arguments_: Record<string, unknown>) => ({ id: "1", name: STUDIO_RENDER_TOOL_NAME, arguments: arguments_ });

describe("Studio Mode containment", () => {
  beforeEach(() => {
    mocks.commitStudioResponseRevision.mockClear();
    mocks.setStudioResponseStatus.mockClear();
    mocks.conversations = [{
      id: "conversation-1",
      experience: "studio",
      presentationMode: "studio",
      messages: [{ id: "assistant-1", role: "assistant" }],
    }];
    resetStudioRepairGuard("conversation-1", "assistant-1");
  });

  it("registers the tool only when enabled", () => {
    const base = { webSearchEnabled: false, documentToolsEnabled: false, codeExecutionEnabled: false };
    expect(buildProviderTools(base).some((tool) => tool.function.name === STUDIO_RENDER_TOOL_NAME)).toBe(false);
    expect(buildProviderTools({ ...base, studioEnabled: true }).some((tool) => tool.function.name === STUDIO_RENDER_TOOL_NAME)).toBe(true);
  });

  it("parses exact arguments and trims the title", () => {
    expect(parseStudioArguments(call({ title: "  Board  ", html: "<main>Hi</main>", css: "" }))).toMatchObject({ ok: true, value: { title: "Board" } });
    expect(parseStudioArguments(call({ title: "Board", html: "x", css: "", extra: true })).ok).toBe(false);
  });

  it.runIf(typeof DOMParser !== "undefined")("accepts safe layout primitives", () => {
    const result = validateStudioArtifact({ html: "<main><details><summary>Plan</summary><table><tbody><tr><td>A</td></tr></tbody></table></details></main>", css: "main{display:grid;background:linear-gradient(#111,#222)}" });
    expect(result.ok).toBe(true);
  });

  it.runIf(typeof DOMParser !== "undefined")("commits a valid render to its originating assistant message", () => {
    const result = executeStudioCall(
      call({ title: "Board", html: "<main>Hi</main>", css: "" }),
      { conversationId: "conversation-1", assistantMessageId: "assistant-1" },
    );

    expect(mocks.commitStudioResponseRevision).toHaveBeenCalledWith(
      "conversation-1",
      "assistant-1",
      { title: "Board", html: "<main>Hi</main>", css: "" },
      { pointerRevisionAtStart: 0 },
    );
    expect(result).toContain("revision 1");
  });

  it.runIf(typeof DOMParser !== "undefined").each([
    ["script", "<script>alert(1)</script>", ""],
    ["handler", "<button onclick=\"alert(1)\">x</button>", ""],
    ["remote", "<img src=\"https://example.com/a.png\">", ""],
    ["css url", "<main>x</main>", "main{background:url(https://example.com/a)}"],
    ["style escape", "<main>x</main>", "</style><script>x</script>"],
  ])("rejects %s", (_name, html, css) => {
    expect(validateStudioArtifact({ html, css }).ok).toBe(false);
  });

  it("builds a sandbox document with CSP and escaped metadata", () => {
    const document = buildStudioDocument({ title: "</title><script>x</script>", html: "<main>Safe</main>", css: "main{display:grid}" });
    expect(document).toContain("default-src 'none'");
    expect(document).not.toContain("<title></title><script>");
    expect(document).toContain("<body><main>Safe</main></body>");
  });

  it("trims revisions while preserving the current pointer", () => {
    const revisions = Array.from({ length: STUDIO_MAX_REVISIONS + 2 }, (_, index) => ({
      revision: index + 1,
      title: `r${index + 1}`,
      html: "<main>x</main>",
      css: "",
      createdAt: index + 1,
      assistantMessageId: `assistant-${index + 1}`,
    }));
    const trimmed = trimStudioRevisions(revisions, 3);
    expect(trimmed).toHaveLength(STUDIO_MAX_REVISIONS);
    expect(trimmed.some((revision) => revision.revision === 3)).toBe(true);
  });

  it("normalizes malformed artifact data", () => {
    const normalized = normalizeStudioArtifact({
      id: "artifact-1",
      title: "Board",
      currentRevision: 99,
      latestRevision: 2,
      revisions: [
        { revision: 2, title: "Two", html: "<main>2</main>", css: "", createdAt: 2, assistantMessageId: "a-2" },
        { revision: 1, title: "One", html: "<main>1</main>", css: "", createdAt: 1, assistantMessageId: "a-1" },
        { revision: 2, title: "Duplicate", html: "<main>dup</main>", css: "", createdAt: 3, assistantMessageId: "a-2" },
        "bad",
      ],
      createdAt: 1,
      updatedAt: 2,
    });
    expect(normalized?.currentRevision).toBe(2);
    expect(normalized?.revisions.map((revision) => revision.title)).toEqual(["One", "Duplicate"]);
  });

  it("copies forked artifact revisions with remapped assistant ids", () => {
    const artifact = normalizeStudioArtifact({
      id: "artifact-1",
      title: "Board",
      currentRevision: 2,
      latestRevision: 2,
      revisions: [
        { revision: 1, title: "One", html: "<main>1</main>", css: "", createdAt: 1, assistantMessageId: "old-a-1" },
        { revision: 2, title: "Two", html: "<main>2</main>", css: "", createdAt: 2, assistantMessageId: "old-a-2" },
      ],
      createdAt: 1,
      updatedAt: 2,
    });
    const copied = copyStudioArtifactForFork(artifact, new Map([
      ["old-a-1", "new-a-1"],
      ["old-a-2", "new-a-2"],
    ]));
    expect(copied?.id).not.toBe("artifact-1");
    expect(copied?.revisions.map((revision) => revision.assistantMessageId)).toEqual(["new-a-1", "new-a-2"]);
  });

  it("permits one repair attempt per chat job", () => {
    const context = { conversationId: "conversation-1", assistantMessageId: "assistant-1" };
    const invalid = call({ title: "Board", html: "<script>x</script>", css: "" });
    expect(executeStudioCall(invalid, context)).toContain("Return one complete corrected payload");
    expect(executeStudioCall(invalid, context)).toContain("Studio generation failed");
    expect(executeStudioCall(invalid, context)).toContain("ignored");
  });
});
