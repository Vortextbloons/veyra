import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useSettingsStore } from "@/stores/settings-store";
import type { PermissionMode } from "@/stores/slices/permissions-slice";
import { buildPermissionRequest, enabledNativeTools, isNativeToolEnabled, isToolProtected, permissionModeLabel } from "./permission-policy";
import { reviewInvocation } from "./permission-reviewer";
import type {
  PermissionDecision,
  PermissionDecisionRecord,
  PermissionInvocation,
  PendingPermissionRequest,
} from "./permission-types";

const MAX_HISTORY = 50;

type PendingEntry = {
  /** Fingerprint of the binding captured when the request was created. */
  fingerprint: string;
  sessionId: string;
  bridge: PendingPermissionRequest["bridge"];
  /** Settles the call at the execution boundary. Idempotent. */
  resolve: (decision: PermissionDecision) => void;
  releaseAbort: () => void;
};

/**
 * Live resolvers, kept outside store state so nothing is serialized and a
 * reload can never resurrect an approval.
 */
const entries = new Map<string, PendingEntry>();

type PermissionStore = {
  /** Per-chat mode overrides near the composer; absent means "use the default". */
  chatPermissionModes: Record<string, PermissionMode>;
  /**
   * Built-in tools turned off for one chat, on top of the global switches.
   * A disabled tool is never offered to the model in that chat.
   */
  chatDisabledNativeTools: Record<string, string[]>;
  pending: PendingPermissionRequest[];
  /** Concise local history. Never contains command text or tool arguments. */
  history: PermissionDecisionRecord[];
  setChatPermissionMode: (sessionId: string, mode: PermissionMode | null) => void;
  setChatNativeToolEnabled: (sessionId: string, toolId: string, enabled: boolean) => void;
  acceptOnce: (requestId: string) => void;
  deny: (requestId: string, reason?: string) => void;
  /** Resolves every pending call for a session as denied. */
  cancelSession: (sessionId: string) => void;
  clearHistory: () => void;
  authorize: (invocation: PermissionInvocation, signal?: AbortSignal) => Promise<PermissionDecision>;
};

/** The mode that applies to one chat. */
export function resolvePermissionMode(sessionId: string): PermissionMode {
  const override = usePermissionStore.getState().chatPermissionModes[sessionId];
  return override ?? useSettingsStore.getState().permissionMode;
}

/**
 * Native-tool switches that apply to one chat.
 *
 * The composer toggle writes the per-chat entry; the Settings page writes the
 * global default. Until a chat chooses for itself, it follows the default.
 */
export function resolveNativeToolSwitches(sessionId: string): {
  disabled: string[];
  chatDisabled: string[];
} {
  const settings = useSettingsStore.getState();
  const chatOverrides = usePermissionStore.getState().chatDisabledNativeTools[sessionId] ?? [];
  return { disabled: settings.disabledNativeToolIds, chatDisabled: chatOverrides };
}

/** Whether one built-in tool may run in this chat. */
export function isNativeToolEnabledForChat(sessionId: string, toolName: string): boolean {
  return isNativeToolEnabled(toolName, resolveNativeToolSwitches(sessionId));
}

/** The built-in tools Pi may use in this chat. */
export function enabledNativeToolsForChat(sessionId: string): string[] {
  return enabledNativeTools(resolveNativeToolSwitches(sessionId));
}

type AllowDecision = Extract<PermissionDecision, { outcome: "allow" }>;
type DenyDecision = Extract<PermissionDecision, { outcome: "deny" }>;

function allowDecision(
  request: { id: string; toolName: string },
  source: AllowDecision["source"],
  reason?: string,
): AllowDecision {
  return { outcome: "allow", source, requestId: request.id, toolName: request.toolName, reason };
}

function denyDecision(
  request: { id: string; toolName: string },
  source: DenyDecision["source"],
  reason: string,
): DenyDecision {
  return {
    outcome: "deny",
    source,
    requestId: request.id,
    toolName: request.toolName,
    reason,
    manualAcceptAllowed: false,
  };
}

