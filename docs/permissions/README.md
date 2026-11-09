# Tool Permissions

Protected tool calls pass a single shared lifecycle before they execute:

```
requested -> pending -> allowed | denied -> execution (only when allowed)
```

The gate lives at the actual execution boundary, not in the UI. Nothing about a
pending decision can approve a call on its own.

## Why the gate is inside Pi

Pi's native tools (`bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`) run
inside the bundled Pi process. A frontend-only check would never see them, so
the gate uses Pi's own supported interception point: the `tool_call` extension
event. That event fires after `tool_execution_start` and strictly before the
tool executes; returning `{ block: true, reason }` replaces the execution with an
error tool result, which is also the feedback the model needs to continue.

The extension lives in `src-tauri/src/agents/chat-tools.mjs` and is written to a
temporary file on each run. It answers through Pi's RPC extension UI `input`
channel with the title `veyra_permission`.

Veyra does not implement a second shell executor: Pi keeps owning Bash
execution, streaming, timeouts, process-tree cleanup, and cancellation. The gate
only decides whether the call may start.

## Modes

| Mode | Behavior |
|------|----------|
| Ask (default) | Every protected call waits for `Accept once` or `Deny`. |
| Auto | An isolated reviewer model allows or denies each call. Any doubt blocks it. |
| Full access | Protected calls run immediately. |

Tool enablement and the existing MCP grant system stay authoritative. Full
access does not turn on a disabled tool and does not satisfy an MCP capability
approval.

## Turning Bash on and off

Bash has a switch in two places, and both are authoritative:

| Where | Scope | Effect |
|-------|-------|--------|
| Settings → Permissions → Built-in tools | Every chat | Removes Bash from what Pi is offered, so no permission mode can bring it back |
| Chat settings → Tools | One chat | Removes Bash for that chat only; the chat cannot override the global switch |

The composer control next to the input sets only the permission mode. Tool
on/off switches live in Chat settings and Settings → Permissions so each surface
has one job.

The switch does not just change the UI. The enabled set is passed to Pi as its
`--tools` allowlist, so a disabled tool is never declared to the model and never
executed. If a chat is switched off while a call is already waiting for
approval, that call is denied (`disabled`) rather than left open, and the
permission gate refuses any later call for a disabled tool in every mode.

The default mode lives in Settings → Permissions. A chat can override it next to
the composer; the override is stored per chat and a chat without an override
follows the default.

## Binding

An approval covers exactly one invocation:

- the session id,
- Pi's own tool-call id for that invocation,
- the tool name,
- the exact arguments, and
- the working directory Pi reported.

`src/modules/permissions/permission-policy.ts` builds a canonical binding and a
short fingerprint from those values. The gate re-derives the fingerprint from
the record that was displayed before honoring a decision, so mutating a pending
request cannot smuggle a different command through. A decision is never reused:
a second call, even with identical arguments, needs its own approval.

## Auto reviewer isolation

`src/modules/permissions/permission-reviewer.ts` sends only:

- a fixed review policy constant,
- the tool name,
- the exact arguments or command, and
- execution metadata (working directory, and `bash` as the shell for Bash).

It never includes conversation history, the user's messages, the assistant's
reasoning, previous tool output, project context files, Skills, or memory. The
reviewer request sets `tools: []` and `toolChoice: "none"`, so it has no tools and
cannot execute anything. Command text is framed as untrusted data in the policy.

The reviewer must return compact JSON with `decision` (`allow`/`deny`) and a
non-empty `reason`. Every other outcome — no reviewer configured, missing
provider, offline, provider error, timeout after 30 seconds, or unparsable
output — becomes `unavailable`, which the gate never treats as approval. Those
cases show the approval card with the reason so the user decides manually.

A reviewer denial is final for Auto, but the exact invocation stays held so the
user may still accept that single call by hand.

When the reviewer is a cloud provider, the Settings page states plainly that
command text and arguments are sent to that provider for the decision; LM Studio
keeps the review on the machine.

## Lifecycle details

- **Concurrency**: several calls can be pending at once; each has its own card
  and its own resolver.
- **Cancellation**: aborting a run, stopping a chat, deleting a chat, or starting
  a new turn resolves every waiting call in that chat as denied.
- **Stale approvals**: a decision for a request that is no longer pending (already
  settled, cancelled, or replaced) is inert.
- **Duplicates**: a second request for the same invocation id denies the older one
  before taking over, so two decisions can never race for one execution.
- **Mode changes**: switching a chat to Full access clears the calls waiting in
  that chat. Switching away from Auto while a review is in flight hands that call
  back to the user instead of using the late reviewer answer.
- **Cleanup**: pending requests are never persisted, so a reload cannot resurrect
  an approval.

## Persistence

Settings store the default mode, the protected tool list, and the reviewer
provider/model. The permission store persists per-chat modes and a concise local
decision history (tool name, outcome, source, short reason, timestamp). Command
text and tool arguments are never written to that history, and nothing is sent
anywhere for analytics.

## Shell discovery

Bash is only exposed while a project folder is attached. `check_bash_available`
(`src-tauri/src/agents/shell.rs`) mirrors Pi's own search order — Git Bash in
`Program Files`, then `bash.exe` on `PATH` on Windows — and reports an actionable
message when nothing is found. Veyra never switches to a different shell on its
own.

## Files

| Concern | File |
|---------|------|
| Types | `src/modules/permissions/permission-types.ts` |
| Policy, protected catalogue, binding | `src/modules/permissions/permission-policy.ts` |
| Shared lifecycle store | `src/modules/permissions/permission-store.ts` |
| Isolated reviewer | `src/modules/permissions/permission-reviewer.ts` |
| Approval card | `src/modules/permissions/components/permission-request-card.tsx` |
| Composer mode control | `src/modules/permissions/components/permission-mode-control.tsx` |
| Settings UI | `src/components/settings/permissions-settings.tsx` |
| Settings slice | `src/stores/slices/permissions-slice.ts` |
| Native interception | `src-tauri/src/agents/chat-tools.mjs` |
| Host tool gating | `src/modules/agents/pi-chat-tools.ts` |
| Shell discovery | `src-tauri/src/agents/shell.rs` |

## Known limitations

- A protected Bash call is held inside Pi's `tool_call` handler, so while a card
  is open the turn is paused. Closing the app without deciding leaves nothing
  running; the next launch starts with no pending cards.
- Every native tool call asks the host, including tools that are not protected.
  The host answers unprotected calls immediately, so the cost is one local
  round-trip per call. Snapshotting the protected list inside the Pi process to
  skip that round-trip was rejected: protecting a tool mid-run would then leave
  the already-running process executing it ungated.
- Auto quality depends on the chosen reviewer model. A weak reviewer produces
  weak decisions, and the policy can only describe intent, not prove it.
- Native `bash` remains Pi's Bash. If Pi cannot find a shell, the command fails
  with Pi's error after approval; Veyra reports the missing shell up front but
  does not substitute another interpreter.
- Protected tool coverage is a fixed catalogue. A tool that is neither in the
  catalogue nor MCP-backed cannot be individually protected yet.
