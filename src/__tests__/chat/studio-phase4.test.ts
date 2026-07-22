import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_STATE } from "@/stores/slices/chat-slice";
import {
  formatStudioDiagnosticsForFeedback,
  getStudioDiagnosticsSnapshot,
  measureStudioArtifactBytes,
  recordStudioArtifactSnapshotSize,
  recordStudioFinalFailure,
  STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES,
} from "@/modules/chat/studio/studio-diagnostics";
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

describe("Studio Phase 4 MVP release", () => {
  it("defaults Studio availability on for supported builds", () => {
    expect(DEFAULT_CHAT_STATE.studioModeEnabled).toBe(true);
    expect(DEFAULT_CHAT_STATE.studioModeAvailabilityDefaultOn).toBe(true);
  });

  it("measures serialized artifact bytes and tracks the 5 MB threshold", () => {
    const bytes = measureStudioArtifactBytes(artifact);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES);

    recordStudioArtifactSnapshotSize({ bytes, revisionCount: 1 });
    recordStudioArtifactSnapshotSize({
      bytes: STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES,
      revisionCount: 20,
    });
    const snapshot = getStudioDiagnosticsSnapshot();
    expect(snapshot.artifactSnapshotBytesMax).toBeGreaterThanOrEqual(STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES);
    expect(snapshot.artifactSnapshotThresholdBreaches).toBeGreaterThan(0);
    expect(snapshot.revisionCountMax).toBeGreaterThanOrEqual(20);
  });

  it("formats opt-in feedback without artifact source", () => {
    recordStudioFinalFailure(["html_script_forbidden"]);
    const feedback = formatStudioDiagnosticsForFeedback();
    expect(feedback).toContain("issueCodes=");
    expect(feedback).toContain("html_script_forbidden");
    expect(feedback).not.toContain("<main>");
    expect(feedback).not.toContain(artifact.html);
  });
});
