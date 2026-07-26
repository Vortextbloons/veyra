import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "@/modules/chat/studio/studio-tool";
import { validateStudioRender } from "@/modules/chat/studio/studio-validator";
import { buildStudioDocument } from "@/modules/chat/studio/studio-document-builder";
import {
  copyStudioResponseForFork,
  normalizeStudioResponse,
  STUDIO_MAX_RESPONSE_REVISIONS,
  trimStudioResponseRevisions,
} from "@/modules/chat/studio/studio-normalize";
import { executeStudioCall, executeStudioThemeCall, resetStudioRepairGuard } from "@/modules/chat/studio/studio-runtime";
import { buildProviderTools } from "@/lib/tool-registry";
import { deriveStudioTheme, findLatestStudioTheme, studioThemeCssVariables, studioThemeScopedCss } from "@/modules/chat/studio/studio-theme";
import { parseStudioThemeArguments, STUDIO_THEME_TOOL_NAME } from "@/modules/chat/studio/studio-theme-tool";

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
  setStudioMessageTheme: vi.fn(() => true),
  conversations: [] as Array<{
    id: string;
    experience?: "standard" | "studio";
    messages: Array<{ id: string; role: "assistant" | "user"; studioResponse?: { currentRevision: number } }>;
  }>,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      conversations: mocks.conversations,
      commitStudioResponseRevision: mocks.commitStudioResponseRevision,
      setStudioResponseStatus: mocks.setStudioResponseStatus,
      setStudioMessageTheme: mocks.setStudioMessageTheme,
      setStreamingToolState: vi.fn(),
    }),
  },
}));

const call = (arguments_: Record<string, unknown>) => ({ id: "1", name: STUDIO_RENDER_TOOL_NAME, arguments: arguments_ });
const themeCall = (arguments_: Record<string, unknown>) => ({ id: "theme-1", name: STUDIO_THEME_TOOL_NAME, arguments: arguments_ });

