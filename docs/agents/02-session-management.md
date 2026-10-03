# Agent session management

## Persistence

Sessions and opened project paths are stored in the existing local agent store. Running sessions are excluded from persistence because their processes cannot survive app restart. Composer drafts stay in memory while the workspace is mounted.

## Scheduling and navigation

The shared AI scheduler queues agent runs, and the store serializes starts. A project with a running session does not start a second run. The composer shows queued/model-preparation state and supports cancellation before the runtime starts.

Switching projects or creating a fresh draft does not stop running work. A selected session restores its project and mode. A fresh session stays empty when project sessions refresh. Queued tasks capture their intended session at dispatch, so subsequent navigation cannot redirect a follow-up or pull the user into another project when work begins.

## Follow-ups

Completed sessions can receive another task. The runtime continues to use ephemeral Pi runs; Veyra supplies a bounded transcript of previous user tasks and agent responses as context for the next task. The recent transcript is capped according to the model context setting and does not create a second on-disk transcript. Tool output and reasoning are not replayed. The agent can inspect files again for current state.

## Operations

| Operation | Description |
|-----------|-------------|
| Open project | Remember a local folder and start a fresh task draft |
| New session | Clear the active session selection without deleting history |
| Run | Create a session or continue the captured selected session |
| Stop | Cancel queued preparation or abort the current project run |
| Delete | Remove a session after confirmation |
