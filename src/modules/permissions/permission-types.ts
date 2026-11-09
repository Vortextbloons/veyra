import type { PermissionMode } from "@/stores/slices/permissions-slice";

export type { PermissionMode };

/** Which process actually runs the tool, and therefore where the gate runs. */
export type PermissionBridge = "native" | "host";

/**
 * One tool invocation exactly as it was requested.
 *
 * `args` and `cwd` are captured from the execution boundary, not the UI, so an
 * approval can only ever apply to the bytes that will really run.
 */
export type PermissionInvocation = {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  cwd: string;
  bridge: PermissionBridge;
};

export type PermissionRequestState = "reviewing" | "awaiting-user";

/** Result of the isolated Auto-mode reviewer. */
export type AutoReviewSummary = {
  /** `unavailable` is never treated as approval. */
  outcome: "allow" | "deny" | "unavailable";
  reason: string;
  reviewerLabel: string;
};

export type PendingPermissionRequest = PermissionInvocation & {
  /** Stable per invocation: session plus the tool call id Pi assigned. */
  id: string;
  /** Hash of the immutable invocation binding, used to spot repeats only. */
  fingerprint: string;
  requestedAt: number;
  state: PermissionRequestState;
  /** Present when a reviewer has already run for this invocation. */
  review?: AutoReviewSummary;
  /** True when the user must decide because a reviewer is not deciding. */
  needsManualReview: boolean;
  /** Short explanation shown above the buttons. */
  note?: string;
};

export type PermissionAllowSource =
  | "unprotected"
  | "full-access"
  | "user"
  | "reviewer"
  | "recovery";

export type PermissionDenySource =
  | "user"
  | "reviewer"
  | "cancelled"
  | "unavailable"
  | "duplicate"
  | "stale"
  | "disabled";

export type PermissionDecisionSource = PermissionAllowSource | PermissionDenySource;

export type PermissionDecision =
  | {
      outcome: "allow";
      source: PermissionAllowSource;
      requestId: string;
      toolName: string;
      reason?: string;
    }
  | {
      outcome: "deny";
      source: PermissionDenySource;
      requestId: string;
      toolName: string;
      reason: string;
      /** Whether the same exact invocation may still be accepted by hand. */
      manualAcceptAllowed: boolean;
    };

/** Concise, command-free record kept for local decision history. */
export type PermissionDecisionRecord = {
  id: string;
  at: number;
  sessionId: string;
  toolName: string;
  bridge: PermissionBridge;
  outcome: "allow" | "deny";
  source: PermissionDecisionSource;
  reason?: string;
};
