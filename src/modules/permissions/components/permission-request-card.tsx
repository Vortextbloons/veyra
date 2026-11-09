import { Loader2, ShieldAlert, ShieldCheck, Terminal } from "lucide-react";
import { usePermissionStore } from "@/modules/permissions/permission-store";
import { describeInvocation } from "@/modules/permissions/permission-policy";
import type { PendingPermissionRequest } from "@/modules/permissions/permission-types";

/** Human labels for the tools the gate can hold. */
const TOOL_LABELS: Record<string, string> = {
  bash: "Run command",
  read: "Read file",
  write: "Write file",
  edit: "Edit file",
  grep: "Search file contents",
  find: "Find files",
  ls: "List directory",
  web_search: "Web search",
  code_execution: "Run code",
  create_artifact: "Create artifact",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? (name.startsWith("mcp__") ? "MCP tool" : name);
}

function RequestCard({ request }: { request: PendingPermissionRequest }) {
  const acceptOnce = usePermissionStore((state) => state.acceptOnce);
  const deny = usePermissionStore((state) => state.deny);
  const reviewing = request.state === "reviewing";
  const detail = describeInvocation(request);
  const isShell = request.toolName === "bash";

  return (
    <section
      aria-label={`Permission request for ${toolLabel(request.toolName)}`}
      className="overflow-hidden rounded-xl border border-amber-400/25 bg-[var(--color-panel)] shadow-lg shadow-black/20"
    >
      <header className="flex items-start gap-2.5 border-b border-white/[0.07] bg-amber-400/[0.05] px-4 py-3">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-white">
            {reviewing ? `Reviewing ${toolLabel(request.toolName).toLowerCase()}` : `${toolLabel(request.toolName)} needs permission`}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {request.note ?? "This call waits for your decision."}
          </p>
        </div>
        {reviewing && <Loader2 aria-hidden className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber-300" />}
      </header>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-dim)]">
          {isShell ? <Terminal aria-hidden className="size-3" /> : null}
          <span>{isShell ? "Command" : "Arguments"}</span>
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-white">
          {detail}
        </pre>

        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-[var(--color-text-dim)]">Tool</dt>
          <dd className="font-mono text-[var(--color-text)]">{request.toolName}</dd>
          <dt className="text-[var(--color-text-dim)]">Folder</dt>
          <dd className="break-all font-mono text-[var(--color-text)]">{request.cwd || "Not reported"}</dd>
          {request.review && (
            <>
              <dt className="text-[var(--color-text-dim)]">Reviewer</dt>
              <dd className="text-[var(--color-text)]">
                {request.review.reviewerLabel}
                {" — "}
                <span className={request.review.outcome === "deny" ? "text-red-300" : "text-[var(--color-text-dim)]"}>
                  {request.review.outcome === "deny" ? "denied" : "could not decide"}
                </span>
              </dd>
              <dt className="text-[var(--color-text-dim)]">Reason</dt>
              <dd className="text-[var(--color-text)]">{request.review.reason}</dd>
            </>
          )}
        </dl>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-2.5">
        <p className="mr-auto text-[10.5px] leading-snug text-[var(--color-text-dim)]">
          Accepting applies to this one call only.
        </p>
        <button
          type="button"
          onClick={() => deny(request.id)}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:border-red-400/40 hover:text-red-200"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => acceptOnce(request.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:brightness-110"
        >
          <ShieldCheck aria-hidden className="size-3.5" />
          Accept once
        </button>
      </footer>
    </section>
  );
}

/**
 * Renders the permission cards for one chat.
 *
 * Several calls can be waiting at once (parallel tool batches), so this keeps
 * them in request order and renders each independently.
 */
export function PermissionRequestCards({ sessionId }: { sessionId: string | null }) {
  const pending = usePermissionStore((state) => state.pending);
  if (!sessionId) return null;
  const visible = pending.filter((request) => request.sessionId === sessionId);
  if (visible.length === 0) return null;
  return (
    <div className="mx-auto mb-3 flex w-full max-w-[1052px] flex-col gap-2" role="status" aria-live="polite">
      {visible.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </div>
  );
}
