# Research Pause and Resume

## Mid-Run Pause

- Research runs can be paused mid-execution
- `AbortController` handles graceful shutdown of active fetches
- Paused runs transition to `paused` status
- State is persisted so runs survive app restarts

## Resume

- Paused runs can be resumed from their last completed phase
- Phase state is tracked per run, enabling precise continuation
- Interrupted runs (app close/crash) are automatically set to `paused` on next launch

## Lifecycle

`research-lifecycle.ts` handles:
- Interrupted run reconciliation on app start
- Graceful shutdown on app close
- Signal handling for clean cancellation
