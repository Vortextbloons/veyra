# Chat Pipeline

Every chat turn runs on the bundled Pi runtime. Veyra no longer ships an
in-browser chat orchestrator: the frontend prepares one job, the Rust side owns
the process, and the transcript is rebuilt from Pi events.

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/use-chat-send.ts` | Builds the `agent_pi` job (prompt, model, reasoning, attachments) |
| `src/hooks/use-chat-pipeline.ts` | Wires provider/model settings into send and new-chat handlers |
| `src/modules/agents/agent-store.ts` | Session lifecycle, event log, steering, stop |
| `src/modules/agents/pi-runtime.ts` | Frontend bridge to the Pi commands (run/stop/steer/check) |
| `src-tauri/src/agents/pi_runner.rs` | Spawns Pi, streams stdout as events |
| `src/modules/agents/agent-chat-turns.ts` | Pure projection of the event log into renderable turns |
| `src/modules/agents/pi-conversation-storage.ts` | Mirrors sessions into the conversation index and snapshot |
| `src/modules/chat/chat-types.ts` | Shared chat/session/UI types |

## Turn Flow

1. `Composer` calls `handleSend` from `useChatSend`.
2. `useChatSend` filters attachments, resolves the model's system prompt,
   reasoning level, and context budget, then enqueues one `agent_pi` job in
   `aiScheduler` (one job per workspace path).
3. Inside the job, LM Studio models are loaded first when needed, then
   `agent-store.startSession` composes the prompt (memory + previous transcript
   under one budget), picks the project scope, and dispatches `runPiAgent`.
4. Pi emits progress; `agent-store` appends `AgentEvent`s to the session.
5. `buildAgentChatTurns` folds those events into user/assistant/tool/reasoning
   turns for `AgentChatTurn`; `AgentActivityCard` renders tool and reasoning
   steps, `MessageBubble` renders prose, and artifacts and interactive answers
   render through their own blocks.
6. On completion, `pi-conversation-storage` mirrors the session into the
   conversation index and writes the encrypted snapshot, and memory extraction
   is queued when background jobs are enabled.

## Stop, Steer, Retry

| Action | Behavior |
|--------|----------|
| Stop | `Composer` `onStop` cancels the queued/active job and calls `stopSession`, which aborts the controller and kills the Pi process |
| Steer | A running session accepts follow-up text through `steerSession` |
| Follow-up | Sending while a session is live continues that session (`continueSessionId`) |

## Ownership Rules

- `agent-store.sessions` is the transcript. Nothing else stores a second copy.
- `chat-store` is an index over that transcript (title, project scope, artifact
  text edits, hydration state). It never constructs messages on its own.
- A conversation belongs to at most one project, and a project's workspace
  directory is mirrored into `settings.agentProjectPath` so path-keyed sessions
  can resolve back to a project for memory and skill scoping.