export const usePermissionStore = create<PermissionStore>()(
  persist(
    (set, get) => {
      /** Records a decision in local history, without command text. */
      const record = (
        request: PendingPermissionRequest,
        entry: PendingEntry,
        decision: PermissionDecision,
      ) => {
        set((state) => ({
          history: [
            {
              id: `${request.id}:${Date.now()}`,
              at: Date.now(),
              sessionId: entry.sessionId,
              toolName: request.toolName,
              bridge: entry.bridge,
              outcome: decision.outcome,
              source: decision.source,
              ...(decision.reason ? { reason: decision.reason.slice(0, 200) } : {}),
            } satisfies PermissionDecisionRecord,
            ...state.history,
          ].slice(0, MAX_HISTORY),
        }));
      };

      /**
       * Settles one waiting call exactly once.
       *
       * The decision is built from the record that was displayed, and the
       * binding is re-checked first: if the recorded arguments no longer match
       * what was approved, the call is denied instead of running.
       */
      const settle = (requestId: string, build: (request: PendingPermissionRequest) => PermissionDecision) => {
        const entry = entries.get(requestId);
        const request = get().pending.find((item) => item.id === requestId);
        if (!entry || !request) return;

        const matches = entry.fingerprint === buildPermissionRequest({ invocation: request }).fingerprint;
        const decision = matches
          ? build(request)
          : denyDecision(request, "stale", "The request changed after it was shown, so it was not run.");

        entries.delete(requestId);
        entry.releaseAbort();
        set((state) => ({ pending: state.pending.filter((item) => item.id !== requestId) }));
        record(request, entry, decision);
        entry.resolve(decision);
      };

      const patchRequest = (requestId: string, patch: Partial<PendingPermissionRequest>) => {
        set((state) => ({
          pending: state.pending.map((item) => (item.id === requestId ? { ...item, ...patch } : item)),
        }));
      };

      return {
        chatPermissionModes: {},
        chatDisabledNativeTools: {},
        pending: [],
        history: [],

        setChatNativeToolEnabled: (sessionId, toolId, enabled) => {
          set((state) => {
            const current = state.chatDisabledNativeTools[sessionId] ?? [];
            const next = enabled
              ? current.filter((id) => id !== toolId)
              : [...new Set([...current, toolId])];
            const chatDisabledNativeTools = { ...state.chatDisabledNativeTools };
            if (next.length) chatDisabledNativeTools[sessionId] = next;
            else delete chatDisabledNativeTools[sessionId];
            return { chatDisabledNativeTools };
          });
          // Turning a tool off makes any call already waiting on it moot: the
          // process that would run it can no longer offer it.
          if (enabled) return;
          for (const request of get().pending.filter(
            (item) => item.sessionId === sessionId && item.toolName === toolId,
          )) {
            settle(request.id, (current) =>
              denyDecision(current, "disabled", "That tool was turned off for this chat."));
          }
        },

        setChatPermissionMode: (sessionId, mode) => {
          set((state) => {
            const chatPermissionModes = { ...state.chatPermissionModes };
            if (mode === null) delete chatPermissionModes[sessionId];
            else chatPermissionModes[sessionId] = mode;
            return { chatPermissionModes };
          });
          // Full access is the user saying "run these now", so calls already
          // waiting in this chat proceed, including ones still being reviewed.
          if (get().chatPermissionModes[sessionId] !== "full") return;
          for (const request of get().pending.filter((item) => item.sessionId === sessionId)) {
            settle(request.id, (current) =>
              allowDecision(current, "full-access", "Full access is on for this chat."));
          }
        },

        acceptOnce: (requestId) => {
          settle(requestId, (request) => allowDecision(request, "user", "Accepted once for this exact call."));
        },

        deny: (requestId, reason) => {
          settle(requestId, (request) => denyDecision(request, "user", reason?.trim() || "Denied by you."));
        },

        cancelSession: (sessionId) => {
          const requests = get().pending.filter((item) => item.sessionId === sessionId);
          for (const request of requests) {
            settle(request.id, (current) => denyDecision(current, "cancelled", "This chat is no longer running."));
          }
        },

        clearHistory: () => set({ history: [] }),

        authorize: async (invocation, signal) => {
          const protectedToolIds = useSettingsStore.getState().protectedToolIds;
          const request = buildPermissionRequest({ invocation });

          // A tool the user turned off is never authorized, in any mode.
          // Pi is not offered a disabled tool, but a process that started
          // before the switch change can still ask, so the gate refuses here.
          if (!isNativeToolEnabled(invocation.toolName, resolveNativeToolSwitches(invocation.sessionId))) {
            return denyDecision(request, "disabled", `${invocation.toolName} is turned off for this chat.`);
          }

          // Unprotected tools pass through the same lifecycle so callers have
          // one code path; nothing about them is queued or recorded.
          if (!isToolProtected(invocation.toolName, protectedToolIds)) {
            return allowDecision(request, "unprotected");
          }
          if (signal?.aborted) {
            return denyDecision(request, "cancelled", "The call was cancelled before it could run.");
          }

          const mode = resolvePermissionMode(invocation.sessionId);
          if (mode === "full") return allowDecision(request, "full-access");

          return new Promise<PermissionDecision>((resolve) => {
            // One live waiter per invocation. A duplicate for the same id is
            // denied before the new one takes over, so two decisions can never
            // race for a single execution.
            if (entries.has(request.id)) {
              settle(request.id, (current) =>
                denyDecision(current, "duplicate", "A newer request replaced this call."));
            }

            let settled = false;
            const onAbort = () => {
              // Cancellation must release a waiting call, never leave it hanging.
              if (settled) return;
              settled = true;
              const current = entries.get(request.id);
              entries.delete(request.id);
              set((state) => ({ pending: state.pending.filter((item) => item.id !== request.id) }));
              current?.releaseAbort();
              signal?.removeEventListener("abort", onAbort);
              resolve(denyDecision(request, "cancelled", "The call was cancelled before it could run."));
            };

            entries.set(request.id, {
              fingerprint: request.fingerprint,
              sessionId: invocation.sessionId,
              bridge: invocation.bridge,
              resolve: (decision) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener("abort", onAbort);
                resolve(decision);
              },
              releaseAbort: () => signal?.removeEventListener("abort", onAbort),
            });
            signal?.addEventListener("abort", onAbort, { once: true });

            const { binding: _binding, ...card } = request;
            set((state) => ({
              pending: [
                ...state.pending,
                {
                  ...card,
                  state: mode === "auto" ? "reviewing" : "awaiting-user",
                  needsManualReview: mode === "auto",
                  note:
                    mode === "auto"
                      ? "Reviewing with the Auto reviewer. Nothing runs until it allows the call."
                      : `${permissionModeLabel(mode)} is on, so this call waits for you.`,
                },
              ],
            }));

            if (mode !== "auto") return;

            void (async () => {
              const review = await reviewInvocation(invocation, signal);
              // The call may have been denied, cancelled, or replaced while the
              // reviewer was thinking; a late answer must not reopen it.
              if (!entries.has(request.id)) return;
              // A mode change during review wins over the reviewer's answer.
              if (resolvePermissionMode(invocation.sessionId) !== "auto") {
                patchRequest(request.id, {
                  state: "awaiting-user",
                  review,
                  needsManualReview: true,
                  note: "Auto is off for this chat now. Decide this exact call yourself.",
                });
                return;
              }
              if (review.outcome === "allow") {
                settle(request.id, (current) => allowDecision(current, "reviewer", review.reason));
                return;
              }
              if (review.outcome === "deny") {
                // A reviewer's denial is final for Auto, but the exact
                // invocation is still held here so you can accept this one
                // call by hand.
                patchRequest(request.id, {
                  state: "awaiting-user",
                  review,
                  needsManualReview: true,
                  note: `${review.reviewerLabel} denied this call. Accept it once for this exact invocation, or deny it so the assistant continues.`,
                });
                return;
              }
              patchRequest(request.id, {
                state: "awaiting-user",
                review,
                needsManualReview: true,
                note: `${review.reason} Nothing ran. Decide this exact call yourself.`,
              });
            })();
          });
        },
      };
    },
    {
      name: "veyra.permissions.v1",
      storage: createJSONStorage(() => localStorage),
      // Pending requests are runtime state: a reload cannot resume a Pi
      // process, so a persisted approval would be stale by construction.
      partialize: (state) => ({
        chatPermissionModes: state.chatPermissionModes,
        // A per-chat tool switch is a durable choice, like the mode override.
        chatDisabledNativeTools: state.chatDisabledNativeTools,
        history: state.history.slice(0, MAX_HISTORY),
      }),
    },
  ),
);