describe("Studio Mode containment", () => {
  beforeEach(() => {
    mocks.commitStudioResponseRevision.mockClear();
    mocks.setStudioResponseStatus.mockClear();
    mocks.setStudioMessageTheme.mockClear();
    mocks.conversations = [{
      id: "conversation-1",
      experience: "studio",
      messages: [{ id: "assistant-1", role: "assistant" }],
    }];
    resetStudioRepairGuard("conversation-1", "assistant-1");
  });

  it("registers both focused Studio tools only when enabled", () => {
    const base = { webSearchEnabled: false, documentToolsEnabled: false, codeExecutionEnabled: false };
    expect(buildProviderTools(base).filter((tool) => tool.function.name.startsWith("studio_"))).toHaveLength(0);
    expect(buildProviderTools({ ...base, studioEnabled: true }).filter((tool) => tool.function.name.startsWith("studio_")).map((tool) => tool.function.name)).toEqual([STUDIO_RENDER_TOOL_NAME, STUDIO_THEME_TOOL_NAME]);
  });

  it("parses exact arguments and trims the title", () => {
    expect(parseStudioArguments(call({ title: "  Board  ", html: "<main>Hi</main>", css: "" }))).toMatchObject({ ok: true, value: { title: "Board" } });
    expect(parseStudioArguments(call({ title: "Interactive", html: "<button>Go</button>", css: "", javascript: "document.querySelector('button')?.focus()" }))).toMatchObject({ ok: true, value: { javascript: "document.querySelector('button')?.focus()" } });
    expect(parseStudioArguments(call({ title: "Board", html: "x", css: "", extra: true })).ok).toBe(false);
  });

  it("keeps studio_render small and rejects theme plumbing", () => {
    expect(parseStudioArguments(call({ title: "Terminal", html: "<main>Ready</main>", css: "", theme: { vibe: "hacker" } })).ok).toBe(false);
  });

  it("derives a complete theme from one short vibe", () => {
    const parsed = parseStudioThemeArguments(themeCall({ vibe: "hacker terminal" }));
    expect(parsed).toMatchObject({ ok: true, value: { vibe: "hacker terminal", intensity: "balanced" } });
    if (!parsed.ok) throw new Error("fixture direction should be valid");
    expect(deriveStudioTheme(parsed.value)).toMatchObject({ font: "mono", effect: "scanlines", accent: "#35ff72" });
  });

  it("keeps advanced theme controls optional and validates overrides", () => {
    expect(parseStudioThemeArguments(themeCall({ vibe: "deep ocean", intensity: "bold", accent: "#00aaff", effect: "glow" })).ok).toBe(true);
    expect(parseStudioThemeArguments(themeCall({ vibe: "unsafe", accent: "url(example.com)" })).ok).toBe(false);
  });

  it("lets the assistant author a complete scoped visual direction", () => {
    const parsed = parseStudioThemeArguments(themeCall({
      vibe: "museum label system",
      font: "serif",
      palette: { background: "#17130f", panel: "#241e18", text: "#f8ead4", accent: "#d7a84a" },
      styles: {
        window: "background-image: linear-gradient(135deg, #17130f, #241e18); letter-spacing: 0.01em",
        userMessage: "border-radius: 2px; box-shadow: 4px 4px 0 #d7a84a",
        composer: "border-top: 2px solid #d7a84a",
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("custom theme should be valid");
    const theme = deriveStudioTheme(parsed.value);
    expect(theme).toMatchObject({ background: "#17130f", panel: "#241e18", font: "serif" });
    expect(studioThemeScopedCss(theme!)).toContain(".studio-theme-user-message");
    expect(studioThemeScopedCss(theme!)).toContain("box-shadow: 4px 4px 0 #d7a84a");
  });

  it("rejects custom declarations that can escape or disable the host UI", () => {
    expect(parseStudioThemeArguments(themeCall({ vibe: "unsafe", styles: { window: "background: url(https://example.com/a.png)" } })).ok).toBe(false);
    expect(parseStudioThemeArguments(themeCall({ vibe: "unsafe", styles: { composer: "display: none" } })).ok).toBe(false);
    expect(parseStudioThemeArguments(themeCall({ vibe: "unsafe", styles: { window: "} body { color: red" } })).ok).toBe(false);
  });

  it("keeps the latest selected Studio theme across later unthemed turns", () => {
    const theme = deriveStudioTheme({ vibe: "hacker", intensity: "balanced" });
    if (!theme) throw new Error("fixture theme should be valid");
    const messages = [
      {
        id: "assistant-themed",
        role: "assistant" as const,
        content: "Theme applied",
        timestamp: 1,
        studioTheme: theme,
      },
      { id: "assistant-text", role: "assistant" as const, content: "Still here", timestamp: 2 },
    ];
    const active = findLatestStudioTheme(messages);
    expect(active?.name).toBe("Hacker");
    expect(studioThemeCssVariables(active!)["--color-panel"]).toBe("#08170e");
  });

  it("uses an explicit default theme call to stop older themes from cascading", () => {
    const theme = deriveStudioTheme({ vibe: "hacker", intensity: "balanced" });
    if (!theme) throw new Error("fixture theme should be valid");
    expect(findLatestStudioTheme([
      { id: "assistant-1", role: "assistant", content: "Styled", timestamp: 1, studioTheme: theme },
      { id: "assistant-2", role: "assistant", content: "Reset", timestamp: 2, studioTheme: null },
    ])).toBeUndefined();
  });

  it("applies a theme without creating a custom response", () => {
    const result = executeStudioThemeCall(themeCall({ vibe: "quiet editorial paper" }), {
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
    });
    expect(mocks.setStudioMessageTheme).toHaveBeenCalledWith(
      "conversation-1",
      "assistant-1",
      expect.objectContaining({ font: "serif", effect: "none" }),
    );
    expect(mocks.commitStudioResponseRevision).not.toHaveBeenCalled();
    expect(result).toContain("Quiet Editorial Paper");
  });

  it("resets the theme with one default vibe", () => {
    const result = executeStudioThemeCall(themeCall({ vibe: "default" }), {
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
    });
    expect(mocks.setStudioMessageTheme).toHaveBeenCalledWith("conversation-1", "assistant-1", null);
    expect(result).toContain("Restored Veyra theme");
  });

  it.runIf(typeof DOMParser !== "undefined")("accepts safe layout primitives", () => {
    const result = validateStudioRender({ html: "<main><details><summary>Plan</summary><table><tbody><tr><td>A</td></tr></tbody></table></details></main>", css: "main{display:grid;background:linear-gradient(#111,#222)}" });
    expect(result.ok).toBe(true);
  });

  it("rejects JavaScript that can terminate the generated script element", () => {
    const result = validateStudioRender({ html: "<main>Safe</main>", css: "", javascript: "const x = '</script><script>alert(1)</script>'" });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "script_termination" }] });
  });

  it.runIf(typeof DOMParser !== "undefined")("commits a valid render to its originating assistant message", () => {
    const result = executeStudioCall(
      call({ title: "Board", html: "<main>Hi</main>", css: "", javascript: "document.body.dataset.ready = 'true'" }),
      { conversationId: "conversation-1", assistantMessageId: "assistant-1" },
    );

    expect(mocks.commitStudioResponseRevision).toHaveBeenCalledWith(
      "conversation-1",
      "assistant-1",
      { title: "Board", html: "<main>Hi</main>", css: "", javascript: "document.body.dataset.ready = 'true'" },
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
    expect(validateStudioRender({ html, css }).ok).toBe(false);
  });

  it("builds a sandbox document with CSP and escaped metadata", () => {
    const document = buildStudioDocument({ title: "</title><script>x</script>", html: "<main>Safe</main>", css: "main{display:grid}", javascript: "document.body.dataset.ready = 'true'" });
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("script-src 'unsafe-inline'");
    expect(document).not.toContain("'unsafe-eval'");
    expect(document).not.toContain("<title></title><script>");
    expect(document).toContain("<body><main>Safe</main><script>");
    expect(document).toContain("document.body.dataset.ready = 'true'");
    expect(document).toContain("veyra-studio-size");
  });

  it("trims response revisions while preserving the current pointer", () => {
    const revisions = Array.from({ length: STUDIO_MAX_RESPONSE_REVISIONS + 2 }, (_, index) => ({
      revision: index + 1,
      title: `r${index + 1}`,
      html: "<main>x</main>",
      css: "",
      createdAt: index + 1,
    }));
    const trimmed = trimStudioResponseRevisions(revisions, 3);
    expect(trimmed).toHaveLength(STUDIO_MAX_RESPONSE_REVISIONS);
    expect(trimmed.some((revision) => revision.revision === 3)).toBe(true);
  });

  it("normalizes malformed response data", () => {
    const normalized = normalizeStudioResponse({
      id: "response-1",
      title: "Board",
      currentRevision: 99,
      latestRevision: 2,
      revisions: [
        { revision: 2, title: "Two", html: "<main>2</main>", css: "", createdAt: 2 },
        { revision: 1, title: "One", html: "<main>1</main>", css: "", createdAt: 1 },
        { revision: 2, title: "Duplicate", html: "<main>dup</main>", css: "", javascript: "document.body.dataset.revision = '2'", createdAt: 3 },
        "bad",
      ],
      status: "ready",
      createdAt: 1,
      updatedAt: 2,
    });
    expect(normalized?.currentRevision).toBe(2);
    expect(normalized?.revisions.map((revision) => revision.title)).toEqual(["One", "Duplicate"]);
    expect(normalized?.revisions[1]?.javascript).toContain("dataset.revision");
  });

  it("copies forked response revisions with new identity", () => {
    const response = normalizeStudioResponse({
      id: "response-1",
      title: "Board",
      currentRevision: 2,
      latestRevision: 2,
      revisions: [
        { revision: 1, title: "One", html: "<main>1</main>", css: "", createdAt: 1 },
        { revision: 2, title: "Two", html: "<main>2</main>", css: "", createdAt: 2 },
      ],
      status: "ready",
      createdAt: 1,
      updatedAt: 2,
    });
    const copied = copyStudioResponseForFork(response);
    expect(copied?.id).not.toBe("response-1");
    expect(copied?.revisions).toHaveLength(2);
  });

  it("permits one repair attempt per chat job", () => {
    const context = { conversationId: "conversation-1", assistantMessageId: "assistant-1" };
    const invalid = call({ title: "Board", html: "<script>x</script>", css: "" });
    expect(executeStudioCall(invalid, context)).toContain("Return one complete corrected payload");
    expect(executeStudioCall(invalid, context)).toContain("custom message failed");
    expect(executeStudioCall(invalid, context)).toContain("ignored");
  });
});
