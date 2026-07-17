# Agents Overview

Optional agents mode that depends on the Pi CLI. Provides "plan" (read-only analysis) and "build" (take action on machine) modes with streaming event output.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/agents/agent-types.ts` | Type definitions |
| `src/modules/agents/agent-store.ts` | Zustand store with session management |
| `src/modules/agents/pi-runtime.ts` | Tauri IPC for Pi CLI |
| `src/modules/agents/components/agents-panel.tsx` | Main agents panel UI |
| `src/modules/agents/components/agent-output-view.tsx` | Live streaming output |
| `src/modules/agents/components/agent-session-list.tsx` | Session sidebar |

## Requirements

- **Pi CLI** must be installed and available on PATH
- The module fails gracefully when Pi CLI is unavailable

## Agent Modes

| Mode | Description |
|------|-------------|
| `plan` | Read-only analysis — examines the codebase and provides recommendations |
| `build` | Action mode — can modify files and execute commands on the machine |

## Session Lifecycle

### 1. Runtime Check
`checkPiAvailable()` verifies Pi CLI is installed on PATH.

### 2. Session Start
1. User selects Plan or Build mode
2. User sets a workspace path (with folder browser)
3. User enters a prompt
4. `startSession()` creates a session and invokes `run_pi_agent` via Tauri

### 3. Session End
- Session status transitions to `completed` or `failed`
- Exit code is recorded
- Events are persisted in the session

### 4. Timeout
Agent runs have a **2-hour timeout**. If the agent doesn't complete within this time, it's automatically stopped.
