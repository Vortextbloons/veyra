# Agents Module

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
| `src/modules/agents/components/typewriter-markdown.tsx` | Typewriter markdown rendering |

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

### 3. Event Streaming
Events are streamed from Pi CLI via Tauri events:
- `agent://run-finished` — Run completed
- `agent://run-event` — Live event during execution

### 4. Event Types

| Event | Description |
|-------|-------------|
| `status` | Session status change |
| `reasoning` | AI reasoning/thinking |
| `tool` | Tool execution |
| `output` | Text output |
| `error` | Error occurred |
| `result` | Final result |
| `token_update` | Token usage update |

### 5. Live Output Merging
- Reasoning deltas are merged incrementally
- Tool events are merged by `toolCallId` to avoid duplicates
- Output streaming displays text as it arrives
- ANSI escape codes are stripped from output

### 6. Session End
- Session status transitions to `completed` or `failed`
- Exit code is recorded
- Events are persisted in the session

## Session Management

### Persistence
- Sessions are persisted to localStorage (excluding running sessions)
- Running sessions are not persisted (they can't survive app restart)

### Concurrency
- Max **1 running session per project path**
- `chainedStart` prevents concurrent starts for the same workspace
- Starting a new session in the same project stops the previous one

### Operations
| Operation | Description |
|-----------|-------------|
| Start | Create and run a new session |
| Stop | Abort a running session |
| Delete | Remove a session |
| Clear | Clear all sessions |

## UI Components

### Agents Panel
- Mode selector (Plan/Build)
- Workspace path input with folder browser
- Runtime status pill (available/unavailable)
- Session list sidebar
- Output view with live streaming

### Output View
- Typewriter-style markdown rendering
- Expandable reasoning blocks
- Tool call indicators
- Error display

## Key Types

```typescript
type AgentMode = 'plan' | 'build'

type AgentStatus = 
  | 'idle' | 'checking_runtime' | 'ready' | 'running'
  | 'completed' | 'failed' | 'stopped'

interface AgentSession {
  id: string
  runtime: string
  mode: AgentMode
  status: AgentStatus
  projectPath: string
  prompt: string
  model?: string
  events: AgentEvent[]
  exitCode?: number
  contextTokens?: number
}

interface AgentEvent {
  type: 'status' | 'reasoning' | 'tool' | 'output' | 'error' | 'result' | 'token_update'
  data: any
  timestamp: number
}
```

## Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `check_pi_available` | Check if Pi CLI is on PATH |
| `list_pi_sessions` | List Pi sessions |
| `switch_pi_session` | Switch active session |
| `delete_pi_session` | Delete a session |
| `stop_pi_agent` | Stop a running agent |
| `run_pi_agent` | Start an agent run (streams events) |

## Timeout

Agent runs have a **2-hour timeout**. If the agent doesn't complete within this time, it's automatically stopped.
