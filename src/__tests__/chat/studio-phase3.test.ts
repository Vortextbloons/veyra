import { describe, expect, it } from "vitest";
import {
  buildStudioArtifactContextBlock,
  shouldIncludeStudioArtifactContext,
} from "@/modules/chat/studio/studio-context";
import { getCachedStudioDocument } from "@/modules/chat/studio/studio-document-cache";
import { getStudioDiagnosticsSnapshot, recordStudioRenderSuccess } from "@/modules/chat/studio/studio-diagnostics";
import { STUDIO_SECURITY_FIXTURES } from "@/modules/chat/studio/studio-security-fixtures";
import { validateStudioArtifact } from "@/modules/chat/studio/studio-validator";
import type { StudioArtifact } from "@/modules/chat/studio/studio-types";

const artifact: StudioArtifact = {
  id: "artifact-1",
  title: "Board",
  currentRevision: 1,
  latestRevision: 1,
  revisions: [{
    revision: 1,
    title: "Board",
    html: "<main><h1>Board</h1></main>",
    css: "main{display:grid}",
    createdAt: 1,
    assistantMessageId: "assistant-1",
  }],
  createdAt: 1,
  updatedAt: 1,
};

describe("Studio Phase 3 hardening", () => {
  it("includes artifact context only for qualifying revision prompts", () => {
    expect(shouldIncludeStudioArtifactContext("Can you restyle the dashboard?")).toBe(true);
    expect(shouldIncludeStudioArtifactContext("What is the capital of France?")).toBe(false);
    expect(buildStudioArtifactContextBlock(artifact)).toContain("revision 1");
  });

  it("memoizes built documents by artifact revision", () => {
    const first = getCachedStudioDocument({
      artifactId: "artifact-1",
      revision: 1,
      title: "Board",
      html: "<main>Board</main>",
      css: "main{display:grid}",
      reducedMotion: true,
    });
    const second = getCachedStudioDocument({
      artifactId: "artifact-1",
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
      expect(validateStudioArtifact({ html: fixture.html, css: fixture.css }).ok, fixture.name).toBe(false);
    }
  });
});
