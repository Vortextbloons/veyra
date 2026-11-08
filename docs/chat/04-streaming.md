# Chat Streaming

Streaming is event-shaped, not token-shaped. The Pi process writes lines on
stdout, `pi_runner.rs` forwards them, and `agent-store` appends one `AgentEvent`
per line. The UI renders whatever the event log currently contains.

## Stream Types

| Type | Rendered by | Description |
|------|-------------|-------------|
| `output` (Pi / Pi stream) | `MessageBubble` via `TypewriterMarkdown` | Assistant prose, appended to the current turn |
| `reasoning` | `ReasoningBlock` | Chain-of-thought, collapsible, collapsed once complete |
| `tool` | `AgentActivityCard` | Tool name, arguments, and result summary |
| `status` | `AgentChatTurn` | Prompt echo, session started/stopped, failures |
| `error` | `AgentChatTurn` | Error card with the failing command or provider message |

Artifacts and interactive answers arrive as their own events and are rendered by
`ArtifactBlock` / `InteractiveAnswerBlock` on the owning turn.

## Why There Is No Message Buffer

The previous architecture accumulated tokens in `chat-store.streamingBuffer` and
committed them at the end of a turn. That path was removed with the orchestrator:
tokens already arrive as complete event payloads, so buffering would duplicate
the transcript and force a second merge step. The event log is the single source
of truth and is persisted as-is.

## Stop / Cancel

Pressing **Escape** (or the stop button) while `busy` cancels the scheduled job
and calls `agent-store.stopSession`, which aborts the request controller and
terminates the Pi process. The session is marked `stopped` and its events remain
readable.

The composer's primary button follows `resolveComposerAction`
(`src/modules/chat/composer-action.ts`). While a response runs it stays a Send
button when there is text to steer with, and becomes a square **Stop** button
when the composer is empty, so an empty draft never leaves the run uncancellable.

## Scroll Behavior

`AgentOutputView` follows the tail while the user is within 100px of the bottom,
and stops following as soon as they scroll up, so streaming never fights a user
reading earlier turns.
