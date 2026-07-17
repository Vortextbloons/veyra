# Agent Session Management

## Persistence

- Sessions are persisted to localStorage (excluding running sessions)
- Running sessions are not persisted (they can't survive app restart)

## Concurrency

- Max **1 running session per project path**
- `chainedStart` prevents concurrent starts for the same workspace
- Starting a new session in the same project stops the previous one

## Operations

| Operation | Description |
|-----------|-------------|
| Start | Create and run a new session |
| Stop | Abort a running session |
| Delete | Remove a session |
| Clear | Clear all sessions |
