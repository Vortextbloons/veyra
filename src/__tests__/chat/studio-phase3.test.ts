import { describe, expect, it } from "vitest";
import {
  shouldIncludeStudioResponseContext,
} from "@/modules/chat/studio/studio-context";
import { getCachedStudioDocument } from "@/modules/chat/studio/studio-document-cache";
import { getStudioDiagnosticsSnapshot, recordStudioRenderSuccess } from "@/modules/chat/studio/studio-diagnostics";
import { STUDIO_SECURITY_FIXTURES } from "@/modules/chat/studio/studio-security-fixtures";
import { validateStudioRender } from "@/modules/chat/studio/studio-validator";

describe("Studio Phase 3 hardening", () => {
  it("includes response context only for qualifying revision prompts", () => {
    expect(shouldIncludeStudioResponseContext("Can you restyle the dashboard?")).toBe(true);
    expect(shouldIncludeStudioResponseContext("What is the capital of France?")).toBe(false);
  });

  it("memoizes built documents by response revision", () => {
    const first = getCachedStudioDocument({
      artifactId: "response-1",
      revision: 1,
      title: "Board",
      html: "<main>Board</main>",
      css: "main{display:grid}",
      reducedMotion: true,
    });
    const second = getCachedStudioDocument({
      artifactId: "response-1",
      revision: 1,
      title: "Board",
      html: "<main>Board</main>",
      css: "main{display:grid}",
      reducedMotion: true,
    });
    expect(first).toBe(second);
    expect(first).toContain("default-src 'none'");
  });

  it("records local diagnostics without source content", () => {
    recordStudioRenderSuccess({
      validationMs: 12,
      htmlBytes: 120,
      cssBytes: 40,
      elementCount: 3,
    });
    const snapshot = getStudioDiagnosticsSnapshot();
    expect(snapshot.successfulRenders).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain("<main>");
  });

  it.runIf(typeof DOMParser !== "undefined")("rejects the security fixture corpus", () => {
    for (const fixture of STUDIO_SECURITY_FIXTURES) {
      expect(validateStudioRender({ html: fixture.html, css: fixture.css }).ok, fixture.name).toBe(false);
    }
  });
});
