import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_STATE } from "@/stores/slices/chat-slice";
import {
  formatStudioDiagnosticsForFeedback,
  getStudioDiagnosticsSnapshot,
  measureStudioResponseBytes,
  recordStudioSnapshotSize,
  recordStudioFinalFailure,
  STUDIO_RESPONSE_SNAPSHOT_THRESHOLD_BYTES,
} from "@/modules/chat/studio/studio-diagnostics";
import type { StudioResponse } from "@/modules/chat/studio/studio-types";

const response: StudioResponse = {
  id: "response-1",
  title: "Board",
  currentRevision: 1,
  latestRevision: 1,
  revisions: [{
    revision: 1,
    title: "Board",
    html: "<main><h1>Board</h1></main>",
    css: "main{display:grid}",
    createdAt: 1,
  }],
  status: "ready",
  createdAt: 1,
  updatedAt: 1,
};

describe("Studio Phase 4 MVP release", () => {
  it("defaults Studio availability on for supported builds", () => {
    expect(DEFAULT_CHAT_STATE.studioModeEnabled).toBe(true);
    expect(DEFAULT_CHAT_STATE.studioModeAvailabilityDefaultOn).toBe(true);
  });

  it("measures serialized response bytes and tracks the 5 MB threshold", () => {
    const bytes = measureStudioResponseBytes(response);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(STUDIO_RESPONSE_SNAPSHOT_THRESHOLD_BYTES);

    recordStudioSnapshotSize({ bytes, revisionCount: 1 });
    recordStudioSnapshotSize({
      bytes: STUDIO_RESPONSE_SNAPSHOT_THRESHOLD_BYTES,
      revisionCount: 20,
    });
    const snapshot = getStudioDiagnosticsSnapshot();
    expect(snapshot.responseSnapshotBytesMax).toBeGreaterThanOrEqual(STUDIO_RESPONSE_SNAPSHOT_THRESHOLD_BYTES);
    expect(snapshot.responseSnapshotThresholdBreaches).toBeGreaterThan(0);
    expect(snapshot.revisionCountMax).toBeGreaterThanOrEqual(20);
  });

  it("formats opt-in feedback without response source", () => {
    recordStudioFinalFailure(["html_script_forbidden"]);
    const feedback = formatStudioDiagnosticsForFeedback();
    expect(feedback).toContain("issueCodes=");
    expect(feedback).toContain("html_script_forbidden");
    expect(feedback).not.toContain("<main>");
    expect(feedback).not.toContain(response.revisions[0]!.html);
  });
});
