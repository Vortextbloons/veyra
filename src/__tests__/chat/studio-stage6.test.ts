import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Studio Stage 6 clean schema cutover", () => {
  it("has no live references to legacy Studio types, fields, or migration functions in production sources", () => {
    const roots = [
      "src/app/components/chat-panel.tsx",
      "src/app/App.tsx",
      "src/modules/chat/components/composer.tsx",
      "src/stores/chat-store.ts",
      "src/modules/chat/chat-orchestrator.ts",
      "src/modules/chat/chat-provider-options.ts",
      "src/modules/chat/chat-types.ts",
      "src/modules/chat/studio/studio-normalize.ts",
      "src/modules/chat/studio/studio-context.ts",
      "src/modules/chat/studio/studio-runtime.ts",
    ];

    const banned: [string, RegExp][] = [
      ["PresentationMode", /\bPresentationMode\b/],
      ["StudioArtifact", /\bStudioArtifact\b/],
      ["StudioRevision", /\bStudioRevision\b/],
      ["StudioRenderState", /\bStudioRenderState\b/],
      ["presentationMode", /\bpresentationMode\b/],
      ["studioArtifact", /\bstudioArtifact\b/],
      ["migrateLegacyStudioArtifactToMessages", /migrateLegacyStudioArtifactToMessages/],
      ["normalizeStudioArtifact", /\bnormalizeStudioArtifact\b/],
      ["reconcileStudioArtifactWithMessages", /reconcileStudioArtifactWithMessages/],
      ["copyStudioArtifactForFork", /\bcopyStudioArtifactForFork\b/],
      ["trimStudioRevisions", /\btrimStudioRevisions\b/],
      ["StudioMigrationStats", /\bStudioMigrationStats\b/],
      ["STUDIO_MAX_REVISIONS", /\bSTUDIO_MAX_REVISIONS\b/],
      ["buildStudioArtifactContextBlock", /buildStudioArtifactContextBlock/],
      ["measureStudioArtifactBytes", /\bmeasureStudioArtifactBytes\b/],
      ["recordStudioArtifactSnapshotSize", /\brecordStudioArtifactSnapshotSize\b/],
      ["STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES", /\bSTUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES\b/],
    ];

    for (const root of roots) {
      const source = readFileSync(resolve(process.cwd(), root), "utf8");
      for (const [name, pattern] of banned) {
        expect(pattern.test(source), `${root} still references ${name}`).toBe(false);
      }
    }
  });

  it("does not import or reference legacy StudioRevision and StudioArtifact types in production sources", () => {
    const roots = [
      "src/modules/chat/chat-types.ts",
      "src/modules/chat/studio/studio-export.ts",
      "src/modules/chat/studio/studio-diagnostics.ts",
      "src/modules/chat/studio/studio-context.ts",
    ];

    for (const root of roots) {
      const source = readFileSync(resolve(process.cwd(), root), "utf8");
      // StudioResponseRevision is the valid message-level type; these are the legacy ones
      expect(/\bStudioRevision\b/.test(source), `${root} still references StudioRevision`).toBe(false);
      expect(/\bStudioArtifact\b/.test(source), `${root} still references StudioArtifact`).toBe(false);
      expect(/\bPresentationMode\b/.test(source), `${root} still references PresentationMode`).toBe(false);
      expect(/\bStudioRenderState\b/.test(source), `${root} still references StudioRenderState`).toBe(false);
    }
  });
});
