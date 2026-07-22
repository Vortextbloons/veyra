import type { StudioArtifact } from "./studio-types";

/** Spec migration trigger: reconsider separate artifact storage past this size. */
export const STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES = 5 * 1024 * 1024;

type StudioDiagnosticsSnapshot = {
  renderAttempts: number;
  successfulRenders: number;
  repairAttempts: number;
  finalFailures: number;
  validationMsTotal: number;
  issueCodes: Record<string, number>;
  htmlBytesTotal: number;
  cssBytesTotal: number;
  elementCountTotal: number;
  artifactSnapshotBytesMax: number;
  artifactSnapshotThresholdBreaches: number;
  revisionCountMax: number;
};

const diagnostics: StudioDiagnosticsSnapshot = {
  renderAttempts: 0,
  successfulRenders: 0,
  repairAttempts: 0,
  finalFailures: 0,
  validationMsTotal: 0,
  issueCodes: {},
  htmlBytesTotal: 0,
  cssBytesTotal: 0,
  elementCountTotal: 0,
  artifactSnapshotBytesMax: 0,
  artifactSnapshotThresholdBreaches: 0,
  revisionCountMax: 0,
};

function logDev(message: string, payload?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info(`[studio] ${message}`, payload ?? {});
}

export function measureStudioArtifactBytes(artifact: StudioArtifact): number {
  return new TextEncoder().encode(JSON.stringify(artifact)).byteLength;
}

export function recordStudioRenderAttempt(): void {
  diagnostics.renderAttempts += 1;
}

export function recordStudioRenderSuccess(input: {
  validationMs: number;
  htmlBytes: number;
  cssBytes: number;
  elementCount: number;
}): void {
  diagnostics.successfulRenders += 1;
  diagnostics.validationMsTotal += input.validationMs;
  diagnostics.htmlBytesTotal += input.htmlBytes;
  diagnostics.cssBytesTotal += input.cssBytes;
  diagnostics.elementCountTotal += input.elementCount;
  logDev("render success", {
    validationMs: input.validationMs,
    htmlBytes: input.htmlBytes,
    cssBytes: input.cssBytes,
    elementCount: input.elementCount,
  });
}

export function recordStudioRepairAttempt(): void {
  diagnostics.repairAttempts += 1;
}

export function recordStudioFinalFailure(codes: string[]): void {
  diagnostics.finalFailures += 1;
  for (const code of codes) {
    diagnostics.issueCodes[code] = (diagnostics.issueCodes[code] ?? 0) + 1;
  }
  logDev("render failed", { codes });
}

export function recordStudioValidationIssues(codes: string[]): void {
  for (const code of codes) {
    diagnostics.issueCodes[code] = (diagnostics.issueCodes[code] ?? 0) + 1;
  }
}

export function recordStudioArtifactSnapshotSize(input: {
  bytes: number;
  revisionCount: number;
}): void {
  diagnostics.artifactSnapshotBytesMax = Math.max(diagnostics.artifactSnapshotBytesMax, input.bytes);
  diagnostics.revisionCountMax = Math.max(diagnostics.revisionCountMax, input.revisionCount);
  const exceeded = input.bytes >= STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES;
  if (exceeded) {
    diagnostics.artifactSnapshotThresholdBreaches += 1;
  }
  logDev("artifact snapshot size", {
    bytes: input.bytes,
    revisionCount: input.revisionCount,
    thresholdBytes: STUDIO_ARTIFACT_SNAPSHOT_THRESHOLD_BYTES,
    exceededThreshold: exceeded,
  });
}

export function getStudioDiagnosticsSnapshot(): Readonly<StudioDiagnosticsSnapshot> {
  return { ...diagnostics, issueCodes: { ...diagnostics.issueCodes } };
}

/** Redacted local summary suitable for optional user feedback (no artifact source). */
export function formatStudioDiagnosticsForFeedback(): string {
  const snapshot = getStudioDiagnosticsSnapshot();
  const topIssues = Object.entries(snapshot.issueCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
  return [
    "Veyra Studio diagnostics (no artifact source included)",
    `renders=${snapshot.successfulRenders}/${snapshot.renderAttempts}`,
    `repairs=${snapshot.repairAttempts}`,
    `finalFailures=${snapshot.finalFailures}`,
    `artifactBytesMax=${snapshot.artifactSnapshotBytesMax}`,
    `thresholdBreaches=${snapshot.artifactSnapshotThresholdBreaches}`,
    `revisionCountMax=${snapshot.revisionCountMax}`,
    `issueCodes=${topIssues || "none"}`,
  ].join("\n");
}
