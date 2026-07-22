import { describe, expect, it } from "vitest";
import { parseStudioArguments, STUDIO_RENDER_TOOL_NAME } from "@/modules/chat/studio/studio-tool";
import { validateStudioArtifact } from "@/modules/chat/studio/studio-validator";
import { buildStudioDocument } from "@/modules/chat/studio/studio-document-builder";
import { buildProviderTools } from "@/lib/tool-registry";

const call = (arguments_: Record<string, unknown>) => ({ id: "1", name: STUDIO_RENDER_TOOL_NAME, arguments: arguments_ });

describe("Studio Mode containment", () => {
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
});
