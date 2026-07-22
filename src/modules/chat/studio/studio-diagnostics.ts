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
};

function logDev(message: string, payload?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info(`[studio] ${message}`, payload ?? {});
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

export function getStudioDiagnosticsSnapshot(): Readonly<StudioDiagnosticsSnapshot> {
  return { ...diagnostics, issueCodes: { ...diagnostics.issueCodes } };
}
